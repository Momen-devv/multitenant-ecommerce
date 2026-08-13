import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import { StoreRepository } from './store.repository';

type LifecycleState = {
  status: 'active' | 'owner_closed';
  auditRecords: Array<Record<string, unknown>>;
};

function createTransactionalDatabase(state: LifecycleState) {
  return {
    transaction: jest.fn(async (callback) =>
      callback({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockImplementation((changes) => ({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockImplementation(async () => {
                if (state.status !== 'active') return [];

                state.status = changes.status;
                return [{ id: 'store-1', status: state.status }];
              }),
            }),
          })),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation(async (record) => {
            state.auditRecords.push(record);
          }),
        }),
      }),
    ),
  };
}

describe('StoreRepository lifecycle persistence', () => {
  it('updates status and inserts its audit record in one transaction', async () => {
    const state: LifecycleState = { status: 'active', auditRecords: [] };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );

    await expect(
      repository.transitionStatus({
        storeId: 'store-1',
        actorId: 'owner-1',
        actorAuthority: 'store_owner',
        previousStatus: 'active',
        newStatus: 'owner_closed',
        reason: 'No longer operating.',
      }),
    ).resolves.toEqual({ id: 'store-1', status: 'owner_closed' });

    expect(state.status).toBe('owner_closed');
    expect(state.auditRecords).toEqual([
      {
        id: expect.any(String),
        storeId: 'store-1',
        actorId: 'owner-1',
        actorAuthority: 'store_owner',
        previousStatus: 'active',
        newStatus: 'owner_closed',
        reason: 'No longer operating.',
      },
    ]);
  });

  it('does not insert an audit record when the conditional update finds no active Store', async () => {
    const state: LifecycleState = { status: 'owner_closed', auditRecords: [] };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );

    await expect(
      repository.transitionStatus({
        storeId: 'store-1',
        actorId: 'owner-1',
        actorAuthority: 'store_owner',
        previousStatus: 'active',
        newStatus: 'owner_closed',
        reason: 'No longer operating.',
      }),
    ).rejects.toBeInstanceOf(StoreLifecycleConflictError);

    expect(state).toEqual({ status: 'owner_closed', auditRecords: [] });
  });

  it('allows only one of two competing transitions from active to commit', async () => {
    const state: LifecycleState = { status: 'active', auditRecords: [] };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );
    const transition = {
      storeId: 'store-1',
      actorAuthority: 'store_owner' as const,
      previousStatus: 'active' as const,
      newStatus: 'owner_closed' as const,
      reason: 'No longer operating.',
    };

    const results = await Promise.allSettled([
      repository.transitionStatus({ ...transition, actorId: 'owner-1' }),
      repository.transitionStatus({ ...transition, actorId: 'owner-2' }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(state.status).toBe('owner_closed');
    expect(state.auditRecords).toHaveLength(1);
  });
});
