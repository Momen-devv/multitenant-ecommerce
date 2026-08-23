import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { PlanCodeConflictError } from '@/common/errors/plan-code-conflict.error';
import { PlanProvisioningStatus } from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import {
  plans,
  planPrices,
} from '@/infrastructure/database/schema/billing.schema';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  type NewPlan,
  type NewPlanPrice,
} from '@/infrastructure/database/schema/schema.types';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  DrizzleQueryError,
  eq,
  exists,
  isNotNull,
  lte,
  ne,
  or,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { adminPlanQuery } from '../queries/admin-plan.query';
import {
  PLAN_PROVISIONING_REQUESTED_EVENT,
  type PlanProvisioningRequestedPayload,
} from '../provisioning/plan-provisioning.events';

type CreatePendingPlanWithPricesInput = {
  plan: Pick<NewPlan, 'name' | 'code' | 'description' | 'features' | 'limits'>;
  prices: Array<Pick<NewPlanPrice, 'amount' | 'currency' | 'interval'>>;
};
type UpdatePlanInput = Partial<
  Pick<NewPlan, 'name' | 'description' | 'features' | 'limits'>
>;

@Injectable()
export class AdminPlansRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createPendingWithPrices(input: CreatePendingPlanWithPricesInput) {
    try {
      return await this.db.transaction(async (tx) => {
        const [plan] = await tx
          .insert(plans)
          .values({
            ...input.plan,
            stripeProductId: null,
            provisioningStatus: PlanProvisioningStatus.PENDING,
            provisioningVersion: 1,
            provisioningError: null,
            isActive: false,
          })
          .returning();
        await tx.insert(planPrices).values(
          input.prices.map((price) => ({
            ...price,
            planId: plan.id,
            stripePriceId: null,
            stripeLookupKey: null,
            isActive: false,
          })),
        );
        const payload: PlanProvisioningRequestedPayload = {
          planId: plan.id,
          provisioningVersion: plan.provisioningVersion,
        };
        await tx.insert(outboxEvents).values({
          eventType: PLAN_PROVISIONING_REQUESTED_EVENT,
          aggregateId: plan.id,
          payload,
          deduplicationKey: `${plan.id}:v${plan.provisioningVersion}`,
        });
        return tx.query.plans.findFirst({
          where: eq(plans.id, plan.id),
          with: { prices: true },
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error, 'plans_code_unique'))
        throw new PlanCodeConflictError();
      throw error;
    }
  }

  findById(planId: string) {
    return this.db.query.plans.findFirst({
      where: eq(plans.id, planId),
      with: { prices: true },
    });
  }

  async findPage(input: ApiListQueryInput) {
    const query = compileApiQuery(adminPlanQuery, input);
    const rows = await this.db.query.plans.findMany({
      columns: query.columns,
      where: query.where,
      orderBy: query.orderBy,
      limit: query.limit + 1,
      with: { prices: true },
    });
    return query.createPage(rows, (row) => ({ prices: row.prices }));
  }

  async updatePlan(planId: string, input: UpdatePlanInput) {
    const [updated] = await this.db
      .update(plans)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(plans.id, planId))
      .returning();
    return updated;
  }

  async activatePlan(planId: string): Promise<boolean> {
    const activeProvisionedPrice = this.db
      .select({ id: planPrices.id })
      .from(planPrices)
      .where(
        and(
          eq(planPrices.planId, plans.id),
          eq(planPrices.isActive, true),
          isNotNull(planPrices.stripePriceId),
        ),
      );
    const updated = await this.db
      .update(plans)
      .set({ isActive: true, updatedAt: new Date() })
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.provisioningStatus, PlanProvisioningStatus.READY),
          isNotNull(plans.stripeProductId),
          exists(activeProvisionedPrice),
        ),
      )
      .returning({ id: plans.id });
    return updated.length === 1;
  }

  async deactivatePlan(planId: string): Promise<boolean> {
    const updated = await this.db
      .update(plans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.provisioningStatus, PlanProvisioningStatus.READY),
          isNotNull(plans.stripeProductId),
        ),
      )
      .returning({ id: plans.id });
    return updated.length === 1;
  }

  async resetProvisioningForRetry(
    planId: string,
    provisioningVersion: number,
  ): Promise<boolean> {
    const updated = await this.db
      .update(plans)
      .set({
        provisioningStatus: PlanProvisioningStatus.PENDING,
        provisioningError: null,
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.provisioningVersion, provisioningVersion),
          ne(plans.provisioningStatus, PlanProvisioningStatus.READY),
        ),
      )
      .returning({ id: plans.id });
    return updated.length === 1;
  }

  findForProvisioning(planId: string) {
    return this.db.query.plans.findFirst({
      where: eq(plans.id, planId),
      with: { prices: true },
    });
  }

  findProvisioningRecoveryCandidates(input: {
    pendingBefore: Date;
    processingBefore: Date;
    limit: number;
  }) {
    return this.db
      .select({
        planId: plans.id,
        provisioningVersion: plans.provisioningVersion,
      })
      .from(plans)
      .where(
        or(
          and(
            eq(plans.provisioningStatus, PlanProvisioningStatus.PENDING),
            lte(plans.updatedAt, input.pendingBefore),
          ),
          and(
            eq(plans.provisioningStatus, PlanProvisioningStatus.PROCESSING),
            lte(plans.updatedAt, input.processingBefore),
          ),
        ),
      )
      .orderBy(asc(plans.updatedAt))
      .limit(input.limit);
  }

  async markProvisioningProcessing(
    planId: string,
    provisioningVersion: number,
  ): Promise<boolean> {
    const updated = await this.db
      .update(plans)
      .set({
        provisioningStatus: PlanProvisioningStatus.PROCESSING,
        provisioningError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.provisioningVersion, provisioningVersion),
          ne(plans.provisioningStatus, PlanProvisioningStatus.READY),
        ),
      )
      .returning({ id: plans.id });
    return updated.length === 1;
  }

  async completeProvisioning(input: {
    planId: string;
    provisioningVersion: number;
    stripeProductId: string;
    prices: Array<{
      planPriceId: string;
      stripePriceId: string;
      stripeLookupKey: string | null;
    }>;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const price of input.prices) {
        const updatedPrices = await tx
          .update(planPrices)
          .set({
            stripePriceId: price.stripePriceId,
            stripeLookupKey: price.stripeLookupKey,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(planPrices.id, price.planPriceId),
              eq(planPrices.planId, input.planId),
            ),
          )
          .returning({ id: planPrices.id });
        if (updatedPrices.length !== 1) {
          throw new Error(`Plan price ${price.planPriceId} was not found`);
        }
      }

      const updatedPlans = await tx
        .update(plans)
        .set({
          stripeProductId: input.stripeProductId,
          provisioningStatus: PlanProvisioningStatus.READY,
          provisioningError: null,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(plans.id, input.planId),
            eq(plans.provisioningVersion, input.provisioningVersion),
            eq(plans.provisioningStatus, PlanProvisioningStatus.PROCESSING),
          ),
        )
        .returning({ id: plans.id });
      if (updatedPlans.length !== 1) {
        throw new Error(`Plan ${input.planId} is no longer being provisioned`);
      }
    });
  }

  async markProvisioningFailed(
    planId: string,
    provisioningVersion: number,
    error: string,
  ): Promise<void> {
    await this.db
      .update(plans)
      .set({
        provisioningStatus: PlanProvisioningStatus.FAILED,
        provisioningError: error.slice(0, 1000),
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.provisioningVersion, provisioningVersion),
          ne(plans.provisioningStatus, PlanProvisioningStatus.READY),
        ),
      );
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    return (
      err instanceof DrizzleQueryError &&
      err.cause instanceof DatabaseError &&
      err.cause.code === '23505' &&
      (constraintName ? err.cause.constraint === constraintName : true)
    );
  }
}
