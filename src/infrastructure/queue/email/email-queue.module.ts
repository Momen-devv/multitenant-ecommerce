import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';
import { QueueNames } from '../queue.constants';
import { BullModule } from '@nestjs/bullmq';
import { MailModule } from '@/infrastructure/mail/mail.module';
import { EmailQueueProcessor } from './email-queue.processor';
import { OrderEmailDeliveryRepository } from '@/modules/orders/repos/order-email-delivery.repository';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.EMAIL }), MailModule],
  providers: [
    EmailQueueService,
    EmailQueueProcessor,
    OrderEmailDeliveryRepository,
  ],
  exports: [EmailQueueService, OrderEmailDeliveryRepository],
})
export class EmailQueueModule {}
