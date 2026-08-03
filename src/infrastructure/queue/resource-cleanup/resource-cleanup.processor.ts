import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  JobNames,
  QueueNames,
  type ResourceCleanupJobName,
} from '@/infrastructure/queue/queue.constants';
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

  async process(job: Job<ResourceCleanupJobData, any, ResourceCleanupJobName>) {
    switch (job.name) {
      case JobNames.RESOURCE_CLEANUP.DELETE_ORPHANED_FILE:
        await this.storageService.deleteFile(job.data.fileKey);
        break;

      case JobNames.RESOURCE_CLEANUP.DELETE_OLD_FILE:
        await this.storageService.deleteFile(job.data.fileKey);
        break;

      default: {
        const _exhaustiveCheck: never = job.name;
        this.logger.warn(
          `No handler for job name: ${String(_exhaustiveCheck)}`,
        );
        break;
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ResourceCleanupJobData, any, ResourceCleanupJobName>) {
    this.logger.log(
      `Resource cleanup job completed. Job ID: ${job.id} Name: ${job.name} for ${job.data.fileKey}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<ResourceCleanupJobData, any, ResourceCleanupJobName>,
    error: Error,
  ) {
    this.logger.error(
      `Resource cleanup job failed. Job ID: ${job.id} Name: ${job.name} for ${job.data.fileKey}. Error: ${error.message}`,
      error.stack,
    );
  }
}
