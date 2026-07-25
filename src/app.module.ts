import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule, AuthGuard } from '@thallesp/nestjs-better-auth';
import { CoreModule } from '@/core/core.module';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { createAuth } from '@/core/auth/auth';

import { AllExceptionsFilter } from '@/common/filters/http-exception.filter';
import { UsersModule } from './modules/users/users.module';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  RouterModule,
} from '@nestjs/core';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';

@Module({
  imports: [
    RouterModule.register([{ path: 'users', module: UsersModule }]),

    CoreModule,
    InfrastructureModule,
    AuthModule.forRootAsync({
      imports: [InfrastructureModule],
      inject: [EmailQueueService],
      useFactory: (emailQueue: EmailQueueService) => ({
        auth: createAuth({ emailQueue }),
        enableRawBodyParser: true,
      }),
    }),
    UsersModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('/{*path}');
  }
}
