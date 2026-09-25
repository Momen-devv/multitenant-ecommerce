import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lte,
  notExists,
  sql,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CodedHttpError } from '@/common/errors';
import {
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  cartItems,
  carts,
} from '@/infrastructure/database/schema/carts.schema';
import {
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import {
  checkoutAttempts,
  checkoutQuotes,
} from '@/infrastructure/database/schema/orders.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import type {
  CartDetailResponseDto,
  CartItemResponseDto,
  CartSummaryResponseDto,
} from '../dto';
import {
  MAX_DISTINCT_ITEMS_PER_CART,
  MAX_NONEMPTY_CARTS_PER_USER,
} from '../domain/cart-limits';
import type { ICartsRepository } from '../interfaces';

type Database = NodePgDatabase<typeof schema>;
@Injectable()
export class CartsRepository implements ICartsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(userId: string): Promise<CartSummaryResponseDto[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: carts.id, storeId: carts.storeId })
        .from(carts)
        .where(eq(carts.userId, userId))
        .orderBy(asc(carts.createdAt), asc(carts.id));

      const details = await Promise.all(
        rows.map((row) => this.loadCart(tx, userId, row.storeId)),
      );
      return details
        .filter((detail) => detail.id !== null)
        .map((detail) => this.toSummary(detail));
    });
  }

  async get(userId: string, storeId: string): Promise<CartDetailResponseDto> {
    return this.db.transaction(async (tx) => {
      return this.loadCart(tx, userId, storeId);
    });
  }

  async putItem(
    userId: string,
    storeId: string,
    variantId: string,
    quantity: number,
    version: number,
  ): Promise<CartDetailResponseDto> {
    return this.db.transaction(async (tx) => {
      await this.requireStore(tx, storeId);
      const [current] = await tx
        .select({ id: carts.id, version: carts.version })
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.storeId, storeId)))
        .for('update');

      if (current && current.version !== version) {
        this.throwStaleVersion(current.version);
      }
      if (!current && version !== 0) this.throwStaleVersion(0);
      if (current) await this.assertCartUnlocked(tx, current.id);

      const [existingItem] = current
        ? await tx
            .select({ quantity: cartItems.quantity })
            .from(cartItems)
            .where(
              and(
                eq(cartItems.cartId, current.id),
                eq(cartItems.variantId, variantId),
              ),
            )
            .for('update')
        : [];

      // A same-value write is intentionally a no-op, even if the catalog was
      // subsequently unpublished; it neither promises stock nor refreshes TTL.
      if (existingItem?.quantity === quantity) {
        return this.loadCart(tx, userId, storeId);
      }

      await this.requireAvailableVariant(tx, storeId, variantId, quantity);
      const now = new Date();

      if (!current) {
        const [{ cartCount }] = await tx
          .select({ cartCount: count() })
          .from(carts)
          .where(eq(carts.userId, userId));
        if (Number(cartCount) >= MAX_NONEMPTY_CARTS_PER_USER) {
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'CART_LIMIT_REACHED',
            `A shopper can have at most ${MAX_NONEMPTY_CARTS_PER_USER} nonempty Store carts.`,
          );
        }

        const [created] = await tx
          .insert(carts)
          .values({
            userId,
            storeId,
            version: this.nextVersion(),
            lastActivityAt: now,
            updatedAt: now,
          })
          .returning({ id: carts.id });
        if (!created) throw new Error('Cart creation did not return a Cart.');
        await tx.insert(cartItems).values({
          cartId: created.id,
          storeId,
          variantId,
          quantity,
          updatedAt: now,
        });
      } else if (existingItem) {
        await tx
          .update(cartItems)
          .set({ quantity, updatedAt: now })
          .where(
            and(
              eq(cartItems.cartId, current.id),
              eq(cartItems.variantId, variantId),
            ),
          );
        await this.advanceCart(tx, current.id, now);
      } else {
        const [{ itemCount }] = await tx
          .select({ itemCount: count() })
          .from(cartItems)
          .where(eq(cartItems.cartId, current.id));
        if (Number(itemCount) >= MAX_DISTINCT_ITEMS_PER_CART) {
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'CART_ITEM_LIMIT_REACHED',
            `A Cart can contain at most ${MAX_DISTINCT_ITEMS_PER_CART} distinct variants.`,
          );
        }
        await tx.insert(cartItems).values({
          cartId: current.id,
          storeId,
          variantId,
          quantity,
          updatedAt: now,
        });
        await this.advanceCart(tx, current.id, now);
      }

      return this.loadCart(tx, userId, storeId);
    });
  }

  async removeItem(
    userId: string,
    storeId: string,
    variantId: string,
    version: number,
  ): Promise<CartDetailResponseDto> {
    return this.db.transaction(async (tx) => {
      const activeStore = await this.requireStore(tx, storeId);
      const [current] = await tx
        .select({ id: carts.id, version: carts.version })
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.storeId, storeId)))
        .for('update');
      if (!current) {
        if (version !== 0) this.throwStaleVersion(0);
        return this.syntheticCart(activeStore);
      }
      if (current.version !== version) this.throwStaleVersion(current.version);
      await this.assertCartUnlocked(tx, current.id);

      const [item] = await tx
        .select({ variantId: cartItems.variantId })
        .from(cartItems)
        .where(
          and(
            eq(cartItems.cartId, current.id),
            eq(cartItems.variantId, variantId),
          ),
        )
        .for('update');
      if (!item) return this.loadCart(tx, userId, storeId);

      const now = new Date();
      const [{ remaining }] = await tx
        .select({ remaining: count() })
        .from(cartItems)
        .where(eq(cartItems.cartId, current.id));
      await tx
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.cartId, current.id),
            eq(cartItems.variantId, variantId),
          ),
        );
      if (Number(remaining) === 1) {
        await tx.delete(carts).where(eq(carts.id, current.id));
        return this.syntheticCart(activeStore);
      }
      await this.advanceCart(tx, current.id, now);
      return this.loadCart(tx, userId, storeId);
    });
  }

  async delete(
    userId: string,
    storeId: string,
    version: number,
  ): Promise<CartDetailResponseDto> {
    return this.db.transaction(async (tx) => {
      const activeStore = await this.requireStore(tx, storeId);
      const [current] = await tx
        .select({ id: carts.id, version: carts.version })
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.storeId, storeId)))
        .for('update');
      if (!current) {
        if (version !== 0) this.throwStaleVersion(0);
        return this.syntheticCart(activeStore);
      }
      if (current.version !== version) this.throwStaleVersion(current.version);
      await this.assertCartUnlocked(tx, current.id);
      await tx.delete(carts).where(eq(carts.id, current.id));
      return this.syntheticCart(activeStore);
    });
  }

  /**
   * Deletes only disposable selection data. Attempts, reservations, Orders and
   * commands keep their own snapshots/references, so this must never widen to
   * financial tables. Candidates are re-locked one at a time because a shopper
   * may start checkout between the bounded candidate scan and the deletion.
   */
  async cleanupInactiveResources(
    cartCutoff: Date,
    batchSize = 100,
  ): Promise<{ cartsDeleted: number; quotesDeleted: number }> {
    const now = new Date();
    const activeStatuses = ['creating', 'pending', 'cancelling'] as const;
    const cartCandidates = await this.db
      .select({ id: carts.id })
      .from(carts)
      .where(
        and(
          lte(carts.lastActivityAt, cartCutoff),
          notExists(
            this.db
              .select({ id: checkoutAttempts.id })
              .from(checkoutAttempts)
              .where(
                and(
                  eq(checkoutAttempts.cartId, carts.id),
                  inArray(checkoutAttempts.status, activeStatuses),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(carts.lastActivityAt), asc(carts.id))
      .limit(batchSize);

    let cartsDeleted = 0;
    for (const candidate of cartCandidates) {
      const deleted = await this.db.transaction(async (tx) => {
        const [cart] = await tx
          .select({ id: carts.id })
          .from(carts)
          .where(
            and(
              eq(carts.id, candidate.id),
              lte(carts.lastActivityAt, cartCutoff),
            ),
          )
          .for('update');
        if (!cart) return false;

        const [activeAttempt] = await tx
          .select({ id: checkoutAttempts.id })
          .from(checkoutAttempts)
          .where(
            and(
              eq(checkoutAttempts.cartId, cart.id),
              inArray(checkoutAttempts.status, activeStatuses),
            ),
          )
          .for('update');
        if (activeAttempt) return false;

        const result = await tx.delete(carts).where(eq(carts.id, cart.id));
        return (result.rowCount ?? 0) === 1;
      });
      if (deleted) cartsDeleted += 1;
    }

    const quoteCandidates = await this.db
      .select({ id: checkoutQuotes.id })
      .from(checkoutQuotes)
      .where(
        and(
          isNull(checkoutQuotes.consumedAt),
          lte(checkoutQuotes.expiresAt, now),
        ),
      )
      .orderBy(asc(checkoutQuotes.expiresAt), asc(checkoutQuotes.id))
      .limit(batchSize);

    let quotesDeleted = 0;
    for (const candidate of quoteCandidates) {
      const deleted = await this.db.transaction(async (tx) => {
        const [quote] = await tx
          .select({ id: checkoutQuotes.id })
          .from(checkoutQuotes)
          .where(
            and(
              eq(checkoutQuotes.id, candidate.id),
              isNull(checkoutQuotes.consumedAt),
              lte(checkoutQuotes.expiresAt, now),
            ),
          )
          .for('update');
        if (!quote) return false;

        const result = await tx
          .delete(checkoutQuotes)
          .where(eq(checkoutQuotes.id, quote.id));
        return (result.rowCount ?? 0) === 1;
      });
      if (deleted) quotesDeleted += 1;
    }

    return { cartsDeleted, quotesDeleted };
  }

  private async loadCart(
    tx: Database,
    userId: string,
    storeId: string,
  ): Promise<CartDetailResponseDto> {
    const activeStore = await this.requireStore(tx, storeId);
    const [cart] = await tx
      .select({
        id: carts.id,
        version: carts.version,
        lastActivityAt: carts.lastActivityAt,
      })
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.storeId, storeId)));
    if (!cart) return this.syntheticCart(activeStore);

    const rows = await tx
      .select({
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        productId: products.id,
        name: products.name,
        productStatus: products.status,
        variantTitle: productVariants.title,
        variantStatus: productVariants.status,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
        unitPrice: productVariants.price,
      })
      .from(cartItems)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.storeId, cartItems.storeId),
          eq(productVariants.id, cartItems.variantId),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.storeId, productVariants.storeId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(eq(cartItems.cartId, cart.id))
      .orderBy(asc(cartItems.createdAt), asc(cartItems.variantId));

    const items = rows.map((row) =>
      this.toItem(row, activeStore.status === StoreStatus.ACTIVE),
    );
    return {
      id: cart.id,
      storeId,
      version: cart.version,
      currency: 'usd',
      items,
      subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
      activeCheckout: null,
      lastActivityAt: cart.lastActivityAt,
    };
  }

  private async requireStore(tx: Database, storeId: string) {
    const [result] = await tx
      .select({
        id: store.id,
        status: store.status,
        defaultCurrency: store.defaultCurrency,
      })
      .from(store)
      .where(eq(store.id, storeId));
    if (!result) {
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Store not found.',
      );
    }
    return result;
  }

  private async requireAvailableVariant(
    tx: Database,
    storeId: string,
    variantId: string,
    quantity: number,
  ) {
    // Look up the parent first without a lock, then acquire locks in the
    // established Product -> Store -> Variant order before making a decision.
    const [unlockedVariant] = await tx
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.id, variantId),
        ),
      );
    if (!unlockedVariant) this.throwProductUnavailable();

    const [product] = await tx
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.id, unlockedVariant.productId),
        ),
      )
      .for('update');
    const [activeStore] = await tx
      .select({ status: store.status })
      .from(store)
      .where(eq(store.id, storeId))
      .for('update');
    const [variant] = await tx
      .select({
        status: productVariants.status,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.id, variantId),
        ),
      )
      .for('update');

    if (
      !product ||
      product.status !== ProductStatus.PUBLISHED ||
      !activeStore ||
      activeStore.status !== StoreStatus.ACTIVE ||
      !variant ||
      variant.status !== ProductVariantStatus.ACTIVE
    ) {
      this.throwProductUnavailable();
    }
    if (
      variant.inventoryPolicy === InventoryPolicy.TRACKED &&
      (variant.onHand ?? 0) - (variant.reserved ?? 0) < quantity
    ) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'INSUFFICIENT_STOCK',
        'The requested quantity is not currently available.',
      );
    }
  }

  private async advanceCart(tx: Database, cartId: string, now: Date) {
    await tx
      .update(carts)
      .set({ version: this.nextVersion(), lastActivityAt: now, updatedAt: now })
      .where(eq(carts.id, cartId));
  }

  private async assertCartUnlocked(tx: Database, cartId: string) {
    const [attempt] = await tx
      .select({ id: checkoutAttempts.id })
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.cartId, cartId),
          sql`${checkoutAttempts.status} IN ('creating', 'pending', 'cancelling')`,
        ),
      )
      .for('update');
    if (attempt) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'CART_LOCKED',
        'This Cart has an active checkout and cannot be changed.',
      );
    }
  }

  private nextVersion() {
    return sql<number>`nextval('cart_version_sequence')`;
  }

  private syntheticCart(activeStore: {
    id: string;
    defaultCurrency: string;
  }): CartDetailResponseDto {
    return {
      id: null,
      storeId: activeStore.id,
      version: 0,
      currency: 'usd',
      items: [],
      subtotal: 0,
      activeCheckout: null,
      lastActivityAt: null,
    };
  }

  private toItem(
    row: {
      variantId: string;
      quantity: number;
      productId: string;
      name: string;
      productStatus: ProductStatus;
      variantTitle: string;
      variantStatus: ProductVariantStatus;
      inventoryPolicy: InventoryPolicy;
      onHand: number | null;
      reserved: number | null;
      unitPrice: number;
    },
    storeIsActive: boolean,
  ): CartItemResponseDto {
    const catalogAvailable =
      storeIsActive &&
      row.productStatus === ProductStatus.PUBLISHED &&
      row.variantStatus === ProductVariantStatus.ACTIVE;
    const stockAvailable =
      row.inventoryPolicy !== InventoryPolicy.TRACKED ||
      (row.onHand ?? 0) - (row.reserved ?? 0) >= row.quantity;
    return {
      variantId: row.variantId,
      productId: row.productId,
      name: row.name,
      variantTitle: row.variantTitle,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lineTotal: row.unitPrice * row.quantity,
      availability: !catalogAvailable
        ? 'unavailable'
        : stockAvailable
          ? 'available'
          : 'insufficient_stock',
    };
  }

  private toSummary(detail: CartDetailResponseDto): CartSummaryResponseDto {
    return {
      id: detail.id!,
      storeId: detail.storeId,
      version: detail.version,
      itemCount: detail.items.length,
      quantityCount: detail.items.reduce(
        (total, item) => total + item.quantity,
        0,
      ),
      subtotal: detail.subtotal,
      currency: detail.currency,
      activeCheckout: null,
      lastActivityAt: detail.lastActivityAt!,
    };
  }

  private throwStaleVersion(currentVersion: number): never {
    throw new CodedHttpError(
      HttpStatus.CONFLICT,
      'STALE_VERSION',
      'The Cart was changed by another request. Read the latest Cart and retry.',
      { currentVersion },
    );
  }

  private throwProductUnavailable(): never {
    throw new CodedHttpError(
      HttpStatus.CONFLICT,
      'PRODUCT_UNAVAILABLE',
      'This Product Variant is not available for this Cart.',
    );
  }
}
