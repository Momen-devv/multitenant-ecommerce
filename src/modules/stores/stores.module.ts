import { Module } from '@nestjs/common';
import { StoresController } from './controllers/stores.controller';
import { StoresService } from './services/stores.service';
import { StoreRepository } from './repos/store.repository';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { CommonModule } from '@/common/common.module';

@Module({
  imports: [StorageModule, CommonModule],
  controllers: [StoresController],
  providers: [StoresService, StoreRepository],
  exports: [StoreRepository],
})
export class StoresModule {}
