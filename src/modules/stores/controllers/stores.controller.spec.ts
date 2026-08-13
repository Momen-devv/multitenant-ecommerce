import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import type { App } from 'supertest/types';

jest.mock('@/infrastructure/storage/file-validation.config', () => ({
  createImageFileValidator: () => ({ transform: (file: unknown) => file }),
}));

jest.mock('@/common/services/Image-processing.service', () => ({
  ImageProcessingService: class ImageProcessingService {},
}));

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator } = jest.requireActual('@nestjs/common');
  return {
    AuthService: class AuthService {},
    Session: createParamDecorator(
      (_data, context) => context.switchToHttp().getRequest().session,
    ),
  };
});

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

import { StoreOwnerController } from './stores.controller';
import { StoresService } from '../services/stores.service';
import { StoreRepository } from '../repos/store.repository';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { ResourceCleanupQueueService } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.service';
import { DataSyncQueueService } from '@/infrastructure/queue/data-sync/data-sync-queue.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { AuthService } from '@thallesp/nestjs-better-auth';

describe('StoreOwnerController HTTP adapter', () => {
  let app: INestApplication<App>;
  let storesService: StoresService;
  const storeRepository = {
    findByOwnerId: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    storeRepository.findByOwnerId.mockImplementation((ownerId: string) =>
      Promise.resolve({
        id: ownerId === 'store-owner-1' ? 'store-1' : 'store-2',
      }),
    );

    const module = await Test.createTestingModule({
      controllers: [StoreOwnerController],
      providers: [
        StoresService,
        { provide: StoreRepository, useValue: storeRepository },
        { provide: StorageService, useValue: {} },
        { provide: ImageProcessingService, useValue: {} },
        { provide: ResourceCleanupQueueService, useValue: {} },
        { provide: DataSyncQueueService, useValue: {} },
        { provide: LoggerService, useValue: {} },
        { provide: AuthService, useValue: {} },
      ],
    }).compile();

    storesService = module.get(StoresService);
    jest.spyOn(storesService, 'getStore');
    jest
      .spyOn(storesService, 'createStore')
      .mockResolvedValue({ id: 'store-1' } as never);
    jest
      .spyOn(storesService, 'updateStore')
      .mockResolvedValue({ id: 'store-1' } as never);
    jest.spyOn(storesService, 'uploadStoreLogo').mockResolvedValue();

    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.session = {
        user: { id: req.header('x-store-owner-id') ?? 'store-owner-1' },
      };
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps owner Store actions under /stores and uses only the session user as the owner', async () => {
    await request(app.getHttpServer())
      .post('/stores')
      .send({ name: 'Owner Store' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/stores/me')
      .expect(200)
      .expect({ id: 'store-1' });
    await request(app.getHttpServer())
      .patch('/stores/me')
      .send({ description: 'Updated description' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/stores/me/logo')
      .attach(
        'logo',
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/5wAAAABJRU5ErkJggg==',
          'base64',
        ),
        {
          filename: 'logo.png',
          contentType: 'image/png',
        },
      )
      .expect(200);
    await request(app.getHttpServer())
      .get('/stores/me')
      .set('x-store-owner-id', 'store-owner-2')
      .expect(200)
      .expect({ id: 'store-2' });
    await request(app.getHttpServer()).get('/stores/store-2').expect(404);

    expect(storesService.createStore).toHaveBeenCalledWith(
      { name: 'Owner Store' },
      'store-owner-1',
      expect.any(Object),
    );
    expect(storesService.getStore).toHaveBeenCalledWith('store-owner-1');
    expect(storesService.updateStore).toHaveBeenCalledWith(
      { description: 'Updated description' },
      'store-owner-1',
      expect.any(Object),
    );
    expect(storesService.uploadStoreLogo).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'logo.png' }),
      'store-owner-1',
    );
    expect(storesService.getStore).toHaveBeenLastCalledWith('store-owner-2');
  });
});
