import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreRepository } from '../repos/store.repository';
import type {
  PlatformStoreResponse,
  StoreWithOwner,
} from '../dto/platform-store-response';
import { StoreLifecycleService } from './store-lifecycle.service';
import type { ApiListQueryInput, CursorPage } from '@/common/api-query';

@Injectable()
export class PlatformStoresService {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly storeLifecycleService: StoreLifecycleService,
  ) {}

  async listStores(
    query: ApiListQueryInput,
  ): Promise<CursorPage<Partial<PlatformStoreResponse>>> {
    const page = await this.storeRepository.findPageWithOwner(query);
    return {
      items: page.items.map((store) =>
        this.toPlatformListResponse(
          store as Partial<StoreWithOwner> & Pick<StoreWithOwner, 'owner'>,
        ),
      ),
      pageInfo: page.pageInfo,
    };
  }

  async getStore(storeId: string): Promise<PlatformStoreResponse> {
    const store = await this.storeRepository.findByIdWithOwner(storeId);
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return this.toPlatformResponse(store);
  }

  async suspendStore(
    storeId: string,
    actorId: string,
    reason: string,
  ): Promise<PlatformStoreResponse> {
    const existingStore = await this.storeRepository.findByIdWithOwner(storeId);
    if (!existingStore) {
      throw new NotFoundException('Store not found');
    }

    const suspendedStore = await this.storeLifecycleService.suspendStore(
      storeId,
      actorId,
      reason,
    );

    return this.toPlatformResponse({
      ...suspendedStore,
      owner: existingStore.owner,
    });
  }

  async reactivateStore(
    storeId: string,
    actorId: string,
    reason: string,
  ): Promise<PlatformStoreResponse> {
    const existingStore = await this.storeRepository.findByIdWithOwner(storeId);
    if (!existingStore) {
      throw new NotFoundException('Store not found');
    }

    const reactivatedStore = await this.storeLifecycleService.reactivateStore(
      storeId,
      actorId,
      reason,
      existingStore.status,
    );

    return this.toPlatformResponse({
      ...reactivatedStore,
      owner: existingStore.owner,
    });
  }

  private toPlatformListResponse(
    store: Partial<StoreWithOwner> & Pick<StoreWithOwner, 'owner'>,
  ): Partial<PlatformStoreResponse> {
    const response: Record<string, unknown> = { owner: store.owner };
    const publicFields = [
      'id',
      'name',
      'slug',
      'description',
      'logo',
      'status',
      'createdAt',
      'updatedAt',
    ] as const;
    for (const field of publicFields) {
      if (field in store) response[field] = store[field];
    }
    return response;
  }

  private toPlatformResponse(store: StoreWithOwner): PlatformStoreResponse {
    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      logo: store.logo,
      status: store.status,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
      owner: store.owner,
    };
  }
}
