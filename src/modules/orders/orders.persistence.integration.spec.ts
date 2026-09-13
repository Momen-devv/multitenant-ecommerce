import { generateUUIDv7 } from '@/common/utils';
import { MAX_ORDER_TOTAL_MINOR_UNITS } from '@/common/commerce/limits';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  organization,
  user,
} from '@/infrastructure/database/schema/auth.schema';
import {
  cartItems,
  carts,
  orderItems,
  orders,
} from '@/infrastructure/database/schema/commerce.schema';
import {
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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

describeWithPostgres('Commerce PostgreSQL persistence guarantees', () => {
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const [{ current_database: name }] = (
      await pool.query<{ current_database: string }>(
        'select current_database()',
      )
    ).rows;
    if (!name.toLowerCase().includes('test')) {
      throw new Error(
        'Commerce integration tests require a test-named database',
      );
    }
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE order_events, order_items, orders, cart_items, carts, product_variants, products, store, organization, "user" CASCADE',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedStore(suffix: string) {
    const ownerId = `owner-commerce-${suffix}`;
    const organizationId = `org-commerce-${suffix}`;
    const storeId = generateUUIDv7();
    await db.insert(user).values({
      id: ownerId,
      name: `Owner ${suffix}`,
      email: `${suffix}@example.com`,
    });
    await db.insert(organization).values({
      id: organizationId,
      name: `Organization ${suffix}`,
      slug: `commerce-${suffix}`,
      createdAt: new Date(),
    });
    await db.insert(store).values({
      id: storeId,
      organizationId,
      ownerId,
      name: `Store ${suffix}`,
      slug: `commerce-store-${suffix}`,
    });
    return storeId;
  }

  async function seedCart(storeId: string, suffix: string) {
    const [cart] = await db
      .insert(carts)
      .values({
        storeId,
        tokenDigest: suffix.length.toString(16).padStart(64, 'a'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    return cart;
  }

  async function seedVariant(storeId: string, suffix: string) {
    const [product] = await db
      .insert(products)
      .values({ storeId, name: `Product ${suffix}`, slug: `product-${suffix}` })
      .returning();
    const [variant] = await db
      .insert(productVariants)
      .values({
        storeId,
        productId: product.id,
        title: 'Default',
        sku: `SKU-${suffix}`,
        barcode: `BAR-${suffix}`,
        price: 1000,
        inventoryPolicy: 'tracked',
        onHand: 10,
        reserved: 0,
      })
      .returning();
    return { product, variant };
  }

  function orderValues(storeId: string, cartId: string, key: string) {
    return {
      storeId,
      sourceCartId: cartId,
      currency: 'usd',
      subtotal: 1000,
      shippingAmount: 0,
      taxAmount: 0,
      total: 1000,
      recipientName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+201234567890',
      addressLine1: '1 Example Street',
      city: 'Cairo',
      countryCode: 'EG',
      checkoutIdempotencyKey: key,
      checkoutRequestFingerprint: 'a'.repeat(64),
      placedAt: new Date(),
    };
  }

  it('rejects Cart Item references across Store boundaries', async () => {
    const firstStoreId = await seedStore('first');
    const secondStoreId = await seedStore('second');
    const cart = await seedCart(firstStoreId, '1');
    const foreign = await seedVariant(secondStoreId, 'second');

    await expect(
      db.insert(cartItems).values({
        storeId: firstStoreId,
        cartId: cart.id,
        productId: foreign.product.id,
        variantId: foreign.variant.id,
        quantity: 1,
      }),
    ).rejects.toBeDefined();
  });

  it('allows only one Order per source Cart, independent of idempotency key', async () => {
    const storeId = await seedStore('orders');
    const cart = await seedCart(storeId, '2');
    await db.insert(orders).values(orderValues(storeId, cart.id, 'first'));

    await expect(
      db.insert(orders).values(orderValues(storeId, cart.id, 'second')),
    ).rejects.toBeDefined();
  });

  it('rejects invalid Cart quantities and invalid monetary or state values', async () => {
    const storeId = await seedStore('constraints');
    const cart = await seedCart(storeId, '3');
    const catalog = await seedVariant(storeId, 'constraints');

    await expect(
      db.insert(cartItems).values({
        storeId,
        cartId: cart.id,
        productId: catalog.product.id,
        variantId: catalog.variant.id,
        quantity: 0,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(orders).values({
        ...orderValues(storeId, cart.id, 'invalid-money'),
        subtotal: -1,
        total: -1,
      }),
    ).rejects.toBeDefined();
    const [order] = await db
      .insert(orders)
      .values(orderValues(storeId, cart.id, 'valid-order'))
      .returning();
    await expect(
      db.insert(orderItems).values({
        storeId,
        orderId: order.id,
        sourceProductId: catalog.product.id,
        sourceVariantId: catalog.variant.id,
        productName: catalog.product.name,
        variantTitle: catalog.variant.title,
        sku: catalog.variant.sku,
        orderedOptions: [{}] as never,
        unitPrice: 1000,
        quantity: 1,
        lineTotal: 1000,
        inventoryPolicy: 'tracked',
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(orders).values({
        ...orderValues(storeId, cart.id, 'overflow'),
        subtotal: MAX_ORDER_TOTAL_MINOR_UNITS,
        shippingAmount: MAX_ORDER_TOTAL_MINOR_UNITS,
        taxAmount: MAX_ORDER_TOTAL_MINOR_UNITS,
        total: MAX_ORDER_TOTAL_MINOR_UNITS,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(carts).values({
        storeId,
        tokenDigest: 'b'.repeat(64),
        state: 'converted',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toBeDefined();
  });
});
