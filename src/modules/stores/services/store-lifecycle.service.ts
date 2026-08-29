import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import type { Store } from '@/infrastructure/database/schema/schema.types';
import { STORE_REPOSITORY, type IStoreRepository } from '../interfaces/repos';
import type { StoreStatus } from '../domain/store-status';

@Injectable()
export class StoreLifecycleService {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
  ) {}

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

  async reactivateStore(
    storeId: string,
    actorId: string,
    reason: string,
    previousStatus: StoreStatus,
  ): Promise<Store> {
    if (
      previousStatus !== 'owner_closed' &&
      previousStatus !== 'platform_suspended'
    ) {
      throw new ConflictException(
        'The Store is already active and does not allow Store Reactivation.',
      );
    }

    try {
      return await this.storeRepository.transitionStatus({
        storeId,
        actorId,
        actorAuthority: 'platform_super_admin',
        previousStatus,
        newStatus: 'active',
        reason: reason.trim(),
      });
    } catch (error) {
      if (error instanceof StoreLifecycleConflictError) {
        throw new ConflictException(
          'The Store is already active or does not allow Store Reactivation.',
        );
      }

      throw error;
    }
  }
}
