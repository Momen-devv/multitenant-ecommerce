import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConfig } from '@/core/config';
import { ConfigType } from '@nestjs/config';
import { REDIS_CLIENT } from './redis.constants';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { redisOptions } from './redis.config';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (
        configuration: ConfigType<typeof redisConfig>,
        logger: LoggerService,
      ) => {
        const client = new Redis(configuration.url!, redisOptions);

        client.on('connect', () =>
          logger.log('Redis connected', RedisModule.name),
        );
        client.on('error', (err) =>
          logger.error('Redis error', err.stack, RedisModule.name),
        );
        client.on('close', () =>
          logger.log('Redis connection closed', RedisModule.name),
        );
        client.on('reconnecting', () =>
          logger.log('Redis reconnecting...', RedisModule.name),
        );
        client.on('end', () =>
          logger.log('Redis connection ended', RedisModule.name),
        );

        return client;
      },
      inject: [redisConfig.KEY, LoggerService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
