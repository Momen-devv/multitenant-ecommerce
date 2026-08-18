import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  NewPlan,
  NewPlanPrice,
  Plan,
} from '@/infrastructure/database/schema/schema.types';
import {
  planPrices,
  plans,
} from '@/infrastructure/database/schema/billing.schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class PlansRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(data: NewPlan): Promise<Plan> {
    const [created] = await this.db.insert(plans).values(data).returning();

    return created;
  }

  async findByCode(code: string): Promise<Plan | undefined> {
    return this.db.query.plans.findFirst({
      where: eq(plans.code, code),
    });
  }

  async activatePlanWithPrices(input: {
    planId: string;
    stripeProductId: string;
    prices: Array<
      Pick<
        NewPlanPrice,
        'amount' | 'currency' | 'interval' | 'stripePriceId' | 'stripeLookupKey'
      >
    >;
  }) {
    return this.db.transaction(async (tx) => {
      await tx
        .update(plans)
        .set({
          stripeProductId: input.stripeProductId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(plans.id, input.planId));

      await tx.insert(planPrices).values(
        input.prices.map((price) => ({
          ...price,
          planId: input.planId,
          isActive: true,
        })),
      );

      return tx.query.plans.findFirst({
        where: eq(plans.id, input.planId),
        with: { prices: true },
      });
    });
  }
}
