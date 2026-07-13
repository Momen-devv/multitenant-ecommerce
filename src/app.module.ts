import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { CoreModule } from '@/core/core.module';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { createAuth } from '@/core/auth/auth';

import { AllExceptionsFilter } from '@/common/filters/http-exception.filter';
import { UsersModule } from './modules/users/users.module';
import { APP_FILTER, RouterModule } from '@nestjs/core';

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
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
