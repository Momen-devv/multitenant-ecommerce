import { StoreStatus as CommonStoreStatus } from '@/common/enums';

export const STORE_STATUSES = Object.values(CommonStoreStatus) as [
  CommonStoreStatus,
  ...CommonStoreStatus[],
];

export type StoreStatus = CommonStoreStatus;

export type StoreLifecycleActorAuthority =
  | 'store_owner'
  | 'platform_super_admin';
