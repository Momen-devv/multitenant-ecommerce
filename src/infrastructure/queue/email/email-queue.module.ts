import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';
import { QueueNames } from '../queue.constants';
import { BullModule } from '@nestjs/bullmq';
import { MailModule } from '@/infrastructure/mail/mail.module';
import { EmailQueueProcessor } from './email-queue.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.EMAIL }), MailModule],
  providers: [EmailQueueService, EmailQueueProcessor],
  exports: [EmailQueueService],
})
export class EmailQueueModule {}
