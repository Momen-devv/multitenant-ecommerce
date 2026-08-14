import { Module } from '@nestjs/common';
import { StoreOwnerController } from './controllers/store-owner.controller';
import { PlatformStoresController } from './controllers/platform-stores.controller';
import { StoresService } from './services/stores.service';
import { StoreRepository } from './repos/store.repository';
import { StoreLifecycleService } from './services/store-lifecycle.service';
import { PlatformStoresService } from './services/platform-stores.service';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ImageProcessingService } from '@/common/services/Image-processing.service';

@Module({
  imports: [StorageModule],
  controllers: [StoreOwnerController, PlatformStoresController],
  providers: [
    StoresService,
    PlatformStoresService,
    StoreRepository,
    StoreLifecycleService,
    ImageProcessingService,
  ],
  exports: [StoreRepository],
})
export class StoresModule {}
