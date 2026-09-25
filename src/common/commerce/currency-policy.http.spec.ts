import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  OrgRoles: () => () => undefined,
  Roles: () => () => undefined,
}));

jest.mock('@/common/services/Image-processing.service', () => ({
  ImageProcessingService: class ImageProcessingService {},
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

import { MAX_UNIT_PRICE_MINOR_UNITS } from './limits';
import { StoreOwnerController } from '@/modules/stores/controllers/store-owner.controller';
import { StoresService } from '@/modules/stores/services/stores.service';
import { PlatformPlansController } from '@/modules/plans/controllers/platform-plans.controller';
import { PlanPricesController } from '@/modules/plans/controllers/plan-prices.controller';
import { PlatformPlansService } from '@/modules/plans/services/platform-plans.service';
import { PlanPricesService } from '@/modules/plans/services/plan-prices.service';
import { ProductVariantsController } from '@/modules/products/controllers/product-variants.controller';
import { ProductVariantsService } from '@/modules/products/services/product-variants.service';
import { STORE_REPOSITORY } from '@/modules/stores/interfaces/repos';

describe('USD-only new business-data HTTP validation', () => {
  const storesService = { createStore: jest.fn() };
  const platformPlansService = { createPlan: jest.fn() };
  const planPricesService = { addPlanPrice: jest.fn() };
  const productVariantsService = {
    createVariant: jest.fn(),
    updateVariant: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        StoreOwnerController,
        PlatformPlansController,
        PlanPricesController,
        ProductVariantsController,
      ],
      providers: [
        { provide: StoresService, useValue: storesService },
        { provide: PlatformPlansService, useValue: platformPlansService },
        { provide: PlanPricesService, useValue: planPricesService },
        { provide: ProductVariantsService, useValue: productVariantsService },
        {
          provide: STORE_REPOSITORY,
          useValue: {
            findStoreIdByOrganizationId: jest.fn().mockResolvedValue({
              id: '11111111-1111-4111-8111-111111111111',
              status: 'active',
              defaultCurrency: 'usd',
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<App>();
    app.use((httpRequest, _response, next) => {
      httpRequest.session = {
        user: { id: 'owner-1' },
        session: { activeOrganizationId: 'organization-1' },
      };
      httpRequest.activeStore = {
        organizationId: 'organization-1',
        storeId: '11111111-1111-4111-8111-111111111111',
        currency: 'usd',
      };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('defaults Store currency while rejecting an explicit non-USD Store currency', async () => {
    storesService.createStore.mockResolvedValue({ id: 'store-1' });

    await request(app.getHttpServer())
      .post('/stores')
      .send({ name: 'USD Store' })
      .expect(201);
    expect(storesService.createStore).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'USD Store', currency: undefined }),
      'owner-1',
      expect.any(Object),
    );

    await request(app.getHttpServer())
      .post('/stores')
      .send({ name: 'EUR Store', currency: 'eur' })
      .expect(400);
    expect(storesService.createStore).toHaveBeenCalledTimes(1);
  });

  it('rejects non-USD plan-price writes on both administrative routes', async () => {
    const planId = '22222222-2222-4222-8222-222222222222';
    const plan = {
      name: 'Pro',
      code: 'pro',
      features: {},
      limits: {},
      prices: [{ amount: 2900, interval: 'month', currency: 'eur' }],
    };

    await request(app.getHttpServer())
      .post('/platform/plans')
      .send(plan)
      .expect(400);
    await request(app.getHttpServer())
      .post(`/platform/plans/${planId}/prices`)
      .send({ amount: 2900, interval: 'month', currency: 'eur' })
      .expect(400);
    expect(platformPlansService.createPlan).not.toHaveBeenCalled();
    expect(planPricesService.addPlanPrice).not.toHaveBeenCalled();
  });

  it('rejects fractional and out-of-range product price writes before reaching the service', async () => {
    const productId = '33333333-3333-4333-8333-333333333333';
    const variantId = '44444444-4444-4444-8444-444444444444';

    await request(app.getHttpServer())
      .post(`/products/${productId}/variants`)
      .send({ price: 1.5, inventoryPolicy: 'untracked' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/products/${productId}/variants/${variantId}`)
      .send({ expectedVersion: 1, price: MAX_UNIT_PRICE_MINOR_UNITS + 1 })
      .expect(400);
    expect(productVariantsService.createVariant).not.toHaveBeenCalled();
    expect(productVariantsService.updateVariant).not.toHaveBeenCalled();
  });
});
