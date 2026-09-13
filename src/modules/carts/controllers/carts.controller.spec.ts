import { BadRequestException } from '@nestjs/common';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { CartsController } from './carts.controller';

describe('CartsController', () => {
  const cartsService = {
    create: jest.fn(),
    read: jest.fn(),
    setQuantity: jest.fn(),
    remove: jest.fn(),
  };
  const ordersRepository = { placeOrder: jest.fn() };
  const controller = new CartsController(
    cartsService as never,
    ordersRepository as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('requires the Cart capability token before reading an existing Cart', () => {
    expect(() => controller.read('shop', 'cart-id', undefined)).toThrow(
      BadRequestException,
    );
    expect(cartsService.read).not.toHaveBeenCalled();
  });

  it('places an Order using only the Cart capability and idempotency headers', async () => {
    const receipt = { id: 'order-1' };
    ordersRepository.placeOrder.mockResolvedValue(receipt);
    const body = {
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

    await expect(
      controller.checkout('cart-1', ' guest-token ', ' checkout-1 ', body),
    ).resolves.toBe(receipt);

    expect(ordersRepository.placeOrder).toHaveBeenCalledWith(
      'cart-1',
      'guest-token',
      expect.objectContaining({
        ...body,
        idempotencyKey: 'checkout-1',
      }),
    );
  });

  it('rejects checkout requests without an idempotency key before placing an Order', () => {
    expect(() =>
      controller.checkout('cart-1', 'guest-token', undefined, {
        expectedCartVersion: 1,
        quoteFingerprint: 'a'.repeat(64),
        contact: {} as never,
        deliveryAddress: {} as never,
      }),
    ).toThrow(BadRequestException);
    expect(ordersRepository.placeOrder).not.toHaveBeenCalled();
  });
});
