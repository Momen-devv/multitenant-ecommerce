import { Module } from '@nestjs/common';
import { StoreOwnerController } from './controllers/stores.controller';
import { StoresService } from './services/stores.service';
import { StoreRepository } from './repos/store.repository';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ImageProcessingService } from '@/common/services/Image-processing.service';

@Module({
  imports: [StorageModule],
  controllers: [StoreOwnerController],
  providers: [StoresService, StoreRepository, ImageProcessingService],
  exports: [StoreRepository],
})
export class StoresModule {}
