import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  RouterModule,
} from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { Redis } from 'ioredis';

// Core / Infrastructure
import { CoreModule } from '@/core/core.module';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';
import { CacheModule } from '@/infrastructure/cache/cache.module';
import { CACHE_CLIENT } from '@/infrastructure/cache/cache.constants';

// Common
import { AllExceptionsFilter } from '@/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import { ActiveUserGuard } from './common/guards/active-user.guard';
import type { ThrottledRequest } from '@/common/types/request.types';
import { Environment } from '@/common/enums';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { StoresModule } from './modules/stores/stores.module';
import { PlansModule } from './modules/plans/plans.module';
import { BillingModule } from './modules/billing/billing.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ProductsModule } from './modules/products/products.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CartsModule } from './modules/carts/carts.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    InfrastructureModule,
    CoreModule,

    ThrottlerModule.forRootAsync({
      imports: [CacheModule],
      inject: [CACHE_CLIENT],
      useFactory: (redisClient: Redis) => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: 60 }],
        skipIf: () => process.env.NODE_ENV === Environment.Development,
        storage: new ThrottlerStorageRedisService(redisClient),
        getTracker: (request) => {
          const { session, ip } = request as ThrottledRequest;
          return session?.user.id ?? ip;
        },
      }),
    }),
    ScheduleModule.forRootAsync({
      imports: [CoreModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<string>('APPLICATION_ROLE') !== 'api';
        return { cronJobs: enabled, intervals: enabled, timeouts: enabled };
      },
    }),
    EventEmitterModule.forRoot(),

    // Feature modules
    AuthModule,
    HealthModule,
    UsersModule,
    StoresModule,
    PlansModule,
    BillingModule,
    SubscriptionsModule,
    ProductsModule,
    CommentsModule,
    CategoriesModule,
    PaymentsModule,
    CheckoutModule,
    CartsModule,
    OrdersModule,
    AssistantModule,
    NotificationsModule,

    RouterModule.register([{ path: 'health', module: HealthModule }]),
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
      useClass: ActiveUserGuard,
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
