import { generateUUIDv7 } from '@/common/utils';
import { createHash } from 'node:crypto';
import { MAX_ORDER_TOTAL_MINOR_UNITS } from '@/common/commerce/limits';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  organization,
  user,
} from '@/infrastructure/database/schema/auth.schema';
import {
  cartItems,
  carts,
  orderEvents,
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
import { eq } from 'drizzle-orm';
import { CartState, ProductStatus, StoreStatus } from '@/common/enums';
import { CheckoutConflictError } from '@/common/errors';
import { quoteFingerprint } from '@/modules/carts/services/carts.service';
import { OrdersRepository } from './repos/orders.repository';

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
  let secondPool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let repository: OrdersRepository;
  let secondRepository: OrdersRepository;

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
    secondPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    repository = new OrdersRepository(db);
    secondRepository = new OrdersRepository(drizzle(secondPool, { schema }));
    await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE order_events, order_items, orders, cart_items, carts, product_variants, products, store, organization, "user" CASCADE',
    );
  });

  afterAll(async () => {
    await Promise.all([pool.end(), secondPool.end()]);
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

  async function seedCheckoutCart(quantity = 1) {
    const storeId = await seedStore(generateUUIDv7());
    const token = 'checkout-token';
    const [cart] = await db
      .insert(carts)
      .values({
        storeId,
        tokenDigest: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    const { product, variant } = await seedVariant(storeId, generateUUIDv7());
    await db
      .update(products)
      .set({ status: ProductStatus.PUBLISHED, publishedAt: new Date() })
      .where(eq(products.id, product.id));
    await db.insert(cartItems).values({
      storeId,
      cartId: cart.id,
      productId: product.id,
      variantId: variant.id,
      quantity,
    });
    return { cart, product, storeId, token, variant };
  }

  function checkoutInput(
    productId: string,
    variantId: string,
    quantity = 1,
    idempotencyKey = 'checkout-key',
  ) {
    return {
      expectedCartVersion: 1,
      quoteFingerprint: quoteFingerprint('usd', [
        { productId, variantId, quantity, unitPrice: 1000 },
      ]),
      idempotencyKey,
      contact: {
        recipientName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+201234567890',
      },
      deliveryAddress: {
        addressLine1: '1 Example Street',
        city: 'Cairo',
        countryCode: 'EG',
      },
    };
  }

  it('places one immutable Order and reserves tracked inventory', async () => {
    const { cart, product, token, variant } = await seedCheckoutCart(2);

    await expect(
      repository.placeOrder(
        cart.id,
        token,
        checkoutInput(product.id, variant.id, 2),
      ),
    ).resolves.toMatchObject({
      sourceCartId: cart.id,
      status: 'placed',
      subtotal: 2000,
      total: 2000,
      items: [
        expect.objectContaining({
          sourceProductId: product.id,
          sourceVariantId: variant.id,
          quantity: 2,
          inventoryPolicy: 'tracked',
        }),
      ],
    });

    await expect(
      db
        .select({ state: carts.state })
        .from(carts)
        .where(eq(carts.id, cart.id)),
    ).resolves.toEqual([{ state: 'converted' }]);
    await expect(
      db
        .select({
          reserved: productVariants.reserved,
          version: productVariants.version,
        })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ reserved: 2, version: 2 }]);
    await expect(db.select().from(orderEvents)).resolves.toHaveLength(1);
  });

  it('replays the original receipt after Store changes and rejects a changed key', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    const input = checkoutInput(product.id, variant.id);
    const receipt = await repository.placeOrder(cart.id, token, input);
    await db
      .update(store)
      .set({ status: StoreStatus.OWNER_CLOSED })
      .where(eq(store.id, storeId));

    await expect(repository.placeOrder(cart.id, token, input)).resolves.toEqual(
      receipt,
    );
    await expect(
      repository.placeOrder(cart.id, token, {
        ...input,
        contact: {
          phone: input.contact.phone,
          email: input.contact.email,
          recipientName: input.contact.recipientName,
        },
        deliveryAddress: {
          countryCode: input.deliveryAddress.countryCode,
          city: input.deliveryAddress.city,
          addressLine1: input.deliveryAddress.addressLine1,
        },
      }),
    ).resolves.toEqual(receipt);
    await expect(
      repository.placeOrder(
        cart.id,
        token,
        checkoutInput(product.id, variant.id, 1, 'different-key'),
      ),
    ).rejects.toBeInstanceOf(CheckoutConflictError);
  });

  it('rolls back every write when a later Cart line is not purchasable', async () => {
    const { cart, storeId, token, variant } = await seedCheckoutCart();
    const [draftProduct] = await db
      .insert(products)
      .values({ storeId, name: 'Draft product', slug: 'draft-product' })
      .returning();
    const [draftVariant] = await db
      .insert(productVariants)
      .values({
        storeId,
        productId: draftProduct.id,
        title: 'Draft',
        sku: 'DRAFT-SKU',
        barcode: 'DRAFT-BAR',
        price: 500,
        inventoryPolicy: 'tracked',
        onHand: 10,
        reserved: 0,
      })
      .returning();
    await db.insert(cartItems).values({
      storeId,
      cartId: cart.id,
      productId: draftProduct.id,
      variantId: draftVariant.id,
      quantity: 1,
    });

    await expect(
      repository.placeOrder(
        cart.id,
        token,
        checkoutInput('irrelevant', variant.id),
      ),
    ).rejects.toBeInstanceOf(CheckoutConflictError);
    await expect(db.select().from(orders)).resolves.toHaveLength(0);
    await expect(
      db
        .select({ state: carts.state })
        .from(carts)
        .where(eq(carts.id, cart.id)),
    ).resolves.toEqual([{ state: CartState.ACTIVE }]);
    await expect(
      db
        .select({ reserved: productVariants.reserved })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ reserved: 0 }]);
  });

  it('lets only one concurrent shopper reserve the final tracked unit', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    await db
      .update(productVariants)
      .set({ onHand: 1, reserved: 0 })
      .where(eq(productVariants.id, variant.id));
    const secondToken = 'second-checkout-token';
    const [secondCart] = await db
      .insert(carts)
      .values({
        storeId,
        tokenDigest: createHash('sha256').update(secondToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    await db.insert(cartItems).values({
      storeId,
      cartId: secondCart.id,
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
    });
    const firstInput = checkoutInput(product.id, variant.id, 1, 'first-key');
    const secondInput = checkoutInput(product.id, variant.id, 1, 'second-key');

    const results = await Promise.allSettled([
      repository.placeOrder(cart.id, token, firstInput),
      secondRepository.placeOrder(secondCart.id, secondToken, secondInput),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(db.select().from(orders)).resolves.toHaveLength(1);
    await expect(
      db
        .select({ reserved: productVariants.reserved })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ reserved: 1 }]);
  });

  it('replays one receipt and event for concurrent same-Cart retries', async () => {
    const { cart, product, token, variant } = await seedCheckoutCart();
    const input = checkoutInput(product.id, variant.id);

    const results = await Promise.all([
      repository.placeOrder(cart.id, token, input),
      secondRepository.placeOrder(cart.id, token, input),
    ]);

    expect(results[0]).toEqual(results[1]);
    await expect(db.select().from(orders)).resolves.toHaveLength(1);
    await expect(db.select().from(orderEvents)).resolves.toHaveLength(1);
    await expect(
      db
        .select({ reserved: productVariants.reserved })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ reserved: 1 }]);
  });

  it('rolls back reservations and Order writes after a persistence failure', async () => {
    const { cart, product, token, variant } = await seedCheckoutCart();
    await pool.query(`
      CREATE FUNCTION fail_placement_event() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated placement event failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_placement_event_trigger
      BEFORE INSERT ON order_events
      FOR EACH ROW EXECUTE FUNCTION fail_placement_event();
    `);

    try {
      await expect(
        repository.placeOrder(
          cart.id,
          token,
          checkoutInput(product.id, variant.id),
        ),
      ).rejects.toThrow('simulated placement event failure');
    } finally {
      await pool.query(
        'DROP TRIGGER IF EXISTS fail_placement_event_trigger ON order_events; DROP FUNCTION IF EXISTS fail_placement_event();',
      );
    }

    await expect(db.select().from(orders)).resolves.toHaveLength(0);
    await expect(db.select().from(orderEvents)).resolves.toHaveLength(0);
    await expect(
      db
        .select({ state: carts.state })
        .from(carts)
        .where(eq(carts.id, cart.id)),
    ).resolves.toEqual([{ state: CartState.ACTIVE }]);
    await expect(
      db
        .select({ reserved: productVariants.reserved })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ reserved: 0 }]);
  });

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
