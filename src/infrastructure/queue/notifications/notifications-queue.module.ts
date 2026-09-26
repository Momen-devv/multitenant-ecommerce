import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames } from '../queue.constants';
import { NotificationsQueueService } from './notifications-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.NOTIFICATIONS })],
  providers: [NotificationsQueueService],
  exports: [NotificationsQueueService],
})
export class NotificationsQueueModule {}
