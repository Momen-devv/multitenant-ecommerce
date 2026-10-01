import type { ConfigType } from '@nestjs/config';
import { createHash } from 'node:crypto';
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
import { notificationConfig } from '@/core/config';
import Redis from 'ioredis';
import type { Request } from 'express';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject, Subscription } from 'rxjs';
import {
  NotificationStreamConnectionsService,
  type NotificationStreamConnection,
} from './notification-stream-connections.service';

const CHANNEL = 'notifications:inbox.changed';
const REVOKED = 'notifications:session.revoked';

@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly hints = new Subject<string>();
  private readonly revocations = new Subject<string>();
  private readonly closeConnections = new Set<() => void>();
  get connectionCount() {
    return this.closeConnections.size;
  }
  constructor(
    @Inject(CACHE_CLIENT) redis: Redis,
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
    private readonly auth: AuthService<Auth>,
    private readonly connections: NotificationStreamConnectionsService,
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
    return true;
  }
  async open(
    request: Request,
    session: CurrentUser,
  ): Promise<Observable<MessageEvent>> {
    if (!this.config.streamEnabled || !this.config.inboxEnabled)
      throw new HttpException('Live stream temporarily unavailable', 503);
    if (
      request.headers.origin &&
      !this.config.trustedOrigins.includes(request.headers.origin)
    )
      throw new ForbiddenException('Origin is not allowed');
    if (!(await this.valid(request, session)))
      throw new UnauthorizedException();
    const userId = session.user.id;
    let connection: NotificationStreamConnection | null;
    try {
      connection = await this.connections.acquire(userId);
    } catch {
      throw new HttpException('Live stream temporarily unavailable', 503);
    }
    if (!connection) throw new HttpException('Too many live connections', 429);
    if (request.destroyed) {
      await this.connections.release(connection);
      return new Observable((subscriber) => subscriber.complete());
    }

    return new Observable<MessageEvent>((stream) => {
      let closed = false;
      let pending = false;
      let checking = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
      const subscriptions = new Subscription();
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat !== undefined) clearInterval(heartbeat);
        subscriptions.unsubscribe();
        this.closeConnections.delete(close);
        void this.connections.release(connection);
        stream.complete();
      };
      this.closeConnections.add(close);
      if (request.destroyed) {
        close();
        return close;
      }
      subscriptions.add(
        this.hints.subscribe((value) => {
          if (value === userId) pending = true;
        }),
      );
      const tokenHash = createHash('sha256')
        .update(session.session.token)
        .digest('hex');
      subscriptions.add(
        this.revocations.subscribe((value) => {
          if (value === tokenHash) close();
        }),
      );
      stream.next({ type: 'inbox.changed', data: {} });
      if (closed) return close;
      heartbeat = setInterval(() => {
        if (checking || closed) return;
        checking = true;
        void (async () => {
          try {
            if (
              !(await this.connections.renew(connection)) ||
              !(await this.valid(request, session))
            ) {
              close();
              return;
            }
            if (pending) {
              pending = false;
              stream.next({ type: 'inbox.changed', data: {} });
            } else stream.next({ type: 'heartbeat', data: {} });
          } catch {
            close();
          } finally {
            checking = false;
          }
        })();
      }, this.config.streamHeartbeatMs);
      heartbeat.unref();

      return close;
    });
  }
}
