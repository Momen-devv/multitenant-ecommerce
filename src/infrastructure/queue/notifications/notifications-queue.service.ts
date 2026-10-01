import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '../queue.constants';

@Injectable()
export class NotificationsQueueService {
  constructor(
    @InjectQueue(QueueNames.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async enqueue(eventId: string, generation: number) {
    await this.queue.add(
      'materialize',
      { eventId },
      {
        jobId: `notification-${eventId}-${generation}`,
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );
  }
}
