import { CartConflictError } from '@/common/errors';
import { MAX_UNIT_PRICE_MINOR_UNITS } from '@/common/commerce/limits';
import { generateUUIDv7 } from '@/common/utils';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  organization,
  user,
} from '@/infrastructure/database/schema/auth.schema';
import {
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { ProductStatus } from '@/common/enums';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { CartsRepository } from './carts.repository';

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

describeWithPostgres('Cart PostgreSQL write guarantees', () => {
  let pool: Pool;
  let secondPool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let repository: CartsRepository;
  let secondRepository: CartsRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    secondPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const [{ current_database: name }] = (
      await pool.query<{ current_database: string }>(
        'select current_database()',
      )
    ).rows;
    if (!name.toLowerCase().includes('test')) {
      throw new Error('Cart integration tests require a test-named database');
    }
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    repository = new CartsRepository(db);
    secondRepository = new CartsRepository(drizzle(secondPool, { schema }));
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE cart_items, carts, product_variants, products, store, organization, "user" CASCADE',
    );
  });

  afterAll(async () => {
    await Promise.all([pool.end(), secondPool.end()]);
  });

  async function seedStoreAndVariant() {
    const suffix = generateUUIDv7();
    const storeId = generateUUIDv7();
    await db.insert(user).values({
      id: `owner-cart-${suffix}`,
      name: 'Cart Owner',
      email: `cart-${suffix}@example.com`,
    });
    await db.insert(organization).values({
      id: `org-cart-${suffix}`,
      name: 'Cart Organization',
      slug: `cart-org-${suffix}`,
      createdAt: new Date(),
    });
    const storeSlug = `cart-store-${suffix}`;
    await db.insert(store).values({
      id: storeId,
      organizationId: `org-cart-${suffix}`,
      ownerId: `owner-cart-${suffix}`,
      name: 'Cart Store',
      slug: storeSlug,
    });
    const [product] = await db
      .insert(products)
      .values({
        storeId,
        name: 'Cart Product',
        slug: `cart-product-${suffix}`,
        status: ProductStatus.PUBLISHED,
        publishedAt: new Date(),
      })
      .returning();
    const [variant] = await db
      .insert(productVariants)
      .values({
        storeId,
        productId: product.id,
        title: 'Default',
        sku: `SKU-${suffix}`,
        barcode: `BAR-${suffix}`,
        price: 250,
        inventoryPolicy: 'tracked',
        onHand: 10,
        reserved: 0,
      })
      .returning();
    return { storeId, storeSlug, variantId: variant.id };
  }

  it('allows only one concurrent Cart edit for a Cart version', async () => {
    const { storeSlug, variantId } = await seedStoreAndVariant();
    const tokenDigest = 'a'.repeat(64);
    const cart = await repository.create({
      storeSlug,
      tokenDigest,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(cart).toBeDefined();

    const results = await Promise.allSettled([
      repository.setQuantity({
        storeSlug,
        cartId: cart!.id,
        tokenDigest,
        variantId,
        quantity: 2,
        expectedVersion: 1,
      }),
      secondRepository.setQuantity({
        storeSlug,
        cartId: cart!.id,
        tokenDigest,
        variantId,
        quantity: 3,
        expectedVersion: 1,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results).toContainEqual({
      status: 'rejected',
      reason: expect.any(CartConflictError),
    });
    const afterRace = await repository.read({
      storeSlug,
      cartId: cart!.id,
      tokenDigest,
    });
    expect(afterRace).toMatchObject({
      version: 2,
      items: [expect.objectContaining({ variantId })],
    });
    await repository.setQuantity({
      storeSlug,
      cartId: cart!.id,
      tokenDigest,
      variantId,
      quantity: afterRace!.items[0].quantity,
      expectedVersion: 2,
    });
    await expect(
      repository.read({ storeSlug, cartId: cart!.id, tokenDigest }),
    ).resolves.toMatchObject({ version: 2 });
  });

  it('rejects a Cart mutation that would exceed the supported total', async () => {
    const { storeId, storeSlug, variantId } = await seedStoreAndVariant();
    await db
      .update(productVariants)
      .set({ price: MAX_UNIT_PRICE_MINOR_UNITS })
      .where(eq(productVariants.id, variantId));
    const [secondProduct] = await db
      .insert(products)
      .values({
        storeId,
        name: 'Second Cart Product',
        slug: 'second-cart-product',
        status: ProductStatus.PUBLISHED,
        publishedAt: new Date(),
      })
      .returning();
    const [secondVariant] = await db
      .insert(productVariants)
      .values({
        storeId,
        productId: secondProduct.id,
        title: 'Default',
        sku: 'SECOND-CART-SKU',
        barcode: 'SECOND-CART-BAR',
        price: MAX_UNIT_PRICE_MINOR_UNITS,
        inventoryPolicy: 'tracked',
        onHand: 99,
        reserved: 0,
      })
      .returning();
    const tokenDigest = 'b'.repeat(64);
    const cart = await repository.create({
      storeSlug,
      tokenDigest,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await repository.setQuantity({
      storeSlug,
      cartId: cart!.id,
      tokenDigest,
      variantId,
      quantity: 99,
      expectedVersion: 1,
    });
    await expect(
      repository.setQuantity({
        storeSlug,
        cartId: cart!.id,
        tokenDigest,
        variantId: secondVariant.id,
        quantity: 99,
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(CartConflictError);
  });
});
