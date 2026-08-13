import { NotFoundException } from '@nestjs/common';
import { PlatformStoresService } from './platform-stores.service';

describe('PlatformStoresService', () => {
  const storeRepository = {
    findAllWithOwner: jest.fn(),
    findByIdWithOwner: jest.fn(),
  };
  let service: PlatformStoresService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PlatformStoresService(storeRepository as never);
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
});
