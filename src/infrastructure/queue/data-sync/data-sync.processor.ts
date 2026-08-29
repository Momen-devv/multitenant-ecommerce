import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSyncJobName, JobNames, QueueNames } from '../queue.constants';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
} from '@/modules/stores/interfaces/repos';
import { Inject } from '@nestjs/common';

interface SyncOrgNameJobData {
  organizationId: string;
  name: string;
}

@Processor(QueueNames.DATA_SYNC)
export class DataSyncProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
  ) {
    super();
  }

  async process(
    job: Job<SyncOrgNameJobData, void, DataSyncJobName>,
  ): Promise<void> {
    switch (job.name) {
      case JobNames.DATA_SYNC.SYNC_ORG_NAME: {
        const { organizationId, name } = job.data;
        await this.storeRepository.updateOrganizationName(organizationId, name);
        break;
      }

      default: {
        const _exhaustiveCheck: never = job.name;
        this.logger.warn(
          `No handler for job name: ${String(_exhaustiveCheck)}`,
        );
        break;
      }
    }
  }
}
