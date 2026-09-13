import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  MAX_CART_DISTINCT_VARIANTS,
  MAX_CART_ITEM_QUANTITY,
} from '@/common/commerce/limits';
import {
  MAX_ORDER_TOTAL_MINOR_UNITS,
  MAX_UNIT_PRICE_MINOR_UNITS,
} from '@/common/commerce/money';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  CartState,
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { CartConflictError } from '@/common/errors';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  cartItems,
  carts,
} from '@/infrastructure/database/schema/commerce.schema';
import {
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import type {
  CartAccessInput,
  CartPersistenceSnapshot,
  CreateCartPersistenceInput,
  ICartsRepository,
  RemoveCartItemPersistenceInput,
  SetCartItemQuantityPersistenceInput,
} from '../interfaces/repos';

@Injectable()
export class CartsRepository implements ICartsRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(input: CreateCartPersistenceInput) {
    return this.db.transaction(async (tx) => {
      const [activeStore] = await tx
        .select({ id: store.id })
        .from(store)
        .where(
          and(
            eq(store.slug, input.storeSlug),
            eq(store.status, StoreStatus.ACTIVE),
          ),
        )
        .for('update');
      if (!activeStore) return undefined;

      const [cart] = await tx
        .insert(carts)
        .values({
          storeId: activeStore.id,
          tokenDigest: input.tokenDigest,
          expiresAt: input.expiresAt,
        })
        .returning({
          id: carts.id,
          version: carts.version,
          expiresAt: carts.expiresAt,
        });
      return cart;
    });
  }

  async read(
    input: CartAccessInput,
  ): Promise<CartPersistenceSnapshot | undefined> {
    const [cart] = await this.db
      .select({
        id: carts.id,
        storeId: carts.storeId,
        state: carts.state,
        version: carts.version,
        expiresAt: carts.expiresAt,
        currency: store.defaultCurrency,
      })
      .from(carts)
      .innerJoin(store, eq(store.id, carts.storeId))
      .where(this.accessCondition(input));
    if (!cart) return undefined;

    const itemRows = await this.db
      .select({
        productId: cartItems.productId,
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        productName: products.name,
        variantTitle: productVariants.title,
        unitPrice: productVariants.price,
        productStatus: products.status,
        variantStatus: productVariants.status,
        availableQuantity: sql<number | null>`case
          when ${productVariants.inventoryPolicy} = ${InventoryPolicy.UNTRACKED}
            then ${MAX_CART_ITEM_QUANTITY}
          else ${productVariants.onHand} - ${productVariants.reserved}
        end`,
      })
      .from(cartItems)
      .leftJoin(
        productVariants,
        and(
          eq(productVariants.storeId, cartItems.storeId),
          eq(productVariants.productId, cartItems.productId),
          eq(productVariants.id, cartItems.variantId),
        ),
      )
      .leftJoin(
        products,
        and(
          eq(products.storeId, cartItems.storeId),
          eq(products.id, cartItems.productId),
        ),
      )
      .where(
        and(eq(cartItems.storeId, cart.storeId), eq(cartItems.cartId, cart.id)),
      );

    return { ...cart, items: itemRows };
  }

  async setQuantity(input: SetCartItemQuantityPersistenceInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const cart = await this.findAuthorizedCartForUpdate(tx, input);
      this.assertEditable(cart, input.expectedVersion);

      const [existing] = await tx
        .select({ id: cartItems.id, quantity: cartItems.quantity })
        .from(cartItems)
        .where(
          and(
            eq(cartItems.storeId, cart.storeId),
            eq(cartItems.cartId, cart.id),
            eq(cartItems.variantId, input.variantId),
          ),
        );

      if (existing) {
        if (existing.quantity === input.quantity) return;
        await this.assertCartTotal(
          tx,
          cart.storeId,
          cart.id,
          input.variantId,
          input.quantity,
        );
        await tx
          .update(cartItems)
          .set({ quantity: input.quantity, updatedAt: new Date() })
          .where(eq(cartItems.id, existing.id));
      } else {
        const variant = await this.assertNewVariantIsPurchasable(
          tx,
          cart.storeId,
          input.variantId,
        );
        await this.assertCartTotal(
          tx,
          cart.storeId,
          cart.id,
          input.variantId,
          input.quantity,
          variant.price,
        );
        const [{ itemCount }] = await tx
          .select({ itemCount: count() })
          .from(cartItems)
          .where(
            and(
              eq(cartItems.storeId, cart.storeId),
              eq(cartItems.cartId, cart.id),
            ),
          );
        if (itemCount >= MAX_CART_DISTINCT_VARIANTS) {
          throw new CartConflictError(
            `A Cart can contain at most ${MAX_CART_DISTINCT_VARIANTS} distinct Variants.`,
          );
        }
        await tx.insert(cartItems).values({
          storeId: cart.storeId,
          cartId: cart.id,
          productId: variant.productId,
          variantId: input.variantId,
          quantity: input.quantity,
        });
      }

      await this.incrementVersion(tx, cart.id, input.expectedVersion);
    });
  }

  async remove(input: RemoveCartItemPersistenceInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const cart = await this.findAuthorizedCartForUpdate(tx, input);
      this.assertEditable(cart, input.expectedVersion);
      const [deleted] = await tx
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.storeId, cart.storeId),
            eq(cartItems.cartId, cart.id),
            eq(cartItems.variantId, input.variantId),
          ),
        )
        .returning({ id: cartItems.id });
      if (!deleted) return;

      await this.incrementVersion(tx, cart.id, input.expectedVersion);
    });
  }

  private accessCondition(input: CartAccessInput) {
    return and(
      eq(carts.id, input.cartId),
      eq(carts.tokenDigest, input.tokenDigest),
      eq(store.slug, input.storeSlug),
      eq(store.status, StoreStatus.ACTIVE),
    );
  }

  private async findAuthorizedCartForUpdate(
    tx: NodePgDatabase<typeof schema>,
    input: CartAccessInput,
  ) {
    const [cart] = await tx
      .select({
        id: carts.id,
        storeId: carts.storeId,
        state: carts.state,
        version: carts.version,
        expiresAt: carts.expiresAt,
      })
      .from(carts)
      .innerJoin(store, eq(store.id, carts.storeId))
      .where(this.accessCondition(input))
      .for('update');
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  private assertEditable(
    cart: { state: CartState; version: number; expiresAt: Date },
    expectedVersion: number,
  ): void {
    if (cart.state !== CartState.ACTIVE || cart.expiresAt <= new Date()) {
      throw new CartConflictError('Cart is no longer active.');
    }
    if (cart.version !== expectedVersion) {
      throw new CartConflictError('Cart changed during this request.');
    }
  }

  private async assertNewVariantIsPurchasable(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    variantId: string,
  ): Promise<{ productId: string; price: number }> {
    const [variant] = await tx
      .select({
        productId: productVariants.productId,
        price: productVariants.price,
      })
      .from(productVariants)
      .innerJoin(
        products,
        and(
          eq(products.storeId, productVariants.storeId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.id, variantId),
          eq(productVariants.status, ProductVariantStatus.ACTIVE),
          eq(products.status, ProductStatus.PUBLISHED),
        ),
      )
      .for('update');
    if (!variant) throw new NotFoundException('Cart not found');
    return variant;
  }

  private async assertCartTotal(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    cartId: string,
    targetVariantId: string,
    targetQuantity: number,
    newVariantPrice?: number,
  ): Promise<void> {
    const items = await tx
      .select({
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        unitPrice: productVariants.price,
        productStatus: products.status,
        variantStatus: productVariants.status,
      })
      .from(cartItems)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.storeId, cartItems.storeId),
          eq(productVariants.productId, cartItems.productId),
          eq(productVariants.id, cartItems.variantId),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.storeId, cartItems.storeId),
          eq(products.id, cartItems.productId),
        ),
      )
      .where(and(eq(cartItems.storeId, storeId), eq(cartItems.cartId, cartId)));

    let total = 0;
    for (const item of items) {
      if (
        item.productStatus !== ProductStatus.PUBLISHED ||
        item.variantStatus !== ProductVariantStatus.ACTIVE ||
        item.unitPrice > MAX_UNIT_PRICE_MINOR_UNITS
      ) {
        continue;
      }
      const quantity =
        item.variantId === targetVariantId ? targetQuantity : item.quantity;
      total += item.unitPrice * quantity;
    }
    if (newVariantPrice !== undefined) {
      if (newVariantPrice > MAX_UNIT_PRICE_MINOR_UNITS) {
        throw new CartConflictError('Cart total exceeds the supported limit.');
      }
      total += newVariantPrice * targetQuantity;
    }
    if (total > MAX_ORDER_TOTAL_MINOR_UNITS) {
      throw new CartConflictError('Cart total exceeds the supported limit.');
    }
  }

  private async incrementVersion(
    tx: NodePgDatabase<typeof schema>,
    cartId: string,
    expectedVersion: number,
  ): Promise<void> {
    const [updated] = await tx
      .update(carts)
      .set({ version: sql`${carts.version} + 1`, updatedAt: new Date() })
      .where(and(eq(carts.id, cartId), eq(carts.version, expectedVersion)))
      .returning({ id: carts.id });
    if (!updated) {
      throw new CartConflictError('Cart changed during this request.');
    }
  }
}
