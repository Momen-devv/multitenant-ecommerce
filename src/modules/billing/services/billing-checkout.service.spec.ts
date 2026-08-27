import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingCheckoutService } from './billing-checkout.service';

describe('BillingCheckoutService', () => {
  const stripe = {
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
  };
  const repository = {
    findCheckoutContext: jest.fn(),
    findBillingCustomer: jest.fn(),
    saveBillingCustomer: jest.fn(),
    hasNonTerminalSubscription: jest.fn(),
    reservePendingCheckoutAttempt: jest.fn(),
    createOrReuseCheckoutSession: jest.fn(),
  };
  let service: BillingCheckoutService;

  const input = {
    storeId: '0198f706-69ed-7f7c-b27c-e5544514bfe2',
    customerEmail: 'owner@example.com',
    planPriceId: '0198f706-69ed-7f7c-b27c-e5544514bfe3',
    successUrl: 'https://admin.example.com/billing/success',
    cancelUrl: 'https://admin.example.com/billing/cancel',
    idempotencyKey: 'checkout-attempt-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingCheckoutService(stripe as never, repository as never);
    repository.findCheckoutContext.mockResolvedValue({
      storeId: input.storeId,
      storeName: 'Example store',
      storeStatus: 'active',
      planPriceId: input.planPriceId,
      stripePriceId: 'price_123',
      priceIsActive: true,
      planIsActive: true,
      provisioningStatus: 'ready',
    });
    repository.hasNonTerminalSubscription.mockResolvedValue(false);
    repository.reservePendingCheckoutAttempt.mockResolvedValue({
      id: '0198f706-69ed-7f7c-b27c-e5544514bfe4',
      storeId: input.storeId,
      planPriceId: input.planPriceId,
      stripeCustomerId: 'cus_existing',
      stripePriceId: 'price_123',
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      status: 'pending',
      stripeCheckoutSessionId: null,
      stripeCheckoutSessionUrl: null,
      expiresAt: new Date('2026-08-24T12:00:00.000Z'),
    });
    repository.createOrReuseCheckoutSession.mockImplementation(
      async (_attemptId: string, createSession: () => Promise<unknown>) =>
        createSession(),
    );
    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });
  });

  it('reuses the persisted customer and creates hosted subscription Checkout', async () => {
    repository.findBillingCustomer.mockResolvedValue({
      storeId: input.storeId,
      stripeCustomerId: 'cus_existing',
    });

    await expect(service.createSubscriptionCheckout(input)).resolves.toEqual({
      sessionId: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      {
        mode: 'subscription',
        customer: 'cus_existing',
        client_reference_id: input.storeId,
        line_items: [{ price: 'price_123', quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          storeId: input.storeId,
          planPriceId: input.planPriceId,
        },
        subscription_data: {
          metadata: {
            storeId: input.storeId,
            planPriceId: input.planPriceId,
          },
        },
        expires_at: 1_787_572_800,
      },
      {
        idempotencyKey:
          'subscription-checkout-attempt:0198f706-69ed-7f7c-b27c-e5544514bfe4',
      },
    );
  });

  it('returns one Checkout Session to two simultaneous requests for the same store', async () => {
    repository.findBillingCustomer.mockResolvedValue({
      storeId: input.storeId,
      stripeCustomerId: 'cus_existing',
    });

    let persistedSession: { sessionId: string; url: string } | undefined;
    let creation: Promise<{ sessionId: string; url: string }> | undefined;
    repository.createOrReuseCheckoutSession.mockImplementation(
      async (_attemptId: string, createSession: () => Promise<unknown>) => {
        if (persistedSession) return persistedSession;
        creation ??= (async () => {
          const result = (await createSession()) as {
            sessionId: string;
            url: string;
          };
          persistedSession = result;
          return result;
        })();
        return creation;
      },
    );

    const [first, second] = await Promise.all([
      service.createSubscriptionCheckout(input),
      service.createSubscriptionCheckout({
        ...input,
        idempotencyKey: 'another-client-request',
      }),
    ]);

    expect(first).toEqual(second);
    expect(first).toEqual({
      sessionId: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it('reuses a persisted pending Checkout Session', async () => {
    repository.findBillingCustomer.mockResolvedValue({
      storeId: input.storeId,
      stripeCustomerId: 'cus_existing',
    });
    repository.reservePendingCheckoutAttempt.mockResolvedValue({
      id: '0198f706-69ed-7f7c-b27c-e5544514bfe4',
      storeId: input.storeId,
      planPriceId: input.planPriceId,
      stripeCustomerId: 'cus_existing',
      stripePriceId: 'price_123',
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      status: 'pending',
      stripeCheckoutSessionId: 'cs_existing',
      stripeCheckoutSessionUrl: 'https://checkout.stripe.com/c/pay/cs_existing',
      expiresAt: new Date('2026-08-24T12:00:00.000Z'),
    });
    repository.createOrReuseCheckoutSession.mockResolvedValue({
      sessionId: 'cs_existing',
      url: 'https://checkout.stripe.com/c/pay/cs_existing',
    });

    await expect(service.createSubscriptionCheckout(input)).resolves.toEqual({
      sessionId: 'cs_existing',
      url: 'https://checkout.stripe.com/c/pay/cs_existing',
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects reusing a pending attempt created for a different plan price', async () => {
    repository.findBillingCustomer.mockResolvedValue({
      storeId: input.storeId,
      stripeCustomerId: 'cus_existing',
    });
    repository.reservePendingCheckoutAttempt.mockResolvedValue({
      id: '0198f706-69ed-7f7c-b27c-e5544514bfe4',
      storeId: input.storeId,
      planPriceId: '0198f706-69ed-7f7c-b27c-e5544514b999',
      stripeCustomerId: 'cus_existing',
      stripePriceId: 'price_other',
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      status: 'pending',
      stripeCheckoutSessionId: 'cs_other',
      stripeCheckoutSessionUrl: 'https://checkout.stripe.com/c/pay/cs_other',
      expiresAt: new Date('2026-08-24T12:00:00.000Z'),
    });

    await expect(
      service.createSubscriptionCheckout(input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createOrReuseCheckoutSession).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('creates and persists one Stripe customer when none exists', async () => {
    repository.findBillingCustomer.mockResolvedValue(undefined);
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
    repository.saveBillingCustomer.mockResolvedValue({
      storeId: input.storeId,
      stripeCustomerId: 'cus_new',
    });
    repository.reservePendingCheckoutAttempt.mockResolvedValue({
      id: '0198f706-69ed-7f7c-b27c-e5544514bfe4',
      storeId: input.storeId,
      planPriceId: input.planPriceId,
      stripeCustomerId: 'cus_new',
      stripePriceId: 'price_123',
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      status: 'pending',
      stripeCheckoutSessionId: null,
      stripeCheckoutSessionUrl: null,
      expiresAt: new Date('2026-08-24T12:00:00.000Z'),
    });

    await service.createSubscriptionCheckout(input);

    expect(stripe.customers.create).toHaveBeenCalledWith(
      {
        name: 'Example store',
        email: input.customerEmail,
        metadata: { storeId: input.storeId },
      },
      { idempotencyKey: `billing-customer:store:${input.storeId}` },
    );
    expect(repository.saveBillingCustomer).toHaveBeenCalledWith(
      input.storeId,
      'cus_new',
    );
  });

  it('rejects a second non-terminal subscription', async () => {
    repository.hasNonTerminalSubscription.mockResolvedValue(true);

    await expect(
      service.createSubscriptionCheckout(input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a non-HTTP redirect URL', async () => {
    await expect(
      service.createSubscriptionCheckout({
        ...input,
        successUrl: 'javascript:alert(1)',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findCheckoutContext).not.toHaveBeenCalled();
  });
});
