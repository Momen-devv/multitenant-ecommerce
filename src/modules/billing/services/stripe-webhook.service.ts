import { SubscriptionStatus } from '@/common/enums';
import { stripeConfig } from '@/core/config';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type Stripe from 'stripe';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { type SubscriptionProjection } from '../repos/billing.repository';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
} from '../interfaces/repos';
import { STRIPE_CLIENT } from '../stripe/stripe.constants';
import { StripeWebhookQueueService } from '@/infrastructure/queue/stripe-webhook/stripe-webhook-queue.service';

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);
const WEBHOOK_RETRY_BASE_DELAY_MS = 30_000;
const WEBHOOK_RETRY_MAX_DELAY_MS = 60 * 60 * 1000;

@Injectable()
export class StripeWebhookService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(stripeConfig.KEY)
    private readonly config: ConfigType<typeof stripeConfig>,
    @Inject(BILLING_REPOSITORY)
    private readonly billingRepository: IBillingRepository,
    private readonly webhookQueue: StripeWebhookQueueService,
    private readonly logger: LoggerService,
  ) {}

  async handle(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const stored = await this.billingRepository.storeWebhookEvent({
      stripeEventId: event.id,
      eventType: event.type,
      stripeCreatedAt: new Date(event.created * 1000),
      payload: event as unknown as Record<string, unknown>,
    });

    if (stored.status === 'completed' || stored.status === 'dead_letter')
      return;

    void this.enqueueSafely(stored.id);
  }

  private async enqueueSafely(eventId: string): Promise<void> {
    try {
      await this.webhookQueue.enqueueEvent(eventId);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue Stripe webhook inbox event ${eventId}`,
        error,
        StripeWebhookService.name,
      );
    }
  }

  async processEvent(eventId: string): Promise<void> {
    const claimed = await this.billingRepository.claimWebhookEvent(eventId);
    if (!claimed) return;
    if (!claimed.payload || !claimed.leaseToken) return;

    const event = claimed.payload as unknown as Stripe.Event;

    try {
      if (event.type === 'checkout.session.expired') {
        await this.billingRepository.expireCheckoutAttemptAndCompleteEvent(
          claimed.id,
          claimed.leaseToken,
          event.data.object.id,
        );
        return;
      }

      const subscriptionId = this.getSubscriptionId(event);
      if (!subscriptionId) {
        await this.billingRepository.completeWebhookEvent(
          claimed.id,
          claimed.leaseToken,
        );
        return;
      }

      // Stripe is the source of truth. Re-fetching prevents a delayed event from
      // overwriting a newer subscription state in the local projection.
      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      const projection = this.toProjection(subscription);
      if (event.type === 'checkout.session.completed') {
        await this.billingRepository.reconcileSubscriptionAndCompleteEvent(
          claimed.id,
          claimed.leaseToken,
          projection,
          event.data.object.id,
        );
      } else {
        await this.billingRepository.reconcileSubscriptionAndCompleteEvent(
          claimed.id,
          claimed.leaseToken,
          projection,
        );
      }
    } catch (error) {
      await this.billingRepository.failWebhookEvent(
        claimed.id,
        claimed.leaseToken,
        error instanceof Error ? error.message : String(error),
        this.nextRetryAt(claimed.attempts),
      );
      throw error;
    }
  }

  async recoverDueEvents(): Promise<void> {
    await Promise.all([
      this.billingRepository.expireAbandonedCheckoutAttempts(),
      this.billingRepository.purgeExpiredWebhookPayloads(),
    ]);
    const eventIds =
      await this.billingRepository.findRecoverableWebhookEventIds();
    await Promise.all(
      eventIds.map((eventId) => this.webhookQueue.enqueueEvent(eventId)),
    );
  }

  async replay(eventId: string): Promise<boolean> {
    const replayed = await this.billingRepository.replayWebhookEvent(eventId);
    if (!replayed) return false;
    await this.webhookQueue.enqueueEvent(eventId);
    return true;
  }

  private nextRetryAt(attempts: number): Date {
    const delay = Math.min(
      WEBHOOK_RETRY_BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
      WEBHOOK_RETRY_MAX_DELAY_MS,
    );
    return new Date(Date.now() + delay);
  }

  private getSubscriptionId(event: Stripe.Event): string | undefined {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (typeof session.subscription === 'string') return session.subscription;
      return session.subscription?.id;
    }

    if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
      return (event.data.object as Stripe.Subscription).id;
    }

    return undefined;
  }

  private toProjection(
    subscription: Stripe.Subscription,
  ): SubscriptionProjection {
    if (subscription.items.data.length !== 1) {
      throw new Error(
        `Subscription ${subscription.id} must contain exactly one item`,
      );
    }

    const item = subscription.items.data[0];
    const status = subscription.status as SubscriptionStatus;
    if (!Object.values(SubscriptionStatus).includes(status)) {
      throw new Error(
        `Unsupported Stripe subscription status ${subscription.status}`,
      );
    }

    return {
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionItemId: item.id,
      stripeCustomerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      stripePriceId: item.price.id,
      storeId: subscription.metadata.storeId || undefined,
      planPriceId: subscription.metadata.planPriceId || undefined,
      status,
      currentPeriodStart: this.fromUnixTime(item.current_period_start),
      currentPeriodEnd: this.fromUnixTime(item.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: this.fromUnixTime(subscription.cancel_at),
      canceledAt: this.fromUnixTime(subscription.canceled_at),
      trialEndsAt: this.fromUnixTime(subscription.trial_end),
      endedAt: this.fromUnixTime(subscription.ended_at),
    };
  }

  private fromUnixTime(value: number | null): Date | null {
    return value === null ? null : new Date(value * 1000);
  }
}
