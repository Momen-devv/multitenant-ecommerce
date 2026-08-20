import { Module } from '@nestjs/common';
import { CacheModule } from './cache/cache.module';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    DatabaseModule,
    LoggerModule,
    CacheModule,
    MailModule,
    QueueModule,
    StorageModule,
  ],
  controllers: [],
  providers: [],
})
export class InfrastructureModule {}
