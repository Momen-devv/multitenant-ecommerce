import { ConflictException } from '@nestjs/common';
import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import { StoreLifecycleService } from './store-lifecycle.service';

describe('StoreLifecycleService', () => {
  const storeRepository = {
    transitionStatus: jest.fn(),
  };
  let service: StoreLifecycleService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new StoreLifecycleService(storeRepository as never);
  });

  it('closes an active Store as its owner with the normalized reason', async () => {
    const closedStore = { id: 'store-1', status: 'owner_closed' };
    storeRepository.transitionStatus.mockResolvedValue(closedStore);

    await expect(
      service.closeStore('store-1', 'owner-1', '  No longer operating.  '),
    ).resolves.toBe(closedStore);

    expect(storeRepository.transitionStatus).toHaveBeenCalledWith({
      storeId: 'store-1',
      actorId: 'owner-1',
      actorAuthority: 'store_owner',
      previousStatus: 'active',
      newStatus: 'owner_closed',
      reason: 'No longer operating.',
    });
  });

  it('translates a failed conditional transition into a conflict', async () => {
    storeRepository.transitionStatus.mockRejectedValue(
      new StoreLifecycleConflictError(),
    );

    await expect(
      service.closeStore('store-1', 'owner-1', 'No longer operating.'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('suspends an active Store as a Platform Super-admin with the normalized reason', async () => {
    const suspendedStore = { id: 'store-1', status: 'platform_suspended' };
    storeRepository.transitionStatus.mockResolvedValue(suspendedStore);

    await expect(
      service.suspendStore('store-1', 'platform-1', '  Terms violation.  '),
    ).resolves.toBe(suspendedStore);

    expect(storeRepository.transitionStatus).toHaveBeenCalledWith({
      storeId: 'store-1',
      actorId: 'platform-1',
      actorAuthority: 'platform_super_admin',
      previousStatus: 'active',
      newStatus: 'platform_suspended',
      reason: 'Terms violation.',
    });
  });

  it('translates a failed suspension transition into a conflict', async () => {
    storeRepository.transitionStatus.mockRejectedValue(
      new StoreLifecycleConflictError(),
    );

    await expect(
      service.suspendStore('store-1', 'platform-1', 'Terms violation.'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['owner_closed', 'platform_suspended'] as const)(
    'reactivates a %s Store as a Platform Super-admin with the normalized reason',
    async (previousStatus) => {
      const activeStore = { id: 'store-1', status: 'active' };
      storeRepository.transitionStatus.mockResolvedValue(activeStore);

      await expect(
        service.reactivateStore(
          'store-1',
          'platform-1',
          '  Issue resolved and approved.  ',
          previousStatus,
        ),
      ).resolves.toBe(activeStore);

      expect(storeRepository.transitionStatus).toHaveBeenCalledWith({
        storeId: 'store-1',
        actorId: 'platform-1',
        actorAuthority: 'platform_super_admin',
        previousStatus,
        newStatus: 'active',
        reason: 'Issue resolved and approved.',
      });
    },
  );

  it('rejects reactivation of an active Store without attempting a transition', async () => {
    await expect(
      service.reactivateStore(
        'store-1',
        'platform-1',
        'Issue resolved and approved.',
        'active',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storeRepository.transitionStatus).not.toHaveBeenCalled();
  });

  it('translates a failed reactivation transition into a conflict', async () => {
    storeRepository.transitionStatus.mockRejectedValue(
      new StoreLifecycleConflictError(),
    );

    await expect(
      service.reactivateStore(
        'store-1',
        'platform-1',
        'Issue resolved and approved.',
        'owner_closed',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
