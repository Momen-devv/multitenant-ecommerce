import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { JobNames, QueueNames } from '../queue.constants';
import { Queue } from 'bullmq';

@Injectable()
export class ResourceCleanupQueueService {
  // options for now
  private readonly jobOptions = {
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  };

  constructor(
    @InjectQueue(QueueNames.RESOURCE_CLEANUP)
    private readonly resourceCleanupQueue: Queue,
  ) {}
  async addDeleteOldFileJob(fileKey: string): Promise<void> {
    await this.resourceCleanupQueue.add(
      JobNames.RESOURCE_CLEANUP.DELETE_OLD_FILE,
      { fileKey },
      this.jobOptions,
    );
  }

  async addDeleteOrphanedFileJob(fileKey: string): Promise<void> {
    await this.resourceCleanupQueue.add(
      JobNames.RESOURCE_CLEANUP.DELETE_ORPHANED_FILE,
      { fileKey },
      this.jobOptions,
    );
  }

  // Any other resource cleanup-related jobs can be added here
}
