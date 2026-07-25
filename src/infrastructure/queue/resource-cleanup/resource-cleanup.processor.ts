import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobNames, QueueNames } from '@/infrastructure/queue/queue.constants';
import { StorageService } from '@/common/abstracts';
import { LoggerService } from '../../logger/logger.service';

type ResourceCleanupJobData = {
  fileKey: string; // The file key to be deleted
};

@Processor(QueueNames.RESOURCE_CLEANUP)
export class ResourceCleanupQueueProcessor extends WorkerHost {
  constructor(
    private readonly storageService: StorageService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<ResourceCleanupJobData, any, string>) {
    switch (job.name) {
      case JobNames.RESOURCE_CLEANUP.DELETE_ORPHANED_FILE:
        await this.storageService.deleteFile(job.data.fileKey);
        break;

      case JobNames.RESOURCE_CLEANUP.DELETE_OLD_FILE:
        await this.storageService.deleteFile(job.data.fileKey);
        break;

      default:
        this.logger.warn(`No handler for job name: ${job.name}`);
        break;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ResourceCleanupJobData, any, string>) {
    this.logger.log(
      `Resource cleanup job completed. Job ID: ${job.id} Name: ${job.name} for ${job.data.fileKey}`,
    );
  }
}
