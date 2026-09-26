import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  HttpException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from '@/core/auth/auth';
import type { CurrentUser } from '@/core/auth/auth.types';
import { CACHE_CLIENT } from '@/infrastructure/cache/cache.constants';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { Request, Response } from 'express';
import { Subject } from 'rxjs';

const CHANNEL = 'notifications:inbox.changed';
const REVOKED = 'notifications:session.revoked';
const LEASE_MS = 75_000;
const acquire = `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3]); redis.call('PEXPIRE', KEYS[1], 75000); return 1`;
const renew = `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if not redis.call('ZSCORE', KEYS[1], ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3]); redis.call('PEXPIRE', KEYS[1], 75000); return 1`;

@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly hints = new Subject<string>();
  private readonly revocations = new Subject<string>();
  private readonly closeConnections = new Set<() => void>();
  constructor(
    @Inject(CACHE_CLIENT) redis: Redis,
    private readonly config: ConfigService,
    private readonly auth: AuthService<Auth>,
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {
    const options = {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 5000,
      socketTimeout: 0,
    };
    this.publisher = redis.duplicate(options);
    this.subscriber = redis.duplicate(options);
    this.publisher.on('error', () => undefined);
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('close', () => {
      for (const close of this.closeConnections) close();
    });
    this.subscriber.on('message', (channel, value) => {
      if (channel === CHANNEL) this.hints.next(value);
      if (channel === REVOKED) this.revocations.next(value);
    });
    // ioredis automatically restores subscriptions on reconnect.
    this.subscriber.on('ready', () => {
      void this.subscriber.subscribe(CHANNEL, REVOKED).catch(() => undefined);
    });
  }
  onModuleDestroy() {
    for (const close of this.closeConnections) close();
    this.hints.complete();
    this.revocations.complete();
    this.publisher.disconnect();
    this.subscriber.disconnect();
  }
  async publish(userId: string) {
    // Publication is deliberately independent of committed inbox work.
    try {
      await this.publisher.publish(CHANNEL, userId);
    } catch {
      /* Refetch repairs missed hints. */
    }
  }
  private async valid(request: Request, session: CurrentUser) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.checkSession(request, session),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 10_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private async checkSession(request: Request, session: CurrentUser) {
    const current = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true },
    });
    if (
      !current ||
      current.session.id !== session.session.id ||
      current.user.id !== session.user.id
    )
      return false;
    // Secondary storage can contain an old User snapshot: consult current account state.
    const result = await this.db
      .execute(sql`select 1 from "user" where id = ${session.user.id}
      and is_active = true and (banned is not true or ban_expires <= now())`);
    return result.rows.length > 0;
  }
  async open(request: Request, response: Response, session: CurrentUser) {
    const origins = (process.env.TRUSTED_ORIGINS ?? process.env.BASE_URL ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (request.headers.origin && !origins.includes(request.headers.origin))
      throw new ForbiddenException('Origin is not allowed');
    if (!(await this.valid(request, session)))
      throw new UnauthorizedException();
    const userId = session.user.id;
    const id = randomUUID();
    const key = `notifications:connections:${createHash('sha256').update(userId).digest('hex')}`;
    if (this.subscriber.status !== 'ready')
      throw new HttpException('Live stream temporarily unavailable', 503);
    let accepted: unknown;
    try {
      accepted = await this.publisher.eval(
        acquire,
        1,
        key,
        Date.now(),
        Date.now() + LEASE_MS,
        id,
        this.config.get<number>('NOTIFICATION_STREAM_MAX_CONNECTIONS', 5),
      );
    } catch {
      throw new HttpException('Live stream temporarily unavailable', 503);
    }
    if (accepted !== 1)
      throw new HttpException('Too many live connections', 429);
    let closed = false;
    let pending = false;
    let checking = false;
    const heartbeat: { timer?: ReturnType<typeof setInterval> } = {};
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat.timer);
      hints.unsubscribe();
      revoked.unsubscribe();
      this.closeConnections.delete(close);
      response.off('close', close);
      response.off('error', close);
      void this.publisher.zrem(key, id).catch(() => undefined);
      response.end();
    };
    const write = (frame: string) => {
      // Never queue output for a slow client; one failed write closes it.
      try {
        if (!closed && !response.write(frame)) close();
      } catch {
        close();
      }
    };
    const hints = this.hints.subscribe((value) => {
      if (value === userId) pending = true;
    });
    const tokenHash = createHash('sha256')
      .update(session.session.token)
      .digest('hex');
    const revoked = this.revocations.subscribe((value) => {
      if (value === tokenHash) close();
    });
    this.closeConnections.add(close);
    response.on('close', close);
    response.on('error', close);
    if (response.destroyed) {
      close();
      return;
    }
    response.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    write('event: inbox.changed\ndata: {}\n\n');
    heartbeat.timer = setInterval(
      () => {
        if (checking || closed) return;
        checking = true;
        void (async () => {
          try {
            const alive = await this.publisher.eval(
              renew,
              1,
              key,
              Date.now(),
              Date.now() + LEASE_MS,
              id,
            );
            if (alive !== 1 || !(await this.valid(request, session))) {
              close();
              return;
            }
            if (pending) {
              pending = false;
              write('event: inbox.changed\ndata: {}\n\n');
            } else write(': heartbeat\n\n');
          } catch {
            close();
          } finally {
            checking = false;
          }
        })();
      },
      this.config.get<number>('NOTIFICATION_STREAM_HEARTBEAT_MS', 25_000),
    );
    heartbeat.timer.unref();
    if (closed) clearInterval(heartbeat.timer);
  }
}
