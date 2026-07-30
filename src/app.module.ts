import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  RouterModule,
} from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AuthModule, AuthGuard } from '@thallesp/nestjs-better-auth';
import type { Redis } from 'ioredis';

// Core / Infrastructure
import { CoreModule } from '@/core/core.module';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';
import { RedisModule } from '@/infrastructure/redis/redis.module';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { createAuth } from '@/core/auth/auth';
import { DATABASE } from './common/constants/injection-tokens.constants';

// Common
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from '@/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';

// Feature modules
import { UsersModule } from './modules/users/users.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as Schema from '@/infrastructure/database/schema/schema';

@Module({
  imports: [
    InfrastructureModule,
    CommonModule,
    CoreModule,

    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redisClient: Redis) => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: 60 }],
        storage: new ThrottlerStorageRedisService(redisClient),
      }),
    }),

    AuthModule.forRootAsync({
      imports: [InfrastructureModule],
      inject: [EmailQueueService, REDIS_CLIENT, DATABASE],
      useFactory: (
        emailQueue: EmailQueueService,
        redisClient: Redis,
        database: NodePgDatabase<typeof Schema>,
      ) => ({
        auth: createAuth({
          emailQueue,
          redis: redisClient,
          database: database,
        }),
        bodyParser: { rawBody: true },
      }),
    }),

    // Feature modules
    UsersModule,

    RouterModule.register([{ path: 'users', module: UsersModule }]),
  ],

  controllers: [],

  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('/{*path}');
  }
}
