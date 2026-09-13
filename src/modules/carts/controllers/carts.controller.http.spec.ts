import {
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { OrdersRepository } from '@/modules/orders/repos';
import { CartsService } from '../services/carts.service';
import { CartsController } from './carts.controller';

describe('CartsController HTTP', () => {
  const cartsService = {
    create: jest.fn(),
    read: jest.fn(),
    assertCheckoutAccess: jest.fn(),
    setQuantity: jest.fn(),
    remove: jest.fn(),
  };
  const ordersRepository = { placeOrder: jest.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CartsController],
      providers: [
        { provide: CartsService, useValue: cartsService },
        { provide: OrdersRepository, useValue: ordersRepository },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => jest.resetAllMocks());

  afterAll(async () => app.close());

  it('rejects an existing-Cart read with no capability header', async () => {
    await request(app.getHttpServer())
      .get('/stores/shop/carts/11111111-1111-4111-8111-111111111111')
      .expect(400);

    expect(cartsService.read).not.toHaveBeenCalled();
  });

  it('rejects a checkout body missing its required delivery contact', async () => {
    await request(app.getHttpServer())
      .post('/stores/shop/carts/11111111-1111-4111-8111-111111111111/checkout')
      .set('X-Cart-Token', 'guest-token')
      .set('Idempotency-Key', 'checkout-1')
      .send({
        expectedCartVersion: 1,
        quoteFingerprint: 'a'.repeat(64),
        deliveryAddress: {
          addressLine1: '1 Example Street',
          city: 'Cairo',
          countryCode: 'EG',
        },
      })
      .expect(400);

    expect(cartsService.assertCheckoutAccess).not.toHaveBeenCalled();
    expect(ordersRepository.placeOrder).not.toHaveBeenCalled();
  });

  it('returns not found when the URL Store is not authorized for the Cart token', async () => {
    cartsService.assertCheckoutAccess.mockRejectedValue(
      new NotFoundException('Cart not found'),
    );

    await request(app.getHttpServer())
      .post(
        '/stores/other-store/carts/11111111-1111-4111-8111-111111111111/checkout',
      )
      .set('X-Cart-Token', 'guest-token')
      .set('Idempotency-Key', 'checkout-1')
      .send(validCheckoutBody())
      .expect(404);

    expect(cartsService.assertCheckoutAccess).toHaveBeenCalledWith(
      'other-store',
      '11111111-1111-4111-8111-111111111111',
      'guest-token',
    );
    expect(ordersRepository.placeOrder).not.toHaveBeenCalled();
  });
});

function validCheckoutBody() {
  return {
    expectedCartVersion: 1,
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
