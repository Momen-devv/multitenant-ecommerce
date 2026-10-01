import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { sha256Hex } from '@/common/utils';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { CACHE_CLIENT } from '@/infrastructure/cache/cache.constants';
import { notificationConfig } from '@/core/config';
import Redis from 'ioredis';

const LEASE_MS = 75_000;

const acquire = `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3]); redis.call('PEXPIRE', KEYS[1], 75000); return 1`;

const renew = `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if not redis.call('ZSCORE', KEYS[1], ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3]); redis.call('PEXPIRE', KEYS[1], 75000); return 1`;

export type NotificationStreamConnection = {
  id: string;
  key: string;
};

/** Owns the Redis-backed connection limit and lease lifecycle for notification streams. */
@Injectable()
export class NotificationStreamConnectionsService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    @Inject(CACHE_CLIENT) redis: Redis,
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
  ) {
    this.redis = redis.duplicate({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 5000,
      socketTimeout: 0,
    });
    this.redis.on('error', () => undefined);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async acquire(userId: string): Promise<NotificationStreamConnection | null> {
    const connection = {
      id: randomUUID(),
      key: `notifications:connections:${sha256Hex(userId)}`,
    };
    const accepted = await this.redis.eval(
      acquire,
      1,
      connection.key,
      Date.now(),
      Date.now() + LEASE_MS,
      connection.id,
      this.config.streamMaxConnections,
    );

    return accepted === 1 ? connection : null;
  }

  async renew(connection: NotificationStreamConnection): Promise<boolean> {
    const renewed = await this.redis.eval(
      renew,
      1,
      connection.key,
      Date.now(),
      Date.now() + LEASE_MS,
      connection.id,
    );
    return renewed === 1;
  }

  async release(connection: NotificationStreamConnection): Promise<void> {
    await this.redis.zrem(connection.key, connection.id).catch(() => undefined);
  }
}
