import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueNames } from '../queue.constants';
import { ConnectWebhookQueueService } from './connect-webhook-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.CONNECT_WEBHOOK })],
  providers: [ConnectWebhookQueueService],
  exports: [ConnectWebhookQueueService],
})
export class ConnectWebhookQueueModule {}
