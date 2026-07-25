import { Module } from '@nestjs/common';
import { ResourceCleanupQueueService } from './resource-cleanup-queue.service';
import { QueueNames } from '../queue.constants';
import { BullModule } from '@nestjs/bullmq';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ResourceCleanupQueueProcessor } from './resource-cleanup.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueNames.RESOURCE_CLEANUP }),
    StorageModule,
  ],
  providers: [ResourceCleanupQueueService, ResourceCleanupQueueProcessor],
  exports: [ResourceCleanupQueueService],
})
export class ResourceCleanupQueueModule {}
