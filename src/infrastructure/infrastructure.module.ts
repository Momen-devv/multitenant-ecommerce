import { Module } from '@nestjs/common';
import { CacheModule } from './cache/cache.module';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { SmsModule } from './sms/sms.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { PaymentInfrastructureModule } from './payments/payments.module';

@Module({
  imports: [
    DatabaseModule,
    LoggerModule,
    CacheModule,
    MailModule,
    SmsModule,
    QueueModule,
    StorageModule,
    PaymentInfrastructureModule,
  ],
  controllers: [],
  providers: [],
  exports: [PaymentInfrastructureModule],
})
export class InfrastructureModule {}
