import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoreRepository } from '../repos/store.repository';
import { StoreLifecycleService } from './store-lifecycle.service';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { ResourceCleanupQueueService } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.service';
import { DataSyncQueueService } from '@/infrastructure/queue/data-sync/data-sync-queue.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { AuthService } from '@thallesp/nestjs-better-auth';

jest.mock('@/common/services/Image-processing.service', () => ({
  ImageProcessingService: class ImageProcessingService {},
}));

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class AuthService {},
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

describe('StoresService', () => {
  let service: StoresService;
  const storeRepository = {
    findByOwnerId: jest.fn(),
  };
  const storeLifecycleService = {
    closeStore: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: StoreRepository, useValue: storeRepository },
        { provide: StorageService, useValue: {} },
        { provide: ImageProcessingService, useValue: {} },
        { provide: ResourceCleanupQueueService, useValue: {} },
        { provide: DataSyncQueueService, useValue: {} },
        { provide: LoggerService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: StoreLifecycleService, useValue: storeLifecycleService },
      ],
    }).compile();

    service = module.get<StoresService>(StoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows a closed Store to be read but rejects Store writes and repeated closure', async () => {
    const closedStore = {
      id: 'store-1',
      ownerId: 'owner-1',
      status: 'owner_closed',
    };
    storeRepository.findByOwnerId.mockResolvedValue(closedStore);

    await expect(service.getStore('owner-1')).resolves.toBe(closedStore);
    await expect(
      service.updateStore({ description: 'not allowed' }, 'owner-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.uploadStoreLogo({} as Express.Multer.File, 'owner-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.closeStore('owner-1', 'No longer operating.'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storeLifecycleService.closeStore).not.toHaveBeenCalled();
  });
});
