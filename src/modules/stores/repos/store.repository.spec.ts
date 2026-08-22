import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import { StoreRepository } from './store.repository';

describe('StoreRepository list-query interface', () => {
  it('returns a selected Store page while preserving the fixed owner relation', async () => {
    const first = {
      id: '019c0000-0000-7000-8000-000000000002',
      name: 'Alpha',
      owner: { id: 'owner-1', name: 'One', email: 'one@example.com' },
    };
    const second = {
      id: '019c0000-0000-7000-8000-000000000001',
      name: 'Beta',
      owner: { id: 'owner-2', name: 'Two', email: 'two@example.com' },
    };
    const findMany = jest.fn().mockResolvedValue([first, second]);
    const repository = new StoreRepository({
      query: { store: { findMany } },
    } as never);

    await expect(
      repository.findPageWithOwner({ limit: 1, fields: 'name' }),
    ).resolves.toMatchObject({
      items: [{ name: 'Alpha', owner: first.owner }],
      pageInfo: { hasNextPage: true, nextCursor: expect.any(String) },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { name: true, id: true },
        limit: 2,
        with: {
          owner: { columns: { id: true, name: true, email: true } },
        },
      }),
    );
  });
});

type LifecycleState = {
  status: 'active' | 'owner_closed' | 'platform_suspended';
  auditRecords: Array<Record<string, unknown>>;
};

function createTransactionalDatabase(state: LifecycleState) {
  return {
    transaction: jest.fn((callback) =>
      callback({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockImplementation((changes) => ({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockImplementation(() => {
                if (
                  changes.status === 'active'
                    ? state.status === 'active'
                    : state.status !== 'active'
                ) {
                  return [];
                }

                state.status = changes.status;
                return [{ id: 'store-1', status: state.status }];
              }),
            }),
          })),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((record) => {
            state.auditRecords.push(record as Record<string, unknown>);
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

  it('atomically suspends an active Store and records the Platform Super-admin action', async () => {
    const state: LifecycleState = { status: 'active', auditRecords: [] };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );

    await expect(
      repository.transitionStatus({
        storeId: 'store-1',
        actorId: 'platform-1',
        actorAuthority: 'platform_super_admin',
        previousStatus: 'active',
        newStatus: 'platform_suspended',
        reason: 'Terms violation.',
      }),
    ).resolves.toEqual({ id: 'store-1', status: 'platform_suspended' });

    expect(state).toEqual({
      status: 'platform_suspended',
      auditRecords: [
        {
          id: expect.any(String),
          storeId: 'store-1',
          actorId: 'platform-1',
          actorAuthority: 'platform_super_admin',
          previousStatus: 'active',
          newStatus: 'platform_suspended',
          reason: 'Terms violation.',
        },
      ],
    });
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

  it('does not insert an audit record when the Store is already suspended', async () => {
    const state: LifecycleState = {
      status: 'platform_suspended',
      auditRecords: [],
    };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );

    await expect(
      repository.transitionStatus({
        storeId: 'store-1',
        actorId: 'platform-1',
        actorAuthority: 'platform_super_admin',
        previousStatus: 'active',
        newStatus: 'platform_suspended',
        reason: 'Terms violation.',
      }),
    ).rejects.toBeInstanceOf(StoreLifecycleConflictError);

    expect(state).toEqual({
      status: 'platform_suspended',
      auditRecords: [],
    });
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

  it('allows only one of two competing suspension commands to commit', async () => {
    const state: LifecycleState = { status: 'active', auditRecords: [] };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );
    const transition = {
      storeId: 'store-1',
      actorAuthority: 'platform_super_admin' as const,
      previousStatus: 'active' as const,
      newStatus: 'platform_suspended' as const,
      reason: 'Terms violation.',
    };

    const results = await Promise.allSettled([
      repository.transitionStatus({ ...transition, actorId: 'platform-1' }),
      repository.transitionStatus({ ...transition, actorId: 'platform-2' }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(state.status).toBe('platform_suspended');
    expect(state.auditRecords).toHaveLength(1);
    expect(state.auditRecords[0]).toMatchObject({
      actorAuthority: 'platform_super_admin',
      previousStatus: 'active',
      newStatus: 'platform_suspended',
    });
  });

  it.each(['owner_closed', 'platform_suspended'] as const)(
    'atomically reactivates a %s Store and records the Platform Super-admin action',
    async (previousStatus) => {
      const state: LifecycleState = {
        status: previousStatus,
        auditRecords: [],
      };
      const repository = new StoreRepository(
        createTransactionalDatabase(state) as never,
      );

      await expect(
        repository.transitionStatus({
          storeId: 'store-1',
          actorId: 'platform-1',
          actorAuthority: 'platform_super_admin',
          previousStatus,
          newStatus: 'active',
          reason: 'Issue resolved and approved.',
        }),
      ).resolves.toEqual({ id: 'store-1', status: 'active' });

      expect(state).toEqual({
        status: 'active',
        auditRecords: [
          {
            id: expect.any(String),
            storeId: 'store-1',
            actorId: 'platform-1',
            actorAuthority: 'platform_super_admin',
            previousStatus,
            newStatus: 'active',
            reason: 'Issue resolved and approved.',
          },
        ],
      });
    },
  );

  it('allows only one of two competing reactivation commands to commit', async () => {
    const state: LifecycleState = {
      status: 'owner_closed',
      auditRecords: [],
    };
    const repository = new StoreRepository(
      createTransactionalDatabase(state) as never,
    );
    const transition = {
      storeId: 'store-1',
      actorAuthority: 'platform_super_admin' as const,
      previousStatus: 'owner_closed' as const,
      newStatus: 'active' as const,
      reason: 'Issue resolved and approved.',
    };

    const results = await Promise.allSettled([
      repository.transitionStatus({ ...transition, actorId: 'platform-1' }),
      repository.transitionStatus({ ...transition, actorId: 'platform-2' }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(state.status).toBe('active');
    expect(state.auditRecords).toHaveLength(1);
    expect(state.auditRecords[0]).toMatchObject({
      actorAuthority: 'platform_super_admin',
      previousStatus: 'owner_closed',
      newStatus: 'active',
    });
  });
});
