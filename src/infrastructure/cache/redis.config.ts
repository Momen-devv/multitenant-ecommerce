import { RedisOptions } from 'ioredis/built/redis/RedisOptions';

export const redisOptions: RedisOptions = {
  connectTimeout: 10000,
  commandTimeout: 5000,
  socketTimeout: 10000,
  keepAlive: 30000,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  connectionName: 'app-redis',

  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

export const bullRedisOptions: RedisOptions = {
  connectTimeout: 10000,
  socketTimeout: 10000,
  keepAlive: 30000,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectionName: 'bullmq-redis',
};
