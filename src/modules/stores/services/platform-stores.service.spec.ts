import { NotFoundException } from '@nestjs/common';
import { PlatformStoresService } from './platform-stores.service';

describe('PlatformStoresService', () => {
  const storeRepository = {
    findAllWithOwner: jest.fn(),
    findByIdWithOwner: jest.fn(),
  };
  const storeLifecycleService = {
    suspendStore: jest.fn(),
    reactivateStore: jest.fn(),
  };
  let service: PlatformStoresService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PlatformStoresService(
      storeRepository as never,
      storeLifecycleService as never,
    );
  });

  it('returns Store summaries with the approved Store Owner summary', async () => {
    const store = {
      id: 'store-1',
      organizationId: 'organization-1',
      ownerId: 'owner-1',
      name: 'First Store',
      slug: 'first-store',
      description: 'A Store',
      logo: null,
      logoKey: 'internal-key',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      owner: { id: 'owner-1', name: 'Owner One', email: 'owner@example.com' },
    };
    storeRepository.findAllWithOwner.mockResolvedValue([store]);

    await expect(service.listStores()).resolves.toEqual([
      {
        id: 'store-1',
        name: 'First Store',
        slug: 'first-store',
        description: 'A Store',
        logo: null,
        status: 'active',
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
        owner: {
          id: 'owner-1',
          name: 'Owner One',
          email: 'owner@example.com',
        },
      },
    ]);
  });

  it.each(['active', 'owner_closed', 'platform_suspended'] as const)(
    'preserves the %s Store Status in detail responses',
    async (status) => {
      const store = {
        id: 'store-1',
        name: 'First Store',
        slug: 'first-store',
        description: null,
        logo: null,
        status,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        owner: { id: 'owner-1', name: 'Owner One', email: 'owner@example.com' },
      };
      storeRepository.findByIdWithOwner.mockResolvedValue(store);

      await expect(service.getStore('store-1')).resolves.toEqual(store);
    },
  );

  it('returns not found for an unknown Store identifier', async () => {
    storeRepository.findByIdWithOwner.mockResolvedValue(undefined);

    await expect(service.getStore('missing-store')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('suspends an active Store and preserves its platform response shape', async () => {
    const existingStore = {
      id: 'store-1',
      organizationId: 'organization-1',
      ownerId: 'owner-1',
      name: 'First Store',
      slug: 'first-store',
      description: 'A Store',
      logo: null,
      logoKey: null,
      status: 'active' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      owner: { id: 'owner-1', name: 'Owner One', email: 'owner@example.com' },
    };
    const suspendedStore = {
      ...existingStore,
      status: 'platform_suspended' as const,
    };
    storeRepository.findByIdWithOwner.mockResolvedValue(existingStore);
    storeLifecycleService.suspendStore.mockResolvedValue(suspendedStore);

    await expect(
      service.suspendStore('store-1', 'platform-1', '  Terms violation.  '),
    ).resolves.toEqual({
      id: 'store-1',
      name: 'First Store',
      slug: 'first-store',
      description: 'A Store',
      logo: null,
      status: 'platform_suspended',
      createdAt: suspendedStore.createdAt,
      updatedAt: suspendedStore.updatedAt,
      owner: existingStore.owner,
    });

    expect(storeLifecycleService.suspendStore).toHaveBeenCalledWith(
      'store-1',
      'platform-1',
      '  Terms violation.  ',
    );
  });

  it('returns not found instead of attempting a transition for an unknown Store', async () => {
    storeRepository.findByIdWithOwner.mockResolvedValue(undefined);

    await expect(
      service.suspendStore('missing-store', 'platform-1', 'Terms violation.'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storeLifecycleService.suspendStore).not.toHaveBeenCalled();
  });

  it.each(['owner_closed', 'platform_suspended'] as const)(
    'reactivates a %s Store and preserves its platform response shape',
    async (status) => {
      const existingStore = {
        id: 'store-1',
        organizationId: 'organization-1',
        ownerId: 'owner-1',
        name: 'First Store',
        slug: 'first-store',
        description: 'A Store',
        logo: null,
        logoKey: null,
        status,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        owner: { id: 'owner-1', name: 'Owner One', email: 'owner@example.com' },
      };
      const activeStore = { ...existingStore, status: 'active' as const };
      storeRepository.findByIdWithOwner.mockResolvedValue(existingStore);
      storeLifecycleService.reactivateStore.mockResolvedValue(activeStore);

      await expect(
        service.reactivateStore(
          'store-1',
          'platform-1',
          '  Issue resolved and approved.  ',
        ),
      ).resolves.toEqual({
        id: 'store-1',
        name: 'First Store',
        slug: 'first-store',
        description: 'A Store',
        logo: null,
        status: 'active',
        createdAt: activeStore.createdAt,
        updatedAt: activeStore.updatedAt,
        owner: existingStore.owner,
      });

      expect(storeLifecycleService.reactivateStore).toHaveBeenCalledWith(
        'store-1',
        'platform-1',
        '  Issue resolved and approved.  ',
        status,
      );
    },
  );

  it('returns not found instead of attempting reactivation for an unknown Store', async () => {
    storeRepository.findByIdWithOwner.mockResolvedValue(undefined);

    await expect(
      service.reactivateStore(
        'missing-store',
        'platform-1',
        'Issue resolved and approved.',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storeLifecycleService.reactivateStore).not.toHaveBeenCalled();
  });
});
