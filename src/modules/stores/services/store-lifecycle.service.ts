import { ConflictException, Injectable } from '@nestjs/common';
import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import type { Store } from '@/infrastructure/database/schema/schema.types';
import { StoreRepository } from '../repos/store.repository';

@Injectable()
export class StoreLifecycleService {
  constructor(private readonly storeRepository: StoreRepository) {}

  async closeStore(
    storeId: string,
    actorId: string,
    reason: string,
  ): Promise<Store> {
    try {
      return await this.storeRepository.transitionStatus({
        storeId,
        actorId,
        actorAuthority: 'store_owner',
        previousStatus: 'active',
        newStatus: 'owner_closed',
        reason: reason.trim(),
      });
    } catch (error) {
      if (error instanceof StoreLifecycleConflictError) {
        throw new ConflictException(
          'The Store is already closed or does not allow Store Closure.',
        );
      }

      throw error;
    }
  }

  async suspendStore(
    storeId: string,
    actorId: string,
    reason: string,
  ): Promise<Store> {
    try {
      return await this.storeRepository.transitionStatus({
        storeId,
        actorId,
        actorAuthority: 'platform_super_admin',
        previousStatus: 'active',
        newStatus: 'platform_suspended',
        reason: reason.trim(),
      });
    } catch (error) {
      if (error instanceof StoreLifecycleConflictError) {
        throw new ConflictException(
          'The Store is already suspended, closed, or does not allow Store Suspension.',
        );
      }

      throw error;
    }
  }
}
