import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueNames } from '../queue.constants';
import { NotificationMaterializationService } from '@/modules/notifications/services/notification-materialization.service';

@Processor(QueueNames.NOTIFICATIONS, { concurrency: 5 })
export class NotificationsQueueProcessor extends WorkerHost {
  constructor(
    private readonly materialization: NotificationMaterializationService,
  ) {
    super();
  }
  async process(job: Job<{ eventId: string }>) {
    await this.materialization.process(job.data.eventId);
  }
}
