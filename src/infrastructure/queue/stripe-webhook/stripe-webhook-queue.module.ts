import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueNames } from '../queue.constants';
import { StripeWebhookQueueService } from './stripe-webhook-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.STRIPE_WEBHOOK })],
  providers: [StripeWebhookQueueService],
  exports: [StripeWebhookQueueService],
})
export class StripeWebhookQueueModule {}
