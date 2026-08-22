import { PlansRepository } from './plans.repository';

describe('PlansRepository list-query interface', () => {
  it('returns a selected Plan page while preserving the fixed prices relation', async () => {
    const first = {
      id: '019c0000-0000-7000-8000-000000000002',
      name: 'Pro',
      prices: [{ id: 'price-1', amount: 2900 }],
    };
    const second = {
      id: '019c0000-0000-7000-8000-000000000001',
      name: 'Starter',
      prices: [{ id: 'price-2', amount: 900 }],
    };
    const findMany = jest.fn().mockResolvedValue([first, second]);
    const repository = new PlansRepository({
      query: { plans: { findMany } },
    } as never);

    await expect(
      repository.findPage({ limit: 1, fields: 'id,name' }),
    ).resolves.toMatchObject({
      items: [{ id: first.id, name: 'Pro', prices: first.prices }],
      pageInfo: { hasNextPage: true, nextCursor: expect.any(String) },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { id: true, name: true },
        limit: 2,
        with: { prices: true },
      }),
    );
  });

  it('returns a selected public Plan page with active prices', async () => {
    const first = {
      id: '019c0000-0000-7000-8000-000000000002',
      name: 'Pro',
      prices: [{ id: 'price-1', amount: 2900 }],
    };
    const second = {
      id: '019c0000-0000-7000-8000-000000000001',
      name: 'Starter',
      prices: [{ id: 'price-2', amount: 900 }],
    };
    const findMany = jest.fn().mockResolvedValue([first, second]);
    const repository = new PlansRepository({
      query: { plans: { findMany } },
    } as never);

    await expect(
      repository.findActivePage({ limit: 1, fields: 'id,name' }),
    ).resolves.toMatchObject({
      items: [{ id: first.id, name: 'Pro', prices: first.prices }],
      pageInfo: { hasNextPage: true, nextCursor: expect.any(String) },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { id: true, name: true },
        limit: 2,
        where: expect.anything(),
        with: {
          prices: {
            where: expect.anything(),
            columns: {
              id: true,
              amount: true,
              currency: true,
              interval: true,
            },
          },
        },
      }),
    );
  });
});
