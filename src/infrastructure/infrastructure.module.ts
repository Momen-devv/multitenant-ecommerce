import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [DatabaseModule, LoggerModule, RedisModule, MailModule, QueueModule],
  controllers: [],
  providers: [],
})
export class InfrastructureModule {}
