import { EndpointCacheControls } from './endpoint-cache-controls.service';
import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConfig } from '@/core/config';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { CACHE_CLIENT, ENDPOINT_CACHE_CLIENT } from './cache.constants';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { ReadCacheService } from './read-cache.service';
import { CacheNamespaceService } from './cache-namespace.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { redisOptions } from './redis.config';
import { RedisService } from './redis.service';
import { CACHE_SERVICE } from '@/common/constants/injection-tokens.constants';

@Global()
@Module({
  imports: [ConfigModule.forFeature(endpointCacheConfig)],
  providers: [
    {
      provide: ENDPOINT_CACHE_CLIENT,
      inject: [endpointCacheConfig.KEY],
      useFactory: (config: ConfigType<typeof endpointCacheConfig>) => {
        if (!config.enabled || !config.url) return null;
        try {
          const client = new Redis(config.url, {
            lazyConnect: true,
            commandTimeout: config.commandTimeoutMs,
            connectTimeout: config.commandTimeoutMs,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 0,
            autoResendUnfulfilledCommands: false,
            autoResubscribe: false,
            reconnectOnError: () => false,
            retryStrategy: (attempt) => Math.min(attempt * 100, 5000),
          });
          // Errors are sampled at operation boundaries without exposing URLs.
          client.on('error', () => undefined);
          return client;
        } catch {
          return null;
        }
      },
    },
    EndpointCacheControls,
    CacheNamespaceService,
    ReadCacheService,
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
  exports: [CACHE_SERVICE, CACHE_CLIENT, ReadCacheService],
})
export class CacheModule {}
