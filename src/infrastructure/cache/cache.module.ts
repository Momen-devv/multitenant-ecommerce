import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConfig } from '@/core/config';
import { ConfigType } from '@nestjs/config';
import { CACHE_CLIENT } from './cache.constants';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { redisOptions } from './redis.config';
import { RedisService } from './redis.service';
import { CACHE_SERVICE } from '@/common/constants/injection-tokens.constants';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_CLIENT,
      useFactory: (
        configuration: ConfigType<typeof redisConfig>,
        logger: LoggerService,
      ) => {
        const client = new Redis(configuration.url, redisOptions);

        client.on('connect', () =>
          logger.log('Redis connected', CacheModule.name),
        );
        client.on('error', (err) =>
          logger.error('Redis error', err.stack, CacheModule.name),
        );
        client.on('close', () =>
          logger.log('Redis connection closed', CacheModule.name),
        );
        client.on('reconnecting', () =>
          logger.log('Redis reconnecting...', CacheModule.name),
        );
        client.on('end', () =>
          logger.log('Redis connection ended', CacheModule.name),
        );

        return client;
      },
      inject: [redisConfig.KEY, LoggerService],
    },
    {
      provide: CACHE_SERVICE,
      useClass: RedisService,
    },
  ],
  exports: [CACHE_SERVICE, CACHE_CLIENT],
})
export class CacheModule {}
