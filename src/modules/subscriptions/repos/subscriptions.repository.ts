import { SubscriptionStatus } from '@/common/enums';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  planPrices,
  plans,
  subscriptions,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ISubscriptionsRepository } from '../interfaces/repos/subscriptions-repository.interface';

const TERMINAL_STATUSES = [
  SubscriptionStatus.INCOMPLETE_EXPIRED,
  SubscriptionStatus.CANCELED,
];

@Injectable()
export class SubscriptionsRepository implements ISubscriptionsRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findCurrentByStoreId(storeId: string) {
    const [subscription] = await this.db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        cancelAt: subscriptions.cancelAt,
        canceledAt: subscriptions.canceledAt,
        trialEndsAt: subscriptions.trialEndsAt,
        endedAt: subscriptions.endedAt,
        createdAt: subscriptions.createdAt,
        updatedAt: subscriptions.updatedAt,
        plan: {
          id: plans.id,
          code: plans.code,
          name: plans.name,
          description: plans.description,
          features: plans.features,
          limits: plans.limits,
        },
        price: {
          id: planPrices.id,
          amount: planPrices.amount,
          currency: planPrices.currency,
          interval: planPrices.interval,
        },
      })
      .from(subscriptions)
      .innerJoin(planPrices, eq(planPrices.id, subscriptions.planPriceId))
      .innerJoin(plans, eq(plans.id, planPrices.planId))
      .where(
        and(
          eq(subscriptions.storeId, storeId),
          notInArray(subscriptions.status, TERMINAL_STATUSES),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return subscription ?? null;
  }

  async findCurrentPlanEntitlementByStoreId(storeId: string) {
    const [subscription] = await this.db
      .select({
        status: subscriptions.status,
        plan: {
          limits: plans.limits,
        },
      })
      .from(subscriptions)
      .innerJoin(planPrices, eq(planPrices.id, subscriptions.planPriceId))
      .innerJoin(plans, eq(plans.id, planPrices.planId))
      .where(
        and(
          eq(subscriptions.storeId, storeId),
          notInArray(subscriptions.status, TERMINAL_STATUSES),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return subscription ?? null;
  }
}
