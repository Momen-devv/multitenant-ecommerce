import { NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  const storeRepository = { findByOwnerId: jest.fn() };
  const subscriptionsRepository = { findCurrentByStoreId: jest.fn() };
  const billingCheckout = { createSubscriptionCheckout: jest.fn() };
  const billingPortal = { createSession: jest.fn() };
  let service: SubscriptionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SubscriptionsService(
      storeRepository as never,
      subscriptionsRepository,
      billingCheckout as never,
      billingPortal as never,
    );
    storeRepository.findByOwnerId.mockResolvedValue({ id: 'store-1' });
  });

  it('creates Checkout for the store resolved from the session owner', async () => {
    const dto = {
      planPriceId: '0198f706-69ed-7f7c-b27c-e5544514bfe2',
      successUrl: 'https://app.example.com/billing?success=true',
      cancelUrl: 'https://app.example.com/billing?canceled=true',
    };
    billingCheckout.createSubscriptionCheckout.mockResolvedValue({
      sessionId: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });

    await expect(
      service.createCheckout(
        'owner-1',
        'owner-1@example.com',
        dto,
        'checkout-request-1',
      ),
    ).resolves.toEqual({
      sessionId: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });

    expect(storeRepository.findByOwnerId).toHaveBeenCalledWith('owner-1');
    expect(billingCheckout.createSubscriptionCheckout).toHaveBeenCalledWith({
      storeId: 'store-1',
      customerEmail: 'owner-1@example.com',
      ...dto,
      idempotencyKey: 'checkout-request-1',
    });
  });

  it('creates a portal session for the owner store', async () => {
    billingPortal.createSession.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session/test',
    });

    await service.createPortal('owner-1', {
      returnUrl: 'https://app.example.com/billing',
    });

    expect(billingPortal.createSession).toHaveBeenCalledWith({
      storeId: 'store-1',
      returnUrl: 'https://app.example.com/billing',
    });
  });

  it('returns the current subscription for the owner store', async () => {
    subscriptionsRepository.findCurrentByStoreId.mockResolvedValue({
      id: 'subscription-1',
      status: 'active',
    });

    await expect(service.getCurrent('owner-1')).resolves.toEqual({
      id: 'subscription-1',
      status: 'active',
    });
    expect(subscriptionsRepository.findCurrentByStoreId).toHaveBeenCalledWith(
      'store-1',
    );
  });

  it('does not invoke billing for a user who does not own a store', async () => {
    storeRepository.findByOwnerId.mockResolvedValue(undefined);

    await expect(
      service.createCheckout(
        'user-without-store',
        'user-without-store@example.com',
        {
          planPriceId: '0198f706-69ed-7f7c-b27c-e5544514bfe2',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        },
        'request-1',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(billingCheckout.createSubscriptionCheckout).not.toHaveBeenCalled();
  });
});
