import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreRepository } from '../repos/store.repository';
import type {
  PlatformStoreResponse,
  StoreWithOwner,
} from '../dto/platform-store-response';
import { StoreLifecycleService } from './store-lifecycle.service';

@Injectable()
export class PlatformStoresService {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly storeLifecycleService: StoreLifecycleService,
  ) {}

  async listStores(): Promise<PlatformStoreResponse[]> {
    const stores = await this.storeRepository.findAllWithOwner();
    return stores.map((store) => this.toPlatformResponse(store));
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
      reason.trim(),
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
      reason.trim(),
      existingStore.status,
    );

    return this.toPlatformResponse({
      ...reactivatedStore,
      owner: existingStore.owner,
    });
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
