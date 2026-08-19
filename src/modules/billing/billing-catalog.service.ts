import { Inject, Injectable } from '@nestjs/common';
import { BillingInterval } from '@/common/enums/billing-interval.enum';
import { STRIPE_CLIENT } from './stripe/stripe.constants';
import type { Stripe } from 'stripe';

type CreateRecurringPriceInput = {
  stripeProductId: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  lookupKey: string;
  planId: string;
  metadata?: Record<string, string>;
};

type CreateProductWithPricesInput = {
  planId: string;
  name: string;
  description?: string;
  code: string;
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
    // 1. Create Stripe Product: “Pro”
    const product = await this.stripe.products.create(
      {
        name: input.name,
        description: input.description,
        metadata: {
          planId: input.planId,
          planCode: input.code,
        },
      },
      {
        idempotencyKey: `plan:${input.planId}:product:create:v1`,
      },
    );

    // 2. Create its monthly/yearly recurring Stripe Prices
    const prices = await Promise.all(
      input.prices.map((price) =>
        this.createRecurringPrice({
          stripeProductId: product.id,
          amount: price.amount,
          currency: price.currency,
          interval: price.interval,
          lookupKey: `${input.code}_${price.interval}_${price.currency}_v1`,
          planId: input.planId,
          metadata: {
            planId: input.planId,
            planCode: input.code,
          },
        }),
      ),
    );

    return { product, prices };
  }

  async createRecurringPrice(input: CreateRecurringPriceInput) {
    return this.stripe.prices.create(
      {
        product: input.stripeProductId,
        unit_amount: input.amount,
        currency: input.currency.toLowerCase(),
        recurring: {
          interval: input.interval,
        },
        lookup_key: input.lookupKey,
        metadata: input.metadata,
      },
      {
        idempotencyKey: `plan:${input.planId}:price:${input.currency}:${input.interval}:v1`,
      },
    );
  }

  async archivePrice(stripePriceId: string) {
    // Stops this price from being selected for NEW subscriptions.
    // It does not cancel existing subscriptions using it.
    return this.stripe.prices.update(stripePriceId, {
      active: false,
    });
  }

  async archiveProduct(stripeProductId: string) {
    // Stripe archive = make inactive; do not delete it.
    return this.stripe.products.update(stripeProductId, {
      active: false,
    });
  }
}
