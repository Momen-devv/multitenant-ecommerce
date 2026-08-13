import type {
  Store,
  User,
} from '@/infrastructure/database/schema/schema.types';

export type PlatformStoreOwnerSummary = Pick<User, 'id' | 'name' | 'email'>;

export type PlatformStoreResponse = Pick<
  Store,
  | 'id'
  | 'name'
  | 'slug'
  | 'description'
  | 'logo'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
> & {
  owner: PlatformStoreOwnerSummary;
};

export type StoreWithOwner = Store & {
  owner: PlatformStoreOwnerSummary;
};
