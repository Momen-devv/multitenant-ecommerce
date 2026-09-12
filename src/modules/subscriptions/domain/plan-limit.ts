import { SubscriptionStatus } from '@/common/enums';
import type { CurrentPlanEntitlement } from '../interfaces/repos';

export type PlanLimitResolution =
  | { kind: 'available'; limit: number }
  | { kind: 'subscription-required' }
  | { kind: 'limit-missing' };

export function resolvePlanLimit(
  entitlement: CurrentPlanEntitlement | null,
  key: string,
): PlanLimitResolution {
  if (
    entitlement?.status !== SubscriptionStatus.ACTIVE &&
    entitlement?.status !== SubscriptionStatus.TRIALING
  ) {
    return { kind: 'subscription-required' };
  }
  const limit = entitlement.plan.limits[key];
  return typeof limit === 'number'
    ? { kind: 'available', limit }
    : { kind: 'limit-missing' };
}
