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
});
