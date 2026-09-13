import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SmsModule } from '@/infrastructure/sms/sms.module';
import { QueueNames } from '../queue.constants';
import { SmsQueueProcessor } from './sms-queue.processor';
import { SmsQueueService } from './sms-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.SMS }), SmsModule],
  providers: [SmsQueueService, SmsQueueProcessor],
  exports: [SmsQueueService],
})
export class SmsQueueModule {}
