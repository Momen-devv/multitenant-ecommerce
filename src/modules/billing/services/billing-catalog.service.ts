import { Inject, Injectable } from '@nestjs/common';
import { BillingInterval } from '@/common/enums/billing-interval.enum';
import { STRIPE_CLIENT } from '../stripe/stripe.constants';
import type { Stripe } from 'stripe';

type CreateRecurringPriceInput = {
  stripeProductId: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  lookupKey: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

type CreateProductWithPricesInput = {
  planId: string;
  name: string;
  description?: string;
  code: string;
  provisioningVersion: number;
  prices: Array<{
    amount: number;
    currency: string;
    interval: BillingInterval;
  }>;
};
@Injectable()
export class BillingCatalogService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  async createProductWithPrices(input: CreateProductWithPricesInput) {
    const keyVersion = `v${input.provisioningVersion}`;

    // 1. Create Stripe Product: “Pro”
    const product = await this.stripe.products.create(
      {
        name: input.name,
        description: input.description,
        active: false,
        metadata: {
          planId: input.planId,
          planCode: input.code,
          provisioningVersion: String(input.provisioningVersion),
        },
      },
      {
        idempotencyKey: `plan:${input.planId}:product:create:${keyVersion}`,
      },
    );

    // 2. Create its monthly/yearly recurring Stripe Prices
    const prices = await Promise.all(
      input.prices.map((price) => {
        const currency = price.currency.toLowerCase();

        return this.createRecurringPrice({
          stripeProductId: product.id,
          amount: price.amount,
          currency,
          interval: price.interval,
          lookupKey: `${input.code}_${price.interval}_${currency}_${keyVersion}`,
          idempotencyKey: `plan:${input.planId}:price:${currency}:${price.interval}:${keyVersion}`,
          metadata: {
            planId: input.planId,
            planCode: input.code,
            provisioningVersion: String(input.provisioningVersion),
          },
        });
      }),
    );

    return { product, prices };
  }

  async createRecurringPrice(input: CreateRecurringPriceInput) {
    return this.stripe.prices.create(
      {
        product: input.stripeProductId,
        unit_amount: input.amount,
        currency: input.currency,
        recurring: {
          interval: input.interval,
        },
        lookup_key: input.lookupKey,
        metadata: input.metadata,
      },
      {
        idempotencyKey: input.idempotencyKey,
      },
    );
  }

  async createPlanPrice(input: {
    planId: string;
    planPriceId: string;
    planCode: string;
    stripeProductId: string;
    amount: number;
    currency: string;
    interval: BillingInterval;
  }) {
    const currency = input.currency.toLowerCase();

    return this.createRecurringPrice({
      stripeProductId: input.stripeProductId,
      amount: input.amount,
      currency,
      interval: input.interval,
      lookupKey: `${input.planCode}_${input.interval}_${currency}_${input.planPriceId}`,
      idempotencyKey: `plan-price:${input.planPriceId}:create`,
      metadata: {
        planId: input.planId,
        planCode: input.planCode,
        planPriceId: input.planPriceId,
      },
    });
  }

  async updateProduct(
    stripeProductId: string,
    input: { name?: string; description?: string },
  ) {
    return this.stripe.products.update(stripeProductId, input);
  }

  async archivePrice(stripePriceId: string) {
    // Stops this price from being selected for NEW subscriptions.
    // It does not cancel existing subscriptions using it.
    return this.stripe.prices.update(stripePriceId, {
      active: false,
    });
  }

  async activateProduct(stripeProductId: string) {
    return this.stripe.products.update(stripeProductId, {
      active: true,
    });
  }

  async archiveProduct(stripeProductId: string) {
    // Stripe archive = make inactive; do not delete it.
    return this.stripe.products.update(stripeProductId, {
      active: false,
    });
  }
}
