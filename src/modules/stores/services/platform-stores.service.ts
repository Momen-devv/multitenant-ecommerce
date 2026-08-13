import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreRepository } from '../repos/store.repository';
import type {
  PlatformStoreResponse,
  StoreWithOwner,
} from '../dto/platform-store-response';

@Injectable()
export class PlatformStoresService {
  constructor(private readonly storeRepository: StoreRepository) {}

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
