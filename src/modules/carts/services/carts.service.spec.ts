import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CartsService } from './carts.service';
import { CARTS_REPOSITORY } from '../interfaces/repos';
import { SecureTokenService } from '@/common/services/secure-token.service';
import { CartState, ProductStatus, ProductVariantStatus } from '@/common/enums';
import { CartConflictError } from '@/common/errors';
import { MAX_UNIT_PRICE_MINOR_UNITS } from '@/common/commerce/limits';

describe('CartsService', () => {
  const repository = {
    create: jest.fn(),
    read: jest.fn(),
    setQuantity: jest.fn(),
    remove: jest.fn(),
  };
  const tokens = {
    generate: jest.fn(),
    hash: jest.fn(),
  };
  let service: CartsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: CARTS_REPOSITORY, useValue: repository },
        { provide: SecureTokenService, useValue: tokens },
      ],
    }).compile();
    service = module.get(CartsService);
  });

  it('creates a thirty-day guest Cart and returns its token only at creation', async () => {
    tokens.generate.mockReturnValue({
      token: 'guest-token',
      hashedToken: 'a'.repeat(64),
    });
    repository.create.mockResolvedValue({
      id: 'cart-1',
      version: 1,
      expiresAt: new Date('2030-01-31T00:00:00.000Z'),
    });

    await expect(service.create('shop')).resolves.toEqual({
      id: 'cart-1',
      version: 1,
      expiresAt: new Date('2030-01-31T00:00:00.000Z'),
      token: 'guest-token',
    });
  });

  it('does not reveal whether an inactive or missing Store exists', async () => {
    tokens.generate.mockReturnValue({
      token: 'guest-token',
      hashedToken: 'a'.repeat(64),
    });
    repository.create.mockResolvedValue(undefined);

    await expect(service.create('missing-store')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns live integer pricing and a stable quote for the same lines', async () => {
    tokens.hash.mockReturnValue('a'.repeat(64));
    const cart = {
      id: 'cart-1',
      state: CartState.ACTIVE,
      version: 2,
      expiresAt: new Date('2030-01-31T00:00:00.000Z'),
      currency: 'usd',
      items: [
        {
          productId: 'product-b',
          variantId: 'variant-b',
          quantity: 1,
          productName: 'Boots',
          variantTitle: 'Black',
          unitPrice: 250,
          productStatus: ProductStatus.PUBLISHED,
          variantStatus: ProductVariantStatus.ACTIVE,
          availableQuantity: 1,
        },
        {
          productId: 'product-a',
          variantId: 'variant-a',
          quantity: 1,
          productName: 'Socks',
          variantTitle: 'Default',
          unitPrice: 100,
          productStatus: ProductStatus.PUBLISHED,
          variantStatus: ProductVariantStatus.ACTIVE,
          availableQuantity: 3,
        },
      ],
    };
    repository.read.mockResolvedValueOnce(cart).mockResolvedValueOnce({
      ...cart,
      items: [...cart.items].reverse(),
    });

    const first = await service.read('shop', 'cart-1', 'guest-token');
    const second = await service.read('shop', 'cart-1', 'guest-token');

    expect(first).toMatchObject({
      subtotal: 350,
      total: 350,
      shippingAmount: 0,
      taxAmount: 0,
      hasBlockedItems: false,
    });
    expect(second.quoteFingerprint).toBe(first.quoteFingerprint);
  });

  it('keeps unavailable Cart Items visible but excludes them from the quote', async () => {
    tokens.hash.mockReturnValue('a'.repeat(64));
    repository.read.mockResolvedValue({
      id: 'cart-1',
      state: CartState.ACTIVE,
      version: 2,
      expiresAt: new Date('2030-01-31T00:00:00.000Z'),
      currency: 'usd',
      items: [
        {
          productId: 'product-unavailable',
          variantId: 'variant-unavailable',
          quantity: 2,
          productName: 'Hidden Product',
          variantTitle: 'Hidden Variant',
          unitPrice: 250,
          productStatus: ProductStatus.ARCHIVED,
          variantStatus: ProductVariantStatus.ARCHIVED,
          availableQuantity: 0,
        },
      ],
    });

    await expect(
      service.read('shop', 'cart-1', 'guest-token'),
    ).resolves.toEqual(
      expect.objectContaining({
        subtotal: 0,
        total: 0,
        hasBlockedItems: true,
        items: [
          {
            productId: 'product-unavailable',
            variantId: 'variant-unavailable',
            quantity: 2,
            blocked: true,
          },
        ],
      }),
    );
  });

  it('keeps a Cart readable when live prices exceed the supported aggregate total', async () => {
    tokens.hash.mockReturnValue('a'.repeat(64));
    repository.read.mockResolvedValue({
      id: 'cart-1',
      state: CartState.ACTIVE,
      version: 2,
      expiresAt: new Date('2030-01-31T00:00:00.000Z'),
      currency: 'usd',
      items: [
        {
          productId: 'product-a',
          variantId: 'variant-a',
          quantity: 99,
          productName: 'A',
          variantTitle: 'Default',
          unitPrice: MAX_UNIT_PRICE_MINOR_UNITS,
          productStatus: ProductStatus.PUBLISHED,
          variantStatus: ProductVariantStatus.ACTIVE,
          availableQuantity: 99,
        },
        {
          productId: 'product-b',
          variantId: 'variant-b',
          quantity: 99,
          productName: 'B',
          variantTitle: 'Default',
          unitPrice: MAX_UNIT_PRICE_MINOR_UNITS,
          productStatus: ProductStatus.PUBLISHED,
          variantStatus: ProductVariantStatus.ACTIVE,
          availableQuantity: 99,
        },
      ],
    });

    await expect(
      service.read('shop', 'cart-1', 'guest-token'),
    ).resolves.toMatchObject({
      subtotal: 3_999_999_960,
      hasBlockedItems: false,
      requiresCheckoutReview: true,
      items: [
        expect.objectContaining({ variantId: 'variant-a', blocked: false }),
        expect.objectContaining({ variantId: 'variant-b', blocked: false }),
      ],
    });
  });

  it('rejects an invalid quantity before changing the Cart', async () => {
    await expect(
      service.setQuantity('shop', 'cart-1', 'guest-token', 'variant-1', {
        quantity: 100,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.setQuantity).not.toHaveBeenCalled();
  });

  it('rejects a stale Cart write without returning Cart contents', async () => {
    tokens.hash.mockReturnValue('a'.repeat(64));
    repository.setQuantity.mockRejectedValue(
      new CartConflictError('Cart changed during this request.'),
    );

    await expect(
      service.setQuantity('shop', 'cart-1', 'guest-token', 'variant-1', {
        quantity: 2,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.read).not.toHaveBeenCalled();
  });

  it('treats a wrong guest token as an inaccessible Cart', async () => {
    tokens.hash.mockReturnValue('wrong-token-digest');
    repository.read.mockResolvedValue(undefined);

    await expect(
      service.read('shop', 'cart-1', 'wrong-token'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
