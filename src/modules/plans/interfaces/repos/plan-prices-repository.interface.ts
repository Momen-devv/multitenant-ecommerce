import type {
  Plan,
  PlanPrice,
} from '@/infrastructure/database/schema/schema.types';

export type CreatePendingPlanPriceInput = {
  amount: number;
  currency: string;
  interval: NonNullable<PlanPrice['interval']>;
};

export type ActivatePendingPlanPriceInput = {
  planId: string;
  planPriceId: string;
  stripePriceId: string;
  stripeLookupKey: string | null;
};

export type CreatePendingPlanPriceResult =
  | { status: 'plan_not_found' }
  | { status: 'plan_not_ready' }
  | { status: 'active_price_exists' }
  | { status: 'pending_price_exists' }
  | { status: 'ready'; plan: Plan; price: PlanPrice };

export interface IPlanPricesRepository {
  createOrFindPendingPrice(
    planId: string,
    price: CreatePendingPlanPriceInput,
  ): Promise<CreatePendingPlanPriceResult>;
  activatePendingPrice(
    input: ActivatePendingPlanPriceInput,
  ): Promise<PlanPrice | undefined>;
  findPriceById(
    planId: string,
    planPriceId: string,
  ): Promise<PlanPrice | undefined>;
  deactivatePrice(
    planId: string,
    planPriceId: string,
  ): Promise<PlanPrice | undefined>;
}
