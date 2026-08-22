import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  NewPlan,
  NewPlanPrice,
} from '@/infrastructure/database/schema/schema.types';
import {
  planPrices,
  plans,
} from '@/infrastructure/database/schema/billing.schema';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import {
  and,
  asc,
  DrizzleQueryError,
  eq,
  exists,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
} from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PlanCodeConflictError } from '@/common/errors/plan-code-conflict.error';
import { PlanProvisioningStatus } from '@/common/enums';
import {
  PLAN_PROVISIONING_REQUESTED_EVENT,
  type PlanProvisioningRequestedPayload,
} from '../provisioning/plan-provisioning.events';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import { adminPlanQuery } from '../queries/admin-plan.query';
import { publicPlanQuery } from '../queries/public-plan.query';

type CreatePendingPlanWithPricesInput = {
  plan: Pick<NewPlan, 'name' | 'code' | 'description' | 'features' | 'limits'>;
  prices: Array<Pick<NewPlanPrice, 'amount' | 'currency' | 'interval'>>;
};

type UpdatePlanInput = Partial<
  Pick<NewPlan, 'name' | 'description' | 'features' | 'limits'>
>;

@Injectable()
export class PlansRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
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
      if (this.isUniqueViolation(error, 'plans_code_unique')) {
        throw new PlanCodeConflictError();
      }
      throw error;
    }
  }

  findForProvisioning(planId: string) {
    return this.db.query.plans.findFirst({
      where: eq(plans.id, planId),
      with: { prices: true },
    });
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

    return query.createPage(rows, (row) => ({
      prices: row.prices,
    }));
  }

  async findActivePage(input: ApiListQueryInput) {
    const query = compileApiQuery(publicPlanQuery, input);
    const rows = await this.db.query.plans.findMany({
      columns: query.columns,
      where: and(
        eq(plans.isActive, true),
        eq(plans.provisioningStatus, PlanProvisioningStatus.READY),
        query.where,
      ),
      orderBy: query.orderBy,
      limit: query.limit + 1,
      with: {
        prices: {
          where: eq(planPrices.isActive, true),
          columns: {
            id: true,
            amount: true,
            currency: true,
            interval: true,
          },
        },
      },
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
      ) {
        return { status: 'plan_not_ready' as const };
      }

      const existing = await tx.query.planPrices.findMany({
        where: and(
          eq(planPrices.planId, planId),
          eq(planPrices.currency, price.currency),
          eq(planPrices.interval, price.interval),
        ),
      });

      if (existing.some((candidate) => candidate.isActive)) {
        return { status: 'active_price_exists' as const };
      }

      const pending = existing.find(
        (candidate) => !candidate.stripePriceId && !candidate.isActive,
      );
      if (pending) {
        if (pending.amount !== price.amount) {
          return { status: 'pending_price_exists' as const };
        }
        return { status: 'ready' as const, plan, price: pending };
      }

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

  findActiveByCode(code: string) {
    return this.db.query.plans.findFirst({
      where: and(
        eq(plans.code, code),
        eq(plans.isActive, true),
        eq(plans.provisioningStatus, PlanProvisioningStatus.READY),
      ),
      columns: {
        id: true,
        name: true,
        code: true,
        description: true,
        features: true,
        limits: true,
      },
      with: {
        prices: {
          where: eq(planPrices.isActive, true),
          columns: {
            id: true,
            amount: true,
            currency: true,
            interval: true,
          },
        },
      },
    });
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
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
