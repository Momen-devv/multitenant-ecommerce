import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  JobNames,
  QueueNames,
  type ResourceCleanupJobName,
} from '@/infrastructure/queue/queue.constants';
import { StorageService } from '@/common/abstracts';
import { LoggerService } from '../../logger/logger.service';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
} from '@/modules/stores/interfaces/repos';
import { Inject } from '@nestjs/common';

type ResourceCleanupJobData = {
  fileKey: string; // The file key to be deleted
  organizationId?: string; // The organization ID to be deleted (optional)
};

@Processor(QueueNames.RESOURCE_CLEANUP)
export class ResourceCleanupQueueProcessor extends WorkerHost {
  constructor(
    private readonly storageService: StorageService,
    private readonly logger: LoggerService,
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
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

      case JobNames.RESOURCE_CLEANUP.DELETE_ORPHANED_ORG:
        await this.storeRepository.deleteOrganization(job.data.organizationId!);
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
