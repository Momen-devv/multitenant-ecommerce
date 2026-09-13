import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator } = jest.requireActual('@nestjs/common');
  return {
    AllowAnonymous: () => () => undefined,
    OrgRoles: () => () => undefined,
    Session: createParamDecorator(
      (
        _data: unknown,
        context: {
          switchToHttp: () => { getRequest: () => { session?: unknown } };
        },
      ) => context.switchToHttp().getRequest().session,
    ),
  };
});

import { OrderStatus, StoreStatus } from '@/common/enums';
import { STORE_REPOSITORY } from '@/modules/stores/interfaces/repos';
import { CartsController } from '@/modules/carts/controllers/carts.controller';
import { CartsService } from '@/modules/carts/services/carts.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from '../repos';

describe('Commerce guest-to-owner HTTP flow', () => {
  const cartId = '11111111-1111-4111-8111-111111111111';
  const variantId = '22222222-2222-4222-8222-222222222222';
  const fulfilledOrderId = '33333333-3333-4333-8333-333333333333';
  const cancelledOrderId = '44444444-4444-4444-8444-444444444444';
  const cartsService = {
    create: jest.fn(),
    read: jest.fn(),
    assertCheckoutAccess: jest.fn(),
    setQuantity: jest.fn(),
    remove: jest.fn(),
  };
  const ordersRepository = {
    placeOrder: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    fulfillOrder: jest.fn(),
    cancelOrder: jest.fn(),
  };
  const storesRepository = {
    findStoreIdByOrganizationId: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CartsController, OrdersController],
      providers: [
        { provide: CartsService, useValue: cartsService },
        { provide: OrdersRepository, useValue: ordersRepository },
        { provide: STORE_REPOSITORY, useValue: storesRepository },
      ],
    }).compile();
    app = module.createNestApplication<App>();
    app.use((httpRequest, _response, next) => {
      if (httpRequest.headers['x-owner-token'] === 'owner-token') {
        httpRequest.session = {
          user: { id: 'owner-1' },
          session: { activeOrganizationId: 'organization-1' },
        };
      }
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

  beforeEach(() => {
    jest.resetAllMocks();
    cartsService.create.mockResolvedValue({
      id: cartId,
      version: 1,
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      token: 'guest-cart-token',
    });
    cartsService.setQuantity.mockResolvedValue({
      id: cartId,
      version: 2,
      currency: 'usd',
      items: [{ variantId, quantity: 1 }],
    });
    cartsService.assertCheckoutAccess.mockResolvedValue(undefined);
    storesRepository.findStoreIdByOrganizationId.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.ACTIVE,
      defaultCurrency: 'usd',
    });
    ordersRepository.placeOrder.mockResolvedValue({
      id: fulfilledOrderId,
      sourceCartId: cartId,
      status: OrderStatus.PLACED,
      total: 1000,
    });
    ordersRepository.listOrders.mockResolvedValue({
      items: [{ id: fulfilledOrderId, status: OrderStatus.PLACED }],
      nextCursor: null,
    });
    ordersRepository.fulfillOrder.mockResolvedValue({
      id: fulfilledOrderId,
      status: OrderStatus.FULFILLED,
    });
    ordersRepository.cancelOrder.mockResolvedValue({
      id: cancelledOrderId,
      status: OrderStatus.CANCELLED,
    });
  });

  afterAll(async () => app.close());

  it('lets a guest checkout, then lets only the selected owner fulfill or cancel Orders', async () => {
    await request(app.getHttpServer())
      .post('/stores/shop/carts')
      .expect(201)
      .expect('Cache-Control', 'no-store')
      .expect(({ body }) => expect(body).toMatchObject({ id: cartId }));

    await request(app.getHttpServer())
      .put(`/stores/shop/carts/${cartId}/items/${variantId}`)
      .set('X-Cart-Token', 'guest-cart-token')
      .send({ quantity: 1, expectedVersion: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/stores/shop/carts/${cartId}/checkout`)
      .set('X-Cart-Token', 'guest-cart-token')
      .set('Idempotency-Key', 'checkout-attempt-1')
      .send(checkoutBody())
      .expect(201)
      .expect('Cache-Control', 'no-store')
      .expect(({ body }) =>
        expect(body).toMatchObject({
          id: fulfilledOrderId,
          status: OrderStatus.PLACED,
        }),
      );

    await request(app.getHttpServer()).get('/orders').expect(403);
    expect(ordersRepository.listOrders).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .get('/orders')
      .set('X-Owner-Token', 'owner-token')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    await request(app.getHttpServer())
      .post(`/orders/${fulfilledOrderId}/fulfill`)
      .set('X-Owner-Token', 'owner-token')
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: OrderStatus.FULFILLED }),
      );
    await request(app.getHttpServer())
      .post(`/orders/${cancelledOrderId}/cancel`)
      .set('X-Owner-Token', 'owner-token')
      .send({ reason: 'Customer requested cancellation' })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: OrderStatus.CANCELLED }),
      );

    expect(cartsService.create).toHaveBeenCalledWith('shop');
    expect(cartsService.setQuantity).toHaveBeenCalledWith(
      'shop',
      cartId,
      'guest-cart-token',
      variantId,
      { quantity: 1, expectedVersion: 1 },
    );
    expect(cartsService.assertCheckoutAccess).toHaveBeenCalledWith(
      'shop',
      cartId,
      'guest-cart-token',
    );
    expect(ordersRepository.placeOrder).toHaveBeenCalledWith(
      cartId,
      'guest-cart-token',
      expect.objectContaining({ idempotencyKey: 'checkout-attempt-1' }),
    );
    expect(ordersRepository.listOrders).toHaveBeenCalledWith('store-1', {});
    expect(ordersRepository.fulfillOrder).toHaveBeenCalledWith(
      'store-1',
      fulfilledOrderId,
      'owner-1',
    );
    expect(ordersRepository.cancelOrder).toHaveBeenCalledWith(
      'store-1',
      cancelledOrderId,
      'owner-1',
      'Customer requested cancellation',
    );
  });
});

function checkoutBody() {
  return {
    expectedCartVersion: 2,
    quoteFingerprint: 'a'.repeat(64),
    contact: {
      recipientName: 'Ada Lovelace',
      email: 'ada@example.test',
      phone: '+20 100 000 0000',
    },
    deliveryAddress: {
      addressLine1: '1 Example Street',
      city: 'Cairo',
      countryCode: 'EG',
    },
  };
}
