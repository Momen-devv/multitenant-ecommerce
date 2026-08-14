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
import { fromNodeHeaders } from 'better-auth/node';

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
  const authApi = {
    createOrganization: jest.fn(),
    updateOrganization: jest.fn(),
  };
  const resourceCleanupQueue = {
    addDeleteOrphanedOrgJob: jest.fn(),
    addDeleteOrphanedFileJob: jest.fn(),
    addDeleteOldFileJob: jest.fn(),
  };
  const dataSyncQueue = {
    addSyncOrgNameJob: jest.fn(),
  };
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };
  const storage = {
    uploadFile: jest.fn(),
  };
  const imageProcessingService = {
    validateAndSanitize: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest
      .mocked(fromNodeHeaders)
      .mockReturnValue({ authorization: 'Bearer token' } as never);
    resourceCleanupQueue.addDeleteOrphanedFileJob.mockResolvedValue(undefined);
    resourceCleanupQueue.addDeleteOldFileJob.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: StoreRepository, useValue: storeRepository },
        { provide: StorageService, useValue: storage },
        { provide: ImageProcessingService, useValue: imageProcessingService },
        {
          provide: ResourceCleanupQueueService,
          useValue: resourceCleanupQueue,
        },
        { provide: DataSyncQueueService, useValue: dataSyncQueue },
        { provide: LoggerService, useValue: logger },
        { provide: AuthService, useValue: { api: authApi } },
        { provide: StoreLifecycleService, useValue: storeLifecycleService },
      ],
    }).compile();

    service = module.get<StoresService>(StoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.each(['owner_closed', 'platform_suspended'] as const)(
    'allows a %s Store to be read but rejects Store writes and Store Closure',
    async (status) => {
      const store = {
        id: 'store-1',
        ownerId: 'owner-1',
        status,
      };
      storeRepository.findByOwnerId.mockResolvedValue(store);

      await expect(service.getStore('owner-1')).resolves.toBe(store);
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
    },
  );

  it('allows a Store Owner to update a reactivated active Store', async () => {
    const existingStore = {
      id: 'store-1',
      organizationId: 'organization-1',
      ownerId: 'owner-1',
      name: 'Old Store',
      status: 'active',
    };
    const updatedStore = { ...existingStore, description: 'Updated details' };
    storeRepository.findByOwnerId.mockResolvedValue(existingStore);
    storeRepository.updateActiveStore = jest
      .fn()
      .mockResolvedValue(updatedStore);

    await expect(
      service.updateStore({ description: 'Updated details' }, 'owner-1', {}),
    ).resolves.toBe(updatedStore);
  });

  it('allows a Store Owner to replace the logo on a reactivated active Store', async () => {
    const existingStore = {
      id: 'store-1',
      ownerId: 'owner-1',
      status: 'active',
      logoKey: 'old-logo-key',
    };
    const sanitizedImage = { mimetype: 'image/png' };
    storeRepository.findByOwnerId.mockResolvedValue(existingStore);
    imageProcessingService.validateAndSanitize.mockResolvedValue(
      sanitizedImage,
    );
    storage.uploadFile.mockResolvedValue('https://cdn.example/new-logo.png');
    storeRepository.updateActiveStore = jest.fn().mockResolvedValue({
      ...existingStore,
      logo: 'https://cdn.example/new-logo.png',
      logoKey: expect.any(String),
    });

    await expect(
      service.uploadStoreLogo({} as Express.Multer.File, 'owner-1'),
    ).resolves.toBeUndefined();

    expect(storeRepository.updateActiveStore).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({ logo: 'https://cdn.example/new-logo.png' }),
    );
    expect(resourceCleanupQueue.addDeleteOldFileJob).toHaveBeenCalledWith(
      'old-logo-key',
    );
  });

  it('creates the internal Organization through the Store creation flow', async () => {
    const organization = { id: 'organization-1' };
    const createdStore = {
      id: 'store-1',
      organizationId: organization.id,
      ownerId: 'owner-1',
      name: 'My Store',
      slug: 'my-store',
    };
    storeRepository.findByOwnerId.mockResolvedValue(null);
    storeRepository.findBySlug = jest.fn().mockResolvedValue(null);
    storeRepository.create = jest.fn().mockResolvedValue(createdStore);
    authApi.createOrganization.mockResolvedValue(organization);

    await expect(
      service.createStore({ name: 'My Store' }, 'owner-1', {
        authorization: 'Bearer token',
      }),
    ).resolves.toBe(createdStore);

    expect(authApi.createOrganization).toHaveBeenCalledWith({
      body: { name: 'My Store', slug: 'my-store' },
      headers: fromNodeHeaders({ authorization: 'Bearer token' }),
    });
    expect(storeRepository.create).toHaveBeenCalledWith({
      organizationId: organization.id,
      ownerId: 'owner-1',
      name: 'My Store',
      slug: 'my-store',
      description: undefined,
    });
  });

  it('synchronizes the internal Organization name through the Store update flow', async () => {
    const existingStore = {
      id: 'store-1',
      organizationId: 'organization-1',
      ownerId: 'owner-1',
      name: 'Old Store',
      status: 'active',
    };
    const updatedStore = { ...existingStore, name: 'New Store' };
    storeRepository.findByOwnerId.mockResolvedValue(existingStore);
    storeRepository.updateActiveStore = jest
      .fn()
      .mockResolvedValue(updatedStore);

    await expect(
      service.updateStore({ name: 'New Store' }, 'owner-1', {
        authorization: 'Bearer token',
      }),
    ).resolves.toBe(updatedStore);

    expect(authApi.updateOrganization).toHaveBeenCalledWith({
      body: {
        organizationId: existingStore.organizationId,
        data: { name: 'New Store' },
      },
      headers: fromNodeHeaders({ authorization: 'Bearer token' }),
    });
  });
});
