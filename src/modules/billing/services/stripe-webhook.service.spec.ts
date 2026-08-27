import { BadRequestException } from '@nestjs/common';
import { StripeWebhookService } from './stripe-webhook.service';

describe('StripeWebhookService', () => {
  const stripe = {
    webhooks: { constructEvent: jest.fn() },
    subscriptions: { retrieve: jest.fn() },
  };
  const repository = {
    storeWebhookEvent: jest.fn(),
    claimWebhookEvent: jest.fn(),
    findRecoverableWebhookEventIds: jest.fn(),
    completeWebhookEvent: jest.fn(),
    failWebhookEvent: jest.fn(),
    replayWebhookEvent: jest.fn(),
    reconcileSubscriptionAndCompleteEvent: jest.fn(),
    expireCheckoutAttemptAndCompleteEvent: jest.fn(),
    expireAbandonedCheckoutAttempts: jest.fn(),
    purgeExpiredWebhookPayloads: jest.fn(),
  };
  const queue = { enqueueEvent: jest.fn() };
  const logger = { error: jest.fn() };
  let service: StripeWebhookService;

  const event = {
    id: 'evt_123',
    type: 'customer.subscription.updated',
    created: 1_700_000_000,
    data: { object: { id: 'sub_123' } },
  };
  const subscription = {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    metadata: { storeId: 'store-1', planPriceId: 'price-local-1' },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    trial_end: null,
    ended_at: null,
    items: {
      data: [
        {
          id: 'si_123',
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: { id: 'price_123' },
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeWebhookService(
      stripe as never,
      { webhookSecret: 'whsec_test' } as never,
      repository as never,
      queue as never,
      logger as never,
    );
    stripe.webhooks.constructEvent.mockReturnValue(event);
    repository.storeWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      status: 'pending',
    });
    repository.claimWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      stripeEventId: event.id,
      payload: event,
      attempts: 1,
      leaseToken: 'lease-1',
    });
    repository.findRecoverableWebhookEventIds.mockResolvedValue([]);
    stripe.subscriptions.retrieve.mockResolvedValue(subscription);
    queue.enqueueEvent.mockResolvedValue(undefined);
    repository.reconcileSubscriptionAndCompleteEvent.mockResolvedValue(
      undefined,
    );
  });

  it('durably stores a verified event and queues it without processing inline', async () => {
    const rawBody = Buffer.from('{}');

    await service.handle(rawBody, 'signature');

    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      rawBody,
      'signature',
      'whsec_test',
    );
    expect(repository.storeWebhookEvent).toHaveBeenCalledWith({
      stripeEventId: 'evt_123',
      eventType: 'customer.subscription.updated',
      stripeCreatedAt: new Date(1_700_000_000_000),
      payload: event,
    });
    expect(queue.enqueueEvent).toHaveBeenCalledWith('inbox-1');
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('acknowledges a durable event even when the queue nudge fails', async () => {
    queue.enqueueEvent.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.handle(Buffer.from('{}'), 'signature'),
    ).resolves.toBeUndefined();
    await Promise.resolve();

    expect(repository.storeWebhookEvent).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not wait for Redis after the event is durably stored', async () => {
    queue.enqueueEvent.mockReturnValue(new Promise(() => undefined));

    await expect(
      service.handle(Buffer.from('{}'), 'signature'),
    ).resolves.toBeUndefined();

    expect(repository.storeWebhookEvent).toHaveBeenCalled();
    expect(queue.enqueueEvent).toHaveBeenCalledWith('inbox-1');
  });

  it('does not queue a duplicate event that is already completed', async () => {
    repository.storeWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      status: 'completed',
    });

    await service.handle(Buffer.from('{}'), 'signature');

    expect(queue.enqueueEvent).not.toHaveBeenCalled();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature before recording the event', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(
      service.handle(Buffer.from('{}'), 'signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.storeWebhookEvent).not.toHaveBeenCalled();
  });

  it('processes a claimed event using Stripe current state', async () => {
    await service.processEvent('inbox-1');

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
    expect(
      repository.reconcileSubscriptionAndCompleteEvent,
    ).toHaveBeenCalledWith(
      'inbox-1',
      'lease-1',
      expect.objectContaining({
        stripeSubscriptionId: 'sub_123',
        stripeSubscriptionItemId: 'si_123',
        stripeCustomerId: 'cus_123',
        stripePriceId: 'price_123',
        storeId: 'store-1',
        planPriceId: 'price-local-1',
        status: 'active',
        currentPeriodStart: new Date(1_700_000_000_000),
        currentPeriodEnd: new Date(1_702_592_000_000),
      }),
    );
  });

  it('records a failed attempt with a future retry time', async () => {
    stripe.subscriptions.retrieve.mockRejectedValue(new Error('Stripe down'));

    await expect(service.processEvent('inbox-1')).rejects.toThrow(
      'Stripe down',
    );

    expect(repository.failWebhookEvent).toHaveBeenCalledWith(
      'inbox-1',
      'lease-1',
      'Stripe down',
      expect.any(Date),
    );
    const retryAt = repository.failWebhookEvent.mock.calls[0][3] as Date;
    expect(retryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('queues failed and stale processing events found by recovery', async () => {
    repository.findRecoverableWebhookEventIds.mockResolvedValue([
      'failed-inbox',
      'stale-processing-inbox',
    ]);

    await service.recoverDueEvents();

    expect(queue.enqueueEvent).toHaveBeenCalledWith('failed-inbox');
    expect(queue.enqueueEvent).toHaveBeenCalledWith('stale-processing-inbox');
  });

  it('does not process a duplicate job when its inbox claim is unavailable', async () => {
    repository.claimWebhookEvent
      .mockResolvedValueOnce({
        id: 'inbox-1',
        stripeEventId: event.id,
        payload: event,
        attempts: 1,
        leaseToken: 'lease-1',
      })
      .mockResolvedValueOnce(undefined);

    await service.processEvent('inbox-1');
    await service.processEvent('inbox-1');

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  });

  it('can retry safely after a worker processing failure', async () => {
    repository.claimWebhookEvent
      .mockResolvedValueOnce({
        id: 'inbox-1',
        stripeEventId: event.id,
        payload: event,
        attempts: 1,
        leaseToken: 'lease-1',
      })
      .mockResolvedValueOnce({
        id: 'inbox-1',
        stripeEventId: event.id,
        payload: event,
        attempts: 2,
        leaseToken: 'lease-2',
      });
    stripe.subscriptions.retrieve
      .mockRejectedValueOnce(new Error('worker terminated'))
      .mockResolvedValueOnce(subscription);

    await expect(service.processEvent('inbox-1')).rejects.toThrow(
      'worker terminated',
    );
    await expect(service.processEvent('inbox-1')).resolves.toBeUndefined();

    expect(
      repository.reconcileSubscriptionAndCompleteEvent,
    ).toHaveBeenCalledTimes(1);
  });

  it('recovers a lease left behind by a crashed worker', async () => {
    repository.findRecoverableWebhookEventIds.mockResolvedValue(['inbox-1']);
    repository.claimWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      stripeEventId: event.id,
      payload: event,
      attempts: 2,
      leaseToken: 'lease-2',
    });

    await service.recoverDueEvents();
    await service.processEvent('inbox-1');

    expect(queue.enqueueEvent).toHaveBeenCalledWith('inbox-1');
    expect(
      repository.reconcileSubscriptionAndCompleteEvent,
    ).toHaveBeenCalledTimes(1);
  });

  it('reopens and queues a failed or dead-letter event for manual replay', async () => {
    repository.replayWebhookEvent.mockResolvedValue(true);

    await expect(service.replay('inbox-1')).resolves.toBe(true);

    expect(repository.replayWebhookEvent).toHaveBeenCalledWith('inbox-1');
    expect(queue.enqueueEvent).toHaveBeenCalledWith('inbox-1');
  });

  it('does not queue an event that is unsafe to replay', async () => {
    repository.replayWebhookEvent.mockResolvedValue(false);

    await expect(service.replay('inbox-1')).resolves.toBe(false);

    expect(queue.enqueueEvent).not.toHaveBeenCalled();
  });

  it('expires a pending Checkout attempt from the asynchronous worker', async () => {
    const expiredEvent = {
      ...event,
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_expired' } },
    };
    repository.claimWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      stripeEventId: expiredEvent.id,
      payload: expiredEvent,
      attempts: 1,
      leaseToken: 'lease-1',
    });

    await service.processEvent('inbox-1');

    expect(
      repository.expireCheckoutAttemptAndCompleteEvent,
    ).toHaveBeenCalledWith('inbox-1', 'lease-1', 'cs_expired');
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('completes a Checkout attempt from the asynchronous worker', async () => {
    const completedEvent = {
      ...event,
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_123', subscription: 'sub_123' },
      },
    };
    repository.claimWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      stripeEventId: completedEvent.id,
      payload: completedEvent,
      attempts: 1,
      leaseToken: 'lease-1',
    });

    await service.processEvent('inbox-1');

    expect(
      repository.reconcileSubscriptionAndCompleteEvent,
    ).toHaveBeenCalledWith(
      'inbox-1',
      'lease-1',
      expect.objectContaining({ stripeSubscriptionId: 'sub_123' }),
      'cs_123',
    );
  });

  it('completes unrelated events without calling Stripe again', async () => {
    const unrelatedEvent = { ...event, type: 'invoice.paid' };
    repository.claimWebhookEvent.mockResolvedValue({
      id: 'inbox-1',
      stripeEventId: unrelatedEvent.id,
      payload: unrelatedEvent,
      attempts: 1,
      leaseToken: 'lease-1',
    });

    await service.processEvent('inbox-1');

    expect(repository.completeWebhookEvent).toHaveBeenCalledWith(
      'inbox-1',
      'lease-1',
    );
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('expires abandoned Checkout attempts and purges retained payloads during recovery', async () => {
    await service.recoverDueEvents();

    expect(repository.expireAbandonedCheckoutAttempts).toHaveBeenCalled();
    expect(repository.purgeExpiredWebhookPayloads).toHaveBeenCalled();
  });
});
