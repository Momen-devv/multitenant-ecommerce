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
import { DrizzleQueryError, eq } from 'drizzle-orm';
import { DatabaseError } from 'pg-protocol';
import { PlanCodeConflictError } from '@/common/errors/plan-code-conflict.error';

@Injectable()
export class PlansRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(data: NewPlan): Promise<Plan> {
    try {
      const [created] = await this.db.insert(plans).values(data).returning();

      return created;
    } catch (error) {
      if (this.isUniqueViolation(error, 'plans_code_unique')) {
        throw new PlanCodeConflictError();
      }
      throw error;
    }
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

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
