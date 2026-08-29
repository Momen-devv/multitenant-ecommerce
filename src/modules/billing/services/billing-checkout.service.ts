import { PlanProvisioningStatus } from '@/common/enums';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Stripe } from 'stripe';
import { CHECKOUT_SESSION_LIFETIME_MS } from '../repos/billing.repository';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
} from '../interfaces/repos';
import { STRIPE_CLIENT } from '../stripe/stripe.constants';

export type CreateSubscriptionCheckoutInput = {
  storeId: string;
  customerEmail: string;
  planPriceId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type SubscriptionCheckoutResult = {
  sessionId: string;
  url: string;
};

@Injectable()
export class BillingCheckoutService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(BILLING_REPOSITORY)
    private readonly billingRepository: IBillingRepository,
  ) {}

  async createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<SubscriptionCheckoutResult> {
    this.assertHttpUrl(input.successUrl, 'successUrl');
    this.assertHttpUrl(input.cancelUrl, 'cancelUrl');

    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new BadRequestException(
        'idempotencyKey must contain between 1 and 255 characters',
      );
    }

    const context = await this.billingRepository.findCheckoutContext(
      input.storeId,
      input.planPriceId,
    );
    if (!context) {
      throw new NotFoundException('Store or plan price was not found');
    }
    if (context.storeStatus !== 'active') {
      throw new ConflictException('The store is not active');
    }
    if (
      !context.planIsActive ||
      !context.priceIsActive ||
      context.provisioningStatus !== PlanProvisioningStatus.READY ||
      !context.stripePriceId
    ) {
      throw new ConflictException('The plan price is not available');
    }
    if (
      await this.billingRepository.hasNonTerminalSubscription(input.storeId)
    ) {
      throw new ConflictException(
        'The store already has a non-terminal subscription',
      );
    }

    const customer = await this.getOrCreateCustomer(
      input.storeId,
      context.storeName,
      input.customerEmail,
    );
    const attempt = await this.billingRepository.reservePendingCheckoutAttempt({
      storeId: input.storeId,
      planPriceId: input.planPriceId,
      stripeCustomerId: customer.stripeCustomerId,
      stripePriceId: context.stripePriceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: new Date(Date.now() + CHECKOUT_SESSION_LIFETIME_MS),
    });

    if (
      attempt.planPriceId !== input.planPriceId ||
      attempt.stripeCustomerId !== customer.stripeCustomerId ||
      attempt.stripePriceId !== context.stripePriceId ||
      attempt.successUrl !== input.successUrl ||
      attempt.cancelUrl !== input.cancelUrl
    ) {
      throw new ConflictException(
        'A pending Checkout attempt already exists with different details',
      );
    }

    return this.billingRepository.createOrReuseCheckoutSession(
      attempt.id,
      async () => {
        const attemptMetadata = {
          storeId: attempt.storeId,
          planPriceId: attempt.planPriceId,
        };
        const session = await this.stripe.checkout.sessions.create(
          {
            mode: 'subscription',
            customer: attempt.stripeCustomerId,
            client_reference_id: attempt.storeId,
            line_items: [{ price: attempt.stripePriceId, quantity: 1 }],
            success_url: attempt.successUrl,
            cancel_url: attempt.cancelUrl,
            metadata: attemptMetadata,
            subscription_data: { metadata: attemptMetadata },
            expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
          },
          {
            idempotencyKey: `subscription-checkout-attempt:${attempt.id}`,
          },
        );

        if (!session.url) {
          throw new Error(`Stripe Checkout Session ${session.id} has no URL`);
        }

        return { sessionId: session.id, url: session.url };
      },
    );
  }

  private async getOrCreateCustomer(
    storeId: string,
    storeName: string,
    customerEmail: string,
  ) {
    const existing = await this.billingRepository.findBillingCustomer(storeId);
    if (existing) return existing;

    const customer = await this.stripe.customers.create(
      { name: storeName, email: customerEmail, metadata: { storeId } },
      { idempotencyKey: `billing-customer:store:${storeId}` },
    );

    return this.billingRepository.saveBillingCustomer(storeId, customer.id);
  }

  private assertHttpUrl(value: string, fieldName: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(
        `${fieldName} must be an absolute HTTP or HTTPS URL`,
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException(
        `${fieldName} must be an absolute HTTP or HTTPS URL`,
      );
    }
  }
}
