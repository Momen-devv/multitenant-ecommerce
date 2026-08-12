import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobNames, QueueNames } from '../queue.constants';

@Injectable()
export class DataSyncQueueService {
  constructor(
    @InjectQueue(QueueNames.DATA_SYNC) private readonly queue: Queue,
  ) {}
  private readonly jobOptions = {
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 5 },
  };

  async addSyncOrgNameJob(organizationId: string, name: string): Promise<void> {
    await this.queue.add(
      JobNames.DATA_SYNC.SYNC_ORG_NAME,
      { organizationId, name },
      this.jobOptions,
    );
  }
}
