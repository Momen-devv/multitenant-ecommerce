import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { CoreModule } from '@/core/core.module';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { createAuth } from '@/core/auth/auth';

import { AllExceptionsFilter } from '@/common/filters/http-exception.filter';

@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [InfrastructureModule],
      inject: [LoggerService, EmailQueueService],
      useFactory: (logger: LoggerService, emailQueue: EmailQueueService) => ({
        auth: createAuth({ logger, emailQueue }),
        enableRawBodyParser: true,
      }),
    }),
    CoreModule,
    InfrastructureModule,
  ],
  controllers: [],
  providers: [
    {
      provide: 'APP_FILTER',
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
