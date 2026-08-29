import type { ApiListQueryInput, CursorPage } from '@/common/api-query';
import type {
  NewStore,
  Store,
  User,
} from '@/infrastructure/database/schema/schema.types';
import type {
  StoreLifecycleActorAuthority,
  StoreStatus,
} from '../../domain/store-status';

export type StoreWithOwner = Store & {
  owner: Pick<User, 'id' | 'name' | 'email'>;
};
export type TransitionStoreStatusInput = {
  storeId: string;
  actorId: string;
  actorAuthority: StoreLifecycleActorAuthority;
  previousStatus: StoreStatus;
  newStatus: StoreStatus;
  reason: string;
};

export interface IStoreRepository {
  create(data: Omit<NewStore, 'id'>): Promise<Store>;
  findByOwnerId(ownerId: string): Promise<Store | undefined>;
  findPageWithOwner(
    input: ApiListQueryInput,
  ): Promise<CursorPage<Record<string, unknown>>>;
  findByIdWithOwner(storeId: string): Promise<StoreWithOwner | undefined>;
  findByOrganizationId(organizationId: string): Promise<Store | undefined>;
  findBySlug(slug: string): Promise<Store | undefined>;
  update(id: string, data: Partial<Store>): Promise<Store | undefined>;
  updateActiveStore(id: string, data: Partial<Store>): Promise<Store>;
  transitionStatus(input: TransitionStoreStatusInput): Promise<Store>;
  deleteOrganization(organizationId: string): Promise<void>;
  updateOrganizationName(organizationId: string, name: string): Promise<void>;
}
