export const STORE_STATUSES = [
  'active',
  'owner_closed',
  'platform_suspended',
] as const;

export type StoreStatus = (typeof STORE_STATUSES)[number];

export type StoreLifecycleActorAuthority =
  | 'store_owner'
  | 'platform_super_admin';
