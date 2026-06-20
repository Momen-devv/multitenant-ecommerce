import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import redisConfig from '@/core/config/redis.config';
import { ConfigType } from '@nestjs/config';
import { EmailQueueModule } from './email/email-queue.module';
import { bullRedisOptions } from '@/infrastructure/redis/redis.config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [redisConfig.KEY],
      useFactory: (configuration: ConfigType<typeof redisConfig>) => ({
        connection: {
          url: configuration.url,
          connectTimeout: 10000,
          keepAlive: 30000,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          enableOfflineQueue: true,
          attempts: 4,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
        ...bullRedisOptions,
      }),
    }),
    EmailQueueModule,
  ],
  exports: [EmailQueueModule],
})
export class QueueModule {}
