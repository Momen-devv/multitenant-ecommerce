import type {
  Plan,
  PlanPrice,
  Subscription,
} from '@/infrastructure/database/schema/schema.types';

export type CurrentSubscription = Pick<
  Subscription,
  | 'id'
  | 'status'
  | 'currentPeriodStart'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
  | 'cancelAt'
  | 'canceledAt'
  | 'trialEndsAt'
  | 'endedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  plan: Pick<
    Plan,
    'id' | 'code' | 'name' | 'description' | 'features' | 'limits'
  >;
  price: Pick<PlanPrice, 'id' | 'amount' | 'currency' | 'interval'>;
};

export type CurrentPlanEntitlement = Pick<Subscription, 'status'> & {
  plan: Pick<Plan, 'limits'>;
};

export interface ISubscriptionsRepository {
  findCurrentByStoreId(storeId: string): Promise<CurrentSubscription | null>;
  findCurrentPlanEntitlementByStoreId(
    storeId: string,
  ): Promise<CurrentPlanEntitlement | null>;
}
