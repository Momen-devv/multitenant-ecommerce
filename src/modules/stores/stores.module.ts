import { Module } from '@nestjs/common';
import { StoreOwnerController } from './controllers/store-owner.controller';
import { StoresService } from './services/stores.service';
import { StoreRepository } from './repos/store.repository';
import { StoreLifecycleService } from './services/store-lifecycle.service';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ImageProcessingService } from '@/common/services/Image-processing.service';

@Module({
  imports: [StorageModule],
  controllers: [StoreOwnerController],
  providers: [
    StoresService,
    StoreRepository,
    StoreLifecycleService,
    ImageProcessingService,
  ],
  exports: [StoreRepository],
})
export class StoresModule {}
