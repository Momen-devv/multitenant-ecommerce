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
import {
  planPrices,
  plans,
  subscriptions,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import {
  CartState,
  OrderStatus,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { CheckoutConflictError } from '@/common/errors';
import { OrderTransitionConflictError } from '@/common/errors';
import { quoteFingerprint } from '@/modules/carts/services/carts.service';
import { CartsRepository } from '@/modules/carts/repos/carts.repository';
import { ProductsRepository } from '@/modules/products/repos/products.repository';
import { ProductVariantsRepository } from '@/modules/products/repos/product-variants.repository';
import { StoreRepository } from '@/modules/stores/repos/store.repository';
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
  let cartsRepository: CartsRepository;
  let secondCartsRepository: CartsRepository;
  let secondProductsRepository: ProductsRepository;
  let variantsRepository: ProductVariantsRepository;
  let secondVariantsRepository: ProductVariantsRepository;
  let secondStoresRepository: StoreRepository;

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
    const secondDb = drizzle(secondPool, { schema });
    secondRepository = new OrdersRepository(secondDb);
    cartsRepository = new CartsRepository(db);
    secondCartsRepository = new CartsRepository(secondDb);
    secondProductsRepository = new ProductsRepository(secondDb);
    variantsRepository = new ProductVariantsRepository(db);
    secondVariantsRepository = new ProductVariantsRepository(secondDb);
    secondStoresRepository = new StoreRepository(secondDb);
    await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE order_events, order_items, orders, cart_items, carts, product_variants, products, subscriptions, plan_prices, plans, store, organization, "user" CASCADE',
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
    const storeSlug = `commerce-store-${suffix}`;
    await db.insert(store).values({
      id: storeId,
      organizationId,
      ownerId,
      name: `Store ${suffix}`,
      slug: storeSlug,
    });
    return { storeId, storeSlug };
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
    const { storeId, storeSlug } = await seedStore(generateUUIDv7());
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
    return { cart, product, storeId, storeSlug, token, variant };
  }

  function checkoutInput(
    productId: string,
    variantId: string,
    quantity = 1,
    idempotencyKey = 'checkout-key',
  ) {
    return checkoutInputForLines(
      [{ productId, variantId, quantity, unitPrice: 1000 }],
      idempotencyKey,
    );
  }

  function checkoutInputForLines(
    lines: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice: number;
    }>,
    idempotencyKey: string,
  ) {
    return {
      expectedCartVersion: 1,
      quoteFingerprint: quoteFingerprint('usd', lines),
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

  async function settlesWithin<T>(promise: Promise<T>, milliseconds = 5_000) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(`Operation did not settle within ${milliseconds}ms`),
              ),
            milliseconds,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
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

  it('fulfills a placed Order atomically and consumes its tracked reservation once', async () => {
    const { cart, product, storeId, token, variant } =
      await seedCheckoutCart(2);
    const receipt = await repository.placeOrder(
      cart.id,
      token,
      checkoutInput(product.id, variant.id, 2),
    );

    await expect(
      repository.fulfillOrder(storeId, receipt.id, 'owner-commerce'),
    ).resolves.toMatchObject({
      id: receipt.id,
      status: OrderStatus.FULFILLED,
      paymentMethod: 'cash_on_delivery',
      items: [expect.objectContaining({ quantity: 2 })],
      events: [
        expect.objectContaining({ transition: OrderStatus.PLACED }),
        expect.objectContaining({
          transition: OrderStatus.FULFILLED,
          actorId: 'owner-commerce',
          actorAuthority: 'store_owner',
        }),
      ],
    });

    await expect(
      db
        .select({
          onHand: productVariants.onHand,
          reserved: productVariants.reserved,
          version: productVariants.version,
        })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ onHand: 8, reserved: 0, version: 3 }]);
    await expect(
      db
        .select({ status: orders.status, fulfilledAt: orders.fulfilledAt })
        .from(orders)
        .where(eq(orders.id, receipt.id)),
    ).resolves.toEqual([
      expect.objectContaining({
        status: OrderStatus.FULFILLED,
        fulfilledAt: expect.any(Date),
      }),
    ]);
    await expect(db.select().from(orderEvents)).resolves.toHaveLength(2);
  });

  it('cancels a placed Order once, including for a closed Store', async () => {
    const { cart, product, storeId, token, variant } =
      await seedCheckoutCart(2);
    const receipt = await repository.placeOrder(
      cart.id,
      token,
      checkoutInput(product.id, variant.id, 2),
    );
    await db
      .update(store)
      .set({ status: StoreStatus.OWNER_CLOSED })
      .where(eq(store.id, storeId));

    await expect(
      repository.fulfillOrder(storeId, receipt.id, 'owner-commerce'),
    ).rejects.toBeInstanceOf(OrderTransitionConflictError);
    await expect(
      repository.cancelOrder(
        storeId,
        receipt.id,
        'owner-commerce',
        'Customer requested cancellation',
      ),
    ).resolves.toMatchObject({
      status: OrderStatus.CANCELLED,
      events: [
        expect.objectContaining({ transition: OrderStatus.PLACED }),
        expect.objectContaining({
          transition: OrderStatus.CANCELLED,
          reason: 'Customer requested cancellation',
        }),
      ],
    });
    await expect(
      repository.cancelOrder(
        storeId,
        receipt.id,
        'owner-commerce',
        'Customer requested cancellation',
      ),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELLED });
    await expect(
      repository.fulfillOrder(storeId, receipt.id, 'owner-commerce'),
    ).rejects.toBeInstanceOf(OrderTransitionConflictError);
    await expect(
      db
        .select({
          onHand: productVariants.onHand,
          reserved: productVariants.reserved,
          version: productVariants.version,
        })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ onHand: 10, reserved: 0, version: 3 }]);
    await expect(db.select().from(orderEvents)).resolves.toHaveLength(2);
  });

  it('allows only one concurrent terminal transition without partial inventory changes', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    const receipt = await repository.placeOrder(
      cart.id,
      token,
      checkoutInput(product.id, variant.id),
    );

    const results = await Promise.allSettled([
      repository.fulfillOrder(storeId, receipt.id, 'first-owner'),
      secondRepository.cancelOrder(
        storeId,
        receipt.id,
        'second-owner',
        'Warehouse could not fulfill the Order',
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const [terminalOrder] = await db
      .select({
        status: orders.status,
        fulfilledAt: orders.fulfilledAt,
        cancelledAt: orders.cancelledAt,
      })
      .from(orders)
      .where(eq(orders.id, receipt.id));
    const [balance] = await db
      .select({
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
      })
      .from(productVariants)
      .where(eq(productVariants.id, variant.id));
    if (terminalOrder.status === OrderStatus.FULFILLED) {
      expect(terminalOrder).toMatchObject({
        fulfilledAt: expect.any(Date),
        cancelledAt: null,
      });
      expect(balance).toEqual({ onHand: 9, reserved: 0 });
    } else {
      expect(terminalOrder).toMatchObject({
        status: OrderStatus.CANCELLED,
        fulfilledAt: null,
        cancelledAt: expect.any(Date),
      });
      expect(balance).toEqual({ onHand: 10, reserved: 0 });
    }
    await expect(db.select().from(orderEvents)).resolves.toHaveLength(2);
  });

  it("lists and reads only a Store's immutable Order snapshots", async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    const first = await repository.placeOrder(
      cart.id,
      token,
      checkoutInput(product.id, variant.id),
    );
    const secondToken = 'second-list-token';
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
    const second = await repository.placeOrder(
      secondCart.id,
      secondToken,
      checkoutInput(product.id, variant.id, 1, 'second-list-key'),
    );
    const { storeId: foreignStoreId } = await seedStore('foreign-list');

    const firstPage = await repository.listOrders(storeId, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    await expect(
      repository.listOrders(storeId, {
        limit: 1,
        cursor: firstPage.nextCursor!,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: expect.any(String) })],
      nextCursor: null,
    });
    await expect(
      repository.listOrders(storeId, { status: OrderStatus.PLACED }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: first.id }),
        expect.objectContaining({ id: second.id }),
      ]),
    });

    await db
      .update(products)
      .set({
        name: 'Renamed after purchase',
        status: ProductStatus.ARCHIVED,
        archivedAt: new Date(),
      })
      .where(eq(products.id, product.id));
    await db
      .update(productVariants)
      .set({
        title: 'Archived after purchase',
        sku: 'ARCHIVED-SKU',
        status: ProductVariantStatus.ARCHIVED,
        archivedAt: new Date(),
      })
      .where(eq(productVariants.id, variant.id));

    await expect(repository.getOrder(storeId, first.id)).resolves.toMatchObject(
      {
        id: first.id,
        items: [
          expect.objectContaining({
            productName: product.name,
            variantTitle: variant.title,
            sku: variant.sku,
          }),
        ],
      },
    );
    await expect(repository.getOrder(foreignStoreId, first.id)).rejects.toThrow(
      'Order not found',
    );
    await expect(repository.listOrders(foreignStoreId, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
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

  it('completes overlapping multi-Product checkouts with a consistent lock order', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    const { product: secondProduct, variant: secondVariant } =
      await seedVariant(storeId, 'multi-product');
    await db
      .update(products)
      .set({ status: ProductStatus.PUBLISHED, publishedAt: new Date() })
      .where(eq(products.id, secondProduct.id));
    await db.insert(cartItems).values({
      storeId,
      cartId: cart.id,
      productId: secondProduct.id,
      variantId: secondVariant.id,
      quantity: 1,
    });

    const secondToken = 'multi-product-second-cart';
    const [secondCart] = await db
      .insert(carts)
      .values({
        storeId,
        tokenDigest: createHash('sha256').update(secondToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    await db.insert(cartItems).values([
      {
        storeId,
        cartId: secondCart.id,
        productId: secondProduct.id,
        variantId: secondVariant.id,
        quantity: 1,
      },
      {
        storeId,
        cartId: secondCart.id,
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
      },
    ]);

    const lines = [
      {
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
        unitPrice: 1000,
      },
      {
        productId: secondProduct.id,
        variantId: secondVariant.id,
        quantity: 1,
        unitPrice: 1000,
      },
    ];
    const receipts = await settlesWithin(
      Promise.all([
        repository.placeOrder(
          cart.id,
          token,
          checkoutInputForLines(lines, 'multi-product-first'),
        ),
        secondRepository.placeOrder(
          secondCart.id,
          secondToken,
          checkoutInputForLines([...lines].reverse(), 'multi-product-second'),
        ),
      ]),
    );

    expect(receipts).toHaveLength(2);
    await expect(db.select().from(orders)).resolves.toHaveLength(2);
    const balances = await db
      .select({ id: productVariants.id, reserved: productVariants.reserved })
      .from(productVariants)
      .where(eq(productVariants.storeId, storeId));
    expect(
      new Map(balances.map((balance) => [balance.id, balance.reserved])),
    ).toEqual(
      new Map([
        [variant.id, 2],
        [secondVariant.id, 2],
      ]),
    );
  });

  it('keeps checkout atomic when archival races it on another connection', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    const results = await settlesWithin(
      Promise.allSettled([
        repository.placeOrder(
          cart.id,
          token,
          checkoutInput(product.id, variant.id),
        ),
        secondProductsRepository.archive(storeId, product.id),
      ]),
    );

    expect(results[1]).toMatchObject({ status: 'fulfilled' });
    await expect(
      db
        .select({ status: products.status })
        .from(products)
        .where(eq(products.id, product.id)),
    ).resolves.toEqual([{ status: ProductStatus.ARCHIVED }]);
    const [balance] = await db
      .select({ reserved: productVariants.reserved })
      .from(productVariants)
      .where(eq(productVariants.id, variant.id));
    const checkoutSucceeded = results[0].status === 'fulfilled';
    expect(balance.reserved).toBe(checkoutSucceeded ? 1 : 0);
    await expect(db.select().from(orders)).resolves.toHaveLength(
      checkoutSucceeded ? 1 : 0,
    );
  });

  it.each([StoreStatus.OWNER_CLOSED, StoreStatus.PLATFORM_SUSPENDED])(
    'either rejects checkout or commits it before Store status becomes %s',
    async (nextStatus) => {
      const { cart, product, storeId, token, variant } =
        await seedCheckoutCart();
      const results = await settlesWithin(
        Promise.allSettled([
          repository.placeOrder(
            cart.id,
            token,
            checkoutInput(product.id, variant.id),
          ),
          secondStoresRepository.transitionStatus({
            storeId,
            actorId: 'store-lifecycle-owner',
            actorAuthority:
              nextStatus === StoreStatus.OWNER_CLOSED
                ? 'store_owner'
                : 'platform_super_admin',
            previousStatus: StoreStatus.ACTIVE,
            newStatus: nextStatus,
            reason: 'Verification lifecycle race',
          }),
        ]),
      );

      expect(results[1]).toMatchObject({ status: 'fulfilled' });
      const checkoutSucceeded = results[0].status === 'fulfilled';
      await expect(db.select().from(orders)).resolves.toHaveLength(
        checkoutSucceeded ? 1 : 0,
      );
      await expect(
        db
          .select({ reserved: productVariants.reserved })
          .from(productVariants)
          .where(eq(productVariants.id, variant.id)),
      ).resolves.toEqual([{ reserved: checkoutSucceeded ? 1 : 0 }]);
    },
  );

  it('does not allow a reserved Variant to change inventory policy or lose stock', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    const checkout = repository.placeOrder(
      cart.id,
      token,
      checkoutInput(product.id, variant.id),
    );
    const inventoryEdit = secondVariantsRepository.updateInventory(
      storeId,
      product.id,
      variant.id,
      1,
      { onHand: 0 },
    );
    const [checkoutResult, inventoryResult] = await settlesWithin(
      Promise.allSettled([checkout, inventoryEdit]),
    );

    if (checkoutResult.status === 'fulfilled') {
      expect(inventoryResult).toEqual({
        status: 'fulfilled',
        value: undefined,
      });
      await expect(
        variantsRepository.updateInventory(storeId, product.id, variant.id, 2, {
          inventoryPolicy: 'untracked',
        }),
      ).resolves.toBeUndefined();
      await expect(
        db
          .select({
            inventoryPolicy: productVariants.inventoryPolicy,
            onHand: productVariants.onHand,
            reserved: productVariants.reserved,
          })
          .from(productVariants)
          .where(eq(productVariants.id, variant.id)),
      ).resolves.toEqual([
        { inventoryPolicy: 'tracked', onHand: 10, reserved: 1 },
      ]);
    } else {
      expect(inventoryResult).toMatchObject({ status: 'fulfilled' });
      await expect(db.select().from(orders)).resolves.toHaveLength(0);
      await expect(
        db
          .select({
            onHand: productVariants.onHand,
            reserved: productVariants.reserved,
          })
          .from(productVariants)
          .where(eq(productVariants.id, variant.id)),
      ).resolves.toEqual([{ onHand: 0, reserved: 0 }]);
    }
  });

  it('allows either checkout or a Cart mutation to win, never a partial mix', async () => {
    const { cart, product, storeSlug, token, variant } =
      await seedCheckoutCart();
    const tokenDigest = createHash('sha256').update(token).digest('hex');
    const results = await settlesWithin(
      Promise.allSettled([
        repository.placeOrder(
          cart.id,
          token,
          checkoutInput(product.id, variant.id),
        ),
        secondCartsRepository.setQuantity({
          storeSlug,
          cartId: cart.id,
          tokenDigest,
          variantId: variant.id,
          quantity: 2,
          expectedVersion: 1,
        }),
      ]),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const snapshot = await cartsRepository.read({
      storeSlug,
      cartId: cart.id,
      tokenDigest,
    });
    const checkoutSucceeded = results[0].status === 'fulfilled';
    expect(snapshot).toMatchObject({
      state: checkoutSucceeded ? CartState.CONVERTED : CartState.ACTIVE,
      version: checkoutSucceeded ? 1 : 2,
      items: [
        expect.objectContaining({
          variantId: variant.id,
          quantity: checkoutSucceeded ? 1 : 2,
        }),
      ],
    });
    await expect(db.select().from(orders)).resolves.toHaveLength(
      checkoutSucceeded ? 1 : 0,
    );
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

  it('preserves historical non-USD rows and blocks checkout before writing an Order or reservation', async () => {
    const { cart, product, storeId, token, variant } = await seedCheckoutCart();
    await db
      .update(store)
      .set({ defaultCurrency: 'eur' })
      .where(eq(store.id, storeId));
    const legacyCart = await seedCart(storeId, 'legacy-eur-order');
    const [legacyOrder] = await db
      .insert(orders)
      .values({
        ...orderValues(storeId, legacyCart.id, 'legacy-eur-order'),
        currency: 'eur',
        subtotal: 1234,
        total: 1234,
      })
      .returning();
    const [legacyPlan] = await db
      .insert(plans)
      .values({
        name: 'Legacy EUR',
        code: `legacy-eur-${generateUUIDv7()}`,
        features: {},
        limits: {},
      })
      .returning();
    const [legacyPrice] = await db
      .insert(planPrices)
      .values({
        planId: legacyPlan.id,
        amount: 2999,
        currency: 'eur',
        interval: 'month',
      })
      .returning();
    const [legacySubscription] = await db
      .insert(subscriptions)
      .values({
        storeId,
        planPriceId: legacyPrice.id,
        stripeSubscriptionId: `sub_legacy_${generateUUIDv7()}`,
        status: 'active',
      })
      .returning();

    await expect(
      repository.placeOrder(
        cart.id,
        token,
        checkoutInputForLines(
          [
            {
              productId: product.id,
              variantId: variant.id,
              quantity: 1,
              unitPrice: 1000,
            },
          ],
          'legacy-eur-checkout',
        ),
      ),
    ).rejects.toMatchObject({
      code: 'STORE_CURRENCY_INCOMPATIBLE',
    });

    await expect(
      db
        .select({ currency: store.defaultCurrency })
        .from(store)
        .where(eq(store.id, storeId)),
    ).resolves.toEqual([{ currency: 'eur' }]);
    await expect(
      db
        .select({ amount: planPrices.amount, currency: planPrices.currency })
        .from(planPrices)
        .where(eq(planPrices.id, legacyPrice.id)),
    ).resolves.toEqual([{ amount: 2999, currency: 'eur' }]);
    await expect(
      db
        .select({
          currency: orders.currency,
          subtotal: orders.subtotal,
          total: orders.total,
        })
        .from(orders)
        .where(eq(orders.id, legacyOrder.id)),
    ).resolves.toEqual([{ currency: 'eur', subtotal: 1234, total: 1234 }]);
    await expect(
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.id, legacySubscription.id)),
    ).resolves.toEqual([{ id: legacySubscription.id }]);
    await expect(db.select().from(orders)).resolves.toHaveLength(1);
    await expect(
      db
        .select({ reserved: productVariants.reserved })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id)),
    ).resolves.toEqual([{ reserved: 0 }]);
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
    const { storeId: firstStoreId } = await seedStore('first');
    const { storeId: secondStoreId } = await seedStore('second');
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
    const { storeId } = await seedStore('orders');
    const cart = await seedCart(storeId, '2');
    await db.insert(orders).values(orderValues(storeId, cart.id, 'first'));

    await expect(
      db.insert(orders).values(orderValues(storeId, cart.id, 'second')),
    ).rejects.toBeDefined();
  });

  it('rejects invalid Cart quantities and invalid monetary or state values', async () => {
    const { storeId } = await seedStore('constraints');
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
