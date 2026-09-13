import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobNames, QueueNames } from '../queue.constants';

@Injectable()
export class SmsQueueService {
  private readonly jobOptions = {
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  };

  constructor(@InjectQueue(QueueNames.SMS) private readonly smsQueue: Queue) {}

  async addSendJob(to: string, body: string): Promise<void> {
    await this.smsQueue.add(JobNames.SMS.SEND, { to, body }, this.jobOptions);
  }
}
