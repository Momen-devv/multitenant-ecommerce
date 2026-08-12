// infrastructure/queue/data-sync/data-sync.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DataSyncProcessor } from './data-sync.processor';
import { DataSyncQueueService } from './data-sync-queue.service';
import { QueueNames } from '../queue.constants';
import { StoresModule } from '@/modules/stores/stores.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueNames.DATA_SYNC }),
    StoresModule,
  ],
  providers: [DataSyncProcessor, DataSyncQueueService],
  exports: [DataSyncQueueService],
})
export class DataSyncModule {}
