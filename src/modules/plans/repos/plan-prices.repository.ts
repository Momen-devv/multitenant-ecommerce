import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { PlanProvisioningStatus } from '@/common/enums';
import {
  planPrices,
  plans,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { type NewPlanPrice } from '@/infrastructure/database/schema/schema.types';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IPlanPricesRepository } from '../interfaces/repos/plan-prices-repository.interface';

@Injectable()
export class PlanPricesRepository implements IPlanPricesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createOrFindPendingPrice(
    planId: string,
    price: {
      amount: number;
      currency: string;
      interval: NonNullable<NewPlanPrice['interval']>;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const [plan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, planId))
        .limit(1)
        .for('update');
      if (!plan) return { status: 'plan_not_found' as const };
      if (
        plan.provisioningStatus !== PlanProvisioningStatus.READY ||
        !plan.stripeProductId
      )
        return { status: 'plan_not_ready' as const };
      const existing = await tx.query.planPrices.findMany({
        where: and(
          eq(planPrices.planId, planId),
          eq(planPrices.currency, price.currency),
          eq(planPrices.interval, price.interval),
        ),
      });
      if (existing.some((candidate) => candidate.isActive))
        return { status: 'active_price_exists' as const };
      const pending = existing.find(
        (candidate) => !candidate.stripePriceId && !candidate.isActive,
      );
      if (pending)
        return pending.amount !== price.amount
          ? { status: 'pending_price_exists' as const }
          : { status: 'ready' as const, plan, price: pending };
      const [created] = await tx
        .insert(planPrices)
        .values({
          planId,
          ...price,
          stripePriceId: null,
          stripeLookupKey: null,
          isActive: false,
        })
        .returning();
      return { status: 'ready' as const, plan, price: created };
    });
  }

  async activatePendingPrice(input: {
    planId: string;
    planPriceId: string;
    stripePriceId: string;
    stripeLookupKey: string | null;
  }) {
    const [updated] = await this.db
      .update(planPrices)
      .set({
        stripePriceId: input.stripePriceId,
        stripeLookupKey: input.stripeLookupKey,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planPrices.id, input.planPriceId),
          eq(planPrices.planId, input.planId),
          isNull(planPrices.stripePriceId),
          eq(planPrices.isActive, false),
        ),
      )
      .returning();
    return updated;
  }

  findPriceById(planId: string, planPriceId: string) {
    return this.db.query.planPrices.findFirst({
      where: and(eq(planPrices.id, planPriceId), eq(planPrices.planId, planId)),
    });
  }
  async deactivatePrice(planId: string, planPriceId: string) {
    const [updated] = await this.db
      .update(planPrices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(planPrices.id, planPriceId), eq(planPrices.planId, planId)))
      .returning();
    return updated;
  }
}
