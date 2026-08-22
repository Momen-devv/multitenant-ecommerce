import { Client } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  planPrices,
  plans,
} from '@/infrastructure/database/schema/billing.schema';
import {
  organization,
  user,
} from '@/infrastructure/database/schema/auth.schema';
import { store } from '@/infrastructure/database/schema/app.schema';
import { PlansRepository } from '@/modules/plans/repos/plans.repository';
import { StoreRepository } from '@/modules/stores/repos/store.repository';
import { PlanProvisioningStatus } from '@/common/enums';
import { generateUUIDv7 } from '@/common/utils';

if (
  process.env.REQUIRE_TEST_DATABASE === 'true' &&
  !process.env.TEST_DATABASE_URL
) {
  throw new Error(
    'TEST_DATABASE_URL is required for PostgreSQL integration tests',
  );
}

const describeWithPostgres = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeWithPostgres('api-query PostgreSQL adapters', () => {
  let client: Client;
  let database: NodePgDatabase<typeof schema>;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    database = drizzle(client, { schema });
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  afterAll(async () => {
    await client.end();
  });

  it('paginates Plans without duplicates across a UUIDv7 cursor', async () => {
    const token = `aq-${process.pid}-${Date.now()}`;
    await database.insert(plans).values([
      {
        id: '019c0000-0000-7000-8000-000000000001',
        name: `${token} Starter`,
        code: `${token}-starter`,
      },
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: `${token} Pro`,
        code: `${token}-pro`,
      },
    ]);
    const repository = new PlansRepository(database);

    const firstPage = await repository.findPage({ limit: 1, search: token });
    const secondPage = await repository.findPage({
      limit: 1,
      cursor: firstPage.pageInfo.nextCursor!,
      search: token,
    });

    expect(firstPage.items.map((plan) => plan.id)).toEqual([
      '019c0000-0000-7000-8000-000000000002',
    ]);
    expect(secondPage.items.map((plan) => plan.id)).toEqual([
      '019c0000-0000-7000-8000-000000000001',
    ]);
  });

  it('queries only subscription-ready public Plans and active prices', async () => {
    const token = `public-${process.pid}-${Date.now()}`;
    const activePlanId = generateUUIDv7();
    const hiddenPlanId = generateUUIDv7();
    const activePriceId = generateUUIDv7();
    await database.insert(plans).values([
      {
        id: activePlanId,
        name: `${token} Professional`,
        code: `${token}-professional`,
        provisioningStatus: PlanProvisioningStatus.READY,
        stripeProductId: `${token}-product-active`,
        isActive: true,
      },
      {
        id: hiddenPlanId,
        name: `${token} Hidden`,
        code: `${token}-hidden`,
        provisioningStatus: PlanProvisioningStatus.READY,
        stripeProductId: `${token}-product-hidden`,
        isActive: false,
      },
    ]);
    await database.insert(planPrices).values([
      {
        id: activePriceId,
        planId: activePlanId,
        amount: 2900,
        currency: 'usd',
        interval: 'month',
        stripePriceId: `${token}-price-active`,
        isActive: true,
      },
      {
        planId: activePlanId,
        amount: 1900,
        currency: 'usd',
        interval: 'year',
        isActive: false,
      },
    ]);
    const repository = new PlansRepository(database);

    const page = await repository.findActivePage({
      fields: 'id,name,code',
      filter: { code: { eq: `${token}-professional` } },
      search: token,
      sort: 'name',
    });

    expect(page).toEqual({
      items: [
        {
          id: activePlanId,
          name: `${token} Professional`,
          code: `${token}-professional`,
          prices: [
            {
              id: activePriceId,
              amount: 2900,
              currency: 'usd',
              interval: 'month',
            },
          ],
        },
      ],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it('filters Stores while preserving the owner relation', async () => {
    const token = `aq-${process.pid}-${Date.now()}`;
    const ownerId = '019c0000-0000-7000-8000-000000000010';
    const organizationId = '019c0000-0000-7000-8000-000000000011';
    await database.insert(user).values({
      id: ownerId,
      name: `${token} Owner`,
      email: `${token}@example.com`,
    });
    await database.insert(organization).values({
      id: organizationId,
      name: `${token} Organization`,
      slug: `${token}-organization`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await database.insert(store).values({
      id: '019c0000-0000-7000-8000-000000000012',
      organizationId,
      ownerId,
      name: `${token} Store`,
      slug: `${token}-store`,
      status: 'active',
    });
    const repository = new StoreRepository(database);

    const page = await repository.findPageWithOwner({
      fields: 'id,name',
      filter: { status: { eq: 'active' } },
      search: token,
    });

    expect(page.items).toEqual([
      {
        id: '019c0000-0000-7000-8000-000000000012',
        name: `${token} Store`,
        owner: {
          id: ownerId,
          name: `${token} Owner`,
          email: `${token}@example.com`,
        },
      },
    ]);
  });
});
