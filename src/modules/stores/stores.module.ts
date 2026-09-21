import { Module } from '@nestjs/common';
import { StoreOwnerController } from './controllers/store-owner.controller';
import { PlatformStoresController } from './controllers/platform-stores.controller';
import { StoresService } from './services/stores.service';
import { StoreRepository } from './repos/store.repository';
import { STORE_REPOSITORY } from './interfaces/repos';
import { StoreLifecycleService } from './services/store-lifecycle.service';
import { PlatformStoresService } from './services/platform-stores.service';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { StoreMembershipGuard } from '@/common/guards/store-membership.guard';
import { StoreMembershipController } from './controllers/store-membership.controller';
import { StoreMembershipService } from './services/store-membership.service';
import { StoreInvitationsController } from './controllers/store-invitations.controller';

@Module({
  imports: [StorageModule],
  controllers: [
    StoreOwnerController,
    PlatformStoresController,
    StoreMembershipController,
    StoreInvitationsController,
  ],
  providers: [
    StoresService,
    PlatformStoresService,
    StoreRepository,
    { provide: STORE_REPOSITORY, useExisting: StoreRepository },
    StoreLifecycleService,
    ImageProcessingService,
    StoreMembershipService,
    StoreMembershipGuard,
  ],
  exports: [
    STORE_REPOSITORY,
    PlatformStoresService,
    StoreMembershipGuard,
    StoreMembershipService,
  ],
})
export class StoresModule {}
