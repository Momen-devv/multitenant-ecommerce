import type { ApiListQueryInput, CursorPage } from '@/common/api-query';
import type {
  NewPlan,
  NewPlanPrice,
  Plan,
  PlanPrice,
} from '@/infrastructure/database/schema/schema.types';

export type PlanWithPrices = Plan & { prices: PlanPrice[] };
export type CreatePendingPlanWithPricesInput = {
  plan: Pick<NewPlan, 'name' | 'code' | 'description' | 'features' | 'limits'>;
  prices: Array<Pick<NewPlanPrice, 'amount' | 'currency' | 'interval'>>;
};
export type UpdatePlanInput = Partial<
  Pick<NewPlan, 'name' | 'description' | 'features' | 'limits'>
>;
export type ProvisioningRecoveryCandidate = {
  planId: string;
  provisioningVersion: number;
};
export type CompleteProvisioningInput = {
  planId: string;
  provisioningVersion: number;
  stripeProductId: string;
  prices: Array<{
    planPriceId: string;
    stripePriceId: string;
    stripeLookupKey: string | null;
  }>;
};

export interface IPlatformPlansRepository {
  createPendingWithPrices(
    input: CreatePendingPlanWithPricesInput,
  ): Promise<PlanWithPrices | undefined>;
  findById(planId: string): Promise<PlanWithPrices | undefined>;
  findPage(
    input: ApiListQueryInput,
  ): Promise<CursorPage<Record<string, unknown>>>;
  updatePlan(planId: string, input: UpdatePlanInput): Promise<Plan | undefined>;
  activatePlan(planId: string): Promise<boolean>;
  deactivatePlan(planId: string): Promise<boolean>;
  resetProvisioningForRetry(
    planId: string,
    provisioningVersion: number,
  ): Promise<boolean>;
  findForProvisioning(planId: string): Promise<PlanWithPrices | undefined>;
  findProvisioningRecoveryCandidates(input: {
    pendingBefore: Date;
    processingBefore: Date;
    limit: number;
  }): Promise<ProvisioningRecoveryCandidate[]>;
  markProvisioningProcessing(
    planId: string,
    provisioningVersion: number,
  ): Promise<boolean>;
  completeProvisioning(input: CompleteProvisioningInput): Promise<void>;
  markProvisioningFailed(
    planId: string,
    provisioningVersion: number,
    error: string,
  ): Promise<void>;
}
