import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { compileApiQuery } from '@/common/api-query';
import {
  CartState,
  InventoryPolicy,
  OrderEventActorAuthority,
  OrderPaymentMethod,
  OrderStatus,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import {
  CheckoutConflictError,
  OrderTransitionConflictError,
} from '@/common/errors';
import { calculateLineTotal, sumMinorUnits } from '@/common/commerce/money';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  cartItems,
  carts,
  orderEvents,
  orderItems,
  orders,
} from '@/infrastructure/database/schema/commerce.schema';
import {
  productOptionValues,
  productOptions,
  productVariantOptionValues,
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { quoteFingerprint } from '@/modules/carts/services/carts.service';
import { getNewCheckoutEligibility } from '@/common/commerce/currency';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, asc, DrizzleQueryError, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import type {
  CheckoutInput,
  CheckoutReceipt,
  OrderDetail,
  OrderListQuery,
  OrderListResult,
  OrdersPort,
  OrderedOptionSnapshot,
} from '../contracts';
import { ownerOrderQuery } from '../queries/owner-order.query';

/**
 * Checkout lock order is Cart, Products (ascending ID), Store, then Variants
 * (ascending ID). Catalog write paths already lock Products before Store.
 */
@Injectable()
export class OrdersRepository implements OrdersPort {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async placeOrder(
    cartId: string,
    cartToken: string,
    input: CheckoutInput,
  ): Promise<CheckoutReceipt> {
    const tokenDigest = createHash('sha256').update(cartToken).digest('hex');
    const requestFingerprint = checkoutRequestFingerprint(input);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.placeOrderAttempt(
          cartId,
          tokenDigest,
          input,
          requestFingerprint,
        );
      } catch (error) {
        if (isDetectedDeadlock(error) && attempt < 2) continue;
        throw databaseCause(error);
      }
    }
    throw new Error('Checkout transaction retries were exhausted.');
  }

  async listOrders(
    storeId: string,
    input: OrderListQuery,
  ): Promise<OrderListResult> {
    const query = compileApiQuery(ownerOrderQuery, {
      cursor: input.cursor,
      limit: input.limit,
      filter: input.status ? { status: { eq: input.status } } : undefined,
    });
    const rows = await this.db.query.orders.findMany({
      columns: { ...query.columns, id: true },
      where: and(eq(orders.storeId, storeId), query.where),
      orderBy: query.orderBy,
      limit: query.limit + 1,
    });
    const page = query.createPage(rows);
    return {
      items: page.items.map((item) => ({
        id: item.id,
        status: item.status,
        currency: item.currency,
        total: item.total,
        placedAt: item.placedAt,
      })),
      nextCursor: page.pageInfo.nextCursor,
    };
  }

  async getOrder(storeId: string, orderId: string): Promise<OrderDetail> {
    return this.detailFor(this.db, storeId, orderId);
  }

  async fulfillOrder(
    storeId: string,
    orderId: string,
    actorId: string,
  ): Promise<OrderDetail> {
    return this.transitionOrder(
      storeId,
      orderId,
      actorId,
      OrderStatus.FULFILLED,
    );
  }

  async cancelOrder(
    storeId: string,
    orderId: string,
    actorId: string,
    reason: string,
  ): Promise<OrderDetail> {
    return this.transitionOrder(
      storeId,
      orderId,
      actorId,
      OrderStatus.CANCELLED,
      reason,
    );
  }

  private async placeOrderAttempt(
    cartId: string,
    tokenDigest: string,
    input: CheckoutInput,
    requestFingerprint: string,
  ): Promise<CheckoutReceipt> {
    return this.db.transaction(async (tx) => {
      const cart = await this.lockAuthorizedCart(tx, cartId, tokenDigest);
      const [existingOrder] = await tx
        .select({
          id: orders.id,
          checkoutIdempotencyKey: orders.checkoutIdempotencyKey,
          checkoutRequestFingerprint: orders.checkoutRequestFingerprint,
        })
        .from(orders)
        .where(eq(orders.sourceCartId, cart.id));

      if (existingOrder) {
        if (
          existingOrder.checkoutIdempotencyKey !== input.idempotencyKey ||
          existingOrder.checkoutRequestFingerprint !== requestFingerprint
        ) {
          throw new CheckoutConflictError(
            'This Cart has already been converted with a different checkout request.',
          );
        }
        return this.receiptFor(tx, existingOrder.id);
      }

      if (cart.state !== CartState.ACTIVE || cart.expiresAt <= new Date()) {
        throw new CheckoutConflictError(
          'Cart is no longer active. Refresh your Cart.',
        );
      }
      if (cart.version !== input.expectedCartVersion) {
        throw new CheckoutConflictError(
          'Cart changed during checkout. Refresh your Cart.',
        );
      }

      const lines = await tx
        .select({
          productId: cartItems.productId,
          variantId: cartItems.variantId,
          quantity: cartItems.quantity,
        })
        .from(cartItems)
        .where(
          and(
            eq(cartItems.storeId, cart.storeId),
            eq(cartItems.cartId, cart.id),
          ),
        );
      if (lines.length === 0) {
        throw new CheckoutConflictError('Cart has no items to checkout.');
      }

      const productIds = [
        ...new Set(lines.map((line) => line.productId)),
      ].sort();
      const lockedProducts = await tx
        .select({
          id: products.id,
          name: products.name,
          status: products.status,
        })
        .from(products)
        .where(
          and(
            eq(products.storeId, cart.storeId),
            inArray(products.id, productIds),
          ),
        )
        .orderBy(asc(products.id))
        .for('update');
      if (
        lockedProducts.length !== productIds.length ||
        lockedProducts.some(
          (product) => product.status !== ProductStatus.PUBLISHED,
        )
      ) {
        throw new CheckoutConflictError(
          'One or more Cart items are no longer purchasable. Refresh your Cart.',
        );
      }

      const [lockedStore] = await tx
        .select({
          id: store.id,
          currency: store.defaultCurrency,
          status: store.status,
        })
        .from(store)
        .where(eq(store.id, cart.storeId))
        .for('update');
      if (!lockedStore || lockedStore.status !== StoreStatus.ACTIVE) {
        throw new CheckoutConflictError('Store is not accepting new Orders.');
      }
      const checkoutEligibility = getNewCheckoutEligibility(
        lockedStore.currency,
      );
      if (!checkoutEligibility.eligible) {
        throw new CheckoutConflictError(
          'This Store must be migrated to USD before it can accept new checkout.',
          checkoutEligibility.code,
        );
      }

      const variantIds = [
        ...new Set(lines.map((line) => line.variantId)),
      ].sort();
      const lockedVariants = await tx
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          title: productVariants.title,
          sku: productVariants.sku,
          price: productVariants.price,
          status: productVariants.status,
          inventoryPolicy: productVariants.inventoryPolicy,
          onHand: productVariants.onHand,
          reserved: productVariants.reserved,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.storeId, cart.storeId),
            inArray(productVariants.id, variantIds),
          ),
        )
        .orderBy(asc(productVariants.id))
        .for('update');
      const variantsById = new Map(
        lockedVariants.map((variant) => [variant.id, variant]),
      );
      if (
        lockedVariants.length !== variantIds.length ||
        lines.some((line) => {
          const variant = variantsById.get(line.variantId);
          return (
            !variant ||
            variant.productId !== line.productId ||
            variant.status !== ProductVariantStatus.ACTIVE
          );
        })
      ) {
        throw new CheckoutConflictError(
          'One or more Cart items are no longer purchasable. Refresh your Cart.',
        );
      }

      const actualQuoteFingerprint = quoteFingerprint(
        lockedStore.currency,
        lines.map((line) => ({
          ...line,
          unitPrice: variantsById.get(line.variantId)!.price,
        })),
      );
      if (actualQuoteFingerprint !== input.quoteFingerprint) {
        throw new CheckoutConflictError(
          'Cart prices changed. Refresh your Cart.',
        );
      }

      const optionsByVariant = await this.optionSnapshots(
        tx,
        cart.storeId,
        variantIds,
      );
      const productNamesById = new Map(
        lockedProducts.map((product) => [product.id, product.name]),
      );
      const itemValues = lines.map((line) => {
        const variant = variantsById.get(line.variantId)!;
        if (
          variant.inventoryPolicy === InventoryPolicy.TRACKED &&
          (variant.onHand === null ||
            variant.reserved === null ||
            variant.onHand - variant.reserved < line.quantity)
        ) {
          throw new CheckoutConflictError(
            'One or more Cart items are no longer available. Refresh your Cart.',
          );
        }
        let lineTotal: number;
        try {
          lineTotal = calculateLineTotal(variant.price, line.quantity);
        } catch {
          throw new CheckoutConflictError(
            'Cart total exceeds the supported limit.',
          );
        }
        return {
          storeId: cart.storeId,
          sourceProductId: line.productId,
          sourceVariantId: line.variantId,
          productName: productNamesById.get(line.productId)!,
          variantTitle: variant.title,
          sku: variant.sku,
          orderedOptions: optionsByVariant.get(line.variantId) ?? [],
          unitPrice: variant.price,
          quantity: line.quantity,
          lineTotal,
          inventoryPolicy: variant.inventoryPolicy,
        };
      });
      let subtotal: number;
      try {
        subtotal = sumMinorUnits(...itemValues.map((item) => item.lineTotal));
      } catch {
        throw new CheckoutConflictError(
          'Cart total exceeds the supported limit.',
        );
      }

      for (const line of lines) {
        const variant = variantsById.get(line.variantId)!;
        if (variant.inventoryPolicy === InventoryPolicy.TRACKED) {
          await tx
            .update(productVariants)
            .set({
              reserved: sql`${productVariants.reserved} + ${line.quantity}`,
              version: sql`${productVariants.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(productVariants.id, variant.id));
        }
      }

      const now = new Date();
      const [order] = await tx
        .insert(orders)
        .values({
          storeId: cart.storeId,
          sourceCartId: cart.id,
          currency: lockedStore.currency,
          subtotal,
          shippingAmount: 0,
          taxAmount: 0,
          total: subtotal,
          paymentMethod: OrderPaymentMethod.CASH_ON_DELIVERY,
          recipientName: input.contact.recipientName,
          email: input.contact.email,
          phone: input.contact.phone,
          addressLine1: input.deliveryAddress.addressLine1,
          addressLine2: input.deliveryAddress.addressLine2,
          city: input.deliveryAddress.city,
          region: input.deliveryAddress.region,
          postalCode: input.deliveryAddress.postalCode,
          countryCode: input.deliveryAddress.countryCode,
          checkoutIdempotencyKey: input.idempotencyKey,
          checkoutRequestFingerprint: requestFingerprint,
          placedAt: now,
        })
        .returning({ id: orders.id, placedAt: orders.placedAt });
      const insertedItems = await tx
        .insert(orderItems)
        .values(itemValues.map((item) => ({ ...item, orderId: order.id })))
        .returning({ id: orderItems.id });
      await tx.insert(orderEvents).values({
        storeId: cart.storeId,
        orderId: order.id,
        transition: OrderStatus.PLACED,
        actorAuthority: OrderEventActorAuthority.GUEST,
      });
      await tx
        .update(carts)
        .set({ state: CartState.CONVERTED, convertedAt: now, updatedAt: now })
        .where(and(eq(carts.id, cart.id), eq(carts.state, CartState.ACTIVE)));

      return {
        id: order.id,
        sourceCartId: cart.id,
        status: OrderStatus.PLACED,
        currency: lockedStore.currency,
        paymentMethod: OrderPaymentMethod.CASH_ON_DELIVERY,
        subtotal,
        shippingAmount: 0,
        taxAmount: 0,
        total: subtotal,
        placedAt: order.placedAt,
        items: itemValues.map((item, index) => ({
          id: insertedItems[index].id,
          sourceProductId: item.sourceProductId,
          sourceVariantId: item.sourceVariantId,
          productName: item.productName,
          variantTitle: item.variantTitle,
          sku: item.sku,
          orderedOptions: item.orderedOptions,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          inventoryPolicy: item.inventoryPolicy,
        })),
      };
    });
  }

  /**
   * Terminal transitions lock the Order, then Store, then Variants by ID.
   * This remains compatible with checkout and catalog write paths, which take
   * the Store lock before their Variant locks.
   */
  private async transitionOrder(
    storeId: string,
    orderId: string,
    actorId: string,
    targetStatus: OrderStatus.FULFILLED | OrderStatus.CANCELLED,
    reason?: string,
  ): Promise<OrderDetail> {
    if (!actorId.trim()) throw new BadRequestException('actorId is required');
    if (targetStatus === OrderStatus.CANCELLED) {
      if (!reason || reason !== reason.trim() || reason.length > 500) {
        throw new BadRequestException(
          'Cancellation reason must be between 1 and 500 trimmed characters.',
        );
      }
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.transaction(async (tx) => {
          const [order] = await tx
            .select({ id: orders.id, status: orders.status })
            .from(orders)
            .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
            .for('update');
          if (!order) throw new NotFoundException('Order not found');

          if (order.status === targetStatus) {
            return this.detailFor(tx, storeId, orderId);
          }
          if (order.status !== OrderStatus.PLACED) {
            throw new OrderTransitionConflictError(
              `Order has already been ${order.status}.`,
            );
          }

          const items = await tx
            .select({
              sourceVariantId: orderItems.sourceVariantId,
              quantity: orderItems.quantity,
              inventoryPolicy: orderItems.inventoryPolicy,
            })
            .from(orderItems)
            .where(
              and(
                eq(orderItems.storeId, storeId),
                eq(orderItems.orderId, orderId),
              ),
            )
            .orderBy(asc(orderItems.sourceVariantId));

          const [lockedStore] = await tx
            .select({ id: store.id, status: store.status })
            .from(store)
            .where(eq(store.id, storeId))
            .for('update');
          if (!lockedStore) throw new NotFoundException('Store not found');
          if (
            targetStatus === OrderStatus.FULFILLED &&
            lockedStore.status !== StoreStatus.ACTIVE
          ) {
            throw new OrderTransitionConflictError(
              'Inactive Stores cannot fulfill Orders.',
            );
          }

          const trackedItems = items.filter(
            (item) => item.inventoryPolicy === InventoryPolicy.TRACKED,
          );
          if (trackedItems.length) {
            const variantIds = trackedItems.map((item) => item.sourceVariantId);
            const lockedVariants = await tx
              .select({
                id: productVariants.id,
                onHand: productVariants.onHand,
                reserved: productVariants.reserved,
              })
              .from(productVariants)
              .where(
                and(
                  eq(productVariants.storeId, storeId),
                  inArray(productVariants.id, variantIds),
                ),
              )
              .orderBy(asc(productVariants.id))
              .for('update');
            const variantsById = new Map(
              lockedVariants.map((variant) => [variant.id, variant]),
            );

            for (const item of trackedItems) {
              const variant = variantsById.get(item.sourceVariantId);
              if (
                !variant ||
                variant.onHand === null ||
                variant.reserved === null ||
                variant.reserved < item.quantity ||
                (targetStatus === OrderStatus.FULFILLED &&
                  variant.onHand < item.quantity)
              ) {
                throw new OrderTransitionConflictError(
                  'Order reservation is no longer available.',
                );
              }
              await tx
                .update(productVariants)
                .set({
                  ...(targetStatus === OrderStatus.FULFILLED
                    ? {
                        onHand: sql`${productVariants.onHand} - ${item.quantity}`,
                      }
                    : {}),
                  reserved: sql`${productVariants.reserved} - ${item.quantity}`,
                  version: sql`${productVariants.version} + 1`,
                  updatedAt: new Date(),
                })
                .where(eq(productVariants.id, item.sourceVariantId));
            }
          }

          const now = new Date();
          await tx
            .update(orders)
            .set({
              status: targetStatus,
              ...(targetStatus === OrderStatus.FULFILLED
                ? { fulfilledAt: now }
                : { cancelledAt: now }),
              updatedAt: now,
            })
            .where(eq(orders.id, orderId));
          await tx.insert(orderEvents).values({
            storeId,
            orderId,
            transition: targetStatus,
            actorId,
            actorAuthority: OrderEventActorAuthority.STORE_OWNER,
            ...(targetStatus === OrderStatus.CANCELLED ? { reason } : {}),
          });

          return this.detailFor(tx, storeId, orderId);
        });
      } catch (error) {
        if (isDetectedDeadlock(error) && attempt < 2) continue;
        throw databaseCause(error);
      }
    }
    throw new Error('Order transition transaction retries were exhausted.');
  }

  private async lockAuthorizedCart(
    tx: NodePgDatabase<typeof schema>,
    cartId: string,
    tokenDigest: string,
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
      .where(and(eq(carts.id, cartId), eq(carts.tokenDigest, tokenDigest)))
      .for('update');
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  private async optionSnapshots(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    variantIds: string[],
  ): Promise<Map<string, OrderedOptionSnapshot[]>> {
    const rows = await tx
      .select({
        variantId: productVariantOptionValues.variantId,
        name: productOptions.name,
        value: productOptionValues.value,
      })
      .from(productVariantOptionValues)
      .innerJoin(
        productOptions,
        and(
          eq(productOptions.id, productVariantOptionValues.optionId),
          eq(productOptions.storeId, productVariantOptionValues.storeId),
          eq(productOptions.productId, productVariantOptionValues.productId),
        ),
      )
      .innerJoin(
        productOptionValues,
        and(
          eq(productOptionValues.id, productVariantOptionValues.optionValueId),
          eq(productOptionValues.optionId, productVariantOptionValues.optionId),
        ),
      )
      .where(
        and(
          eq(productVariantOptionValues.storeId, storeId),
          inArray(productVariantOptionValues.variantId, variantIds),
        ),
      )
      .orderBy(
        asc(productVariantOptionValues.variantId),
        asc(productOptions.position),
      );
    const result = new Map<string, OrderedOptionSnapshot[]>();
    for (const row of rows) {
      const snapshots = result.get(row.variantId) ?? [];
      snapshots.push({ name: row.name, value: row.value });
      result.set(row.variantId, snapshots);
    }
    return result;
  }

  private async receiptFor(
    tx: NodePgDatabase<typeof schema>,
    orderId: string,
  ): Promise<CheckoutReceipt> {
    const [order] = await tx
      .select({
        id: orders.id,
        sourceCartId: orders.sourceCartId,
        currency: orders.currency,
        subtotal: orders.subtotal,
        shippingAmount: orders.shippingAmount,
        taxAmount: orders.taxAmount,
        total: orders.total,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order) throw new ConflictException('Checkout receipt is unavailable.');
    const items = await tx
      .select({
        id: orderItems.id,
        sourceProductId: orderItems.sourceProductId,
        sourceVariantId: orderItems.sourceVariantId,
        productName: orderItems.productName,
        variantTitle: orderItems.variantTitle,
        sku: orderItems.sku,
        orderedOptions: orderItems.orderedOptions,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
        inventoryPolicy: orderItems.inventoryPolicy,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.id));
    return {
      ...order,
      status: OrderStatus.PLACED,
      paymentMethod: OrderPaymentMethod.CASH_ON_DELIVERY,
      shippingAmount: 0,
      taxAmount: 0,
      items,
    };
  }

  private async detailFor(
    db: NodePgDatabase<typeof schema>,
    storeId: string,
    orderId: string,
  ): Promise<OrderDetail> {
    const [order] = await db
      .select({
        id: orders.id,
        sourceCartId: orders.sourceCartId,
        status: orders.status,
        currency: orders.currency,
        paymentMethod: orders.paymentMethod,
        subtotal: orders.subtotal,
        shippingAmount: orders.shippingAmount,
        taxAmount: orders.taxAmount,
        total: orders.total,
        recipientName: orders.recipientName,
        email: orders.email,
        phone: orders.phone,
        addressLine1: orders.addressLine1,
        addressLine2: orders.addressLine2,
        city: orders.city,
        region: orders.region,
        postalCode: orders.postalCode,
        countryCode: orders.countryCode,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)));
    if (!order) throw new NotFoundException('Order not found');

    const items = await db
      .select({
        id: orderItems.id,
        sourceProductId: orderItems.sourceProductId,
        sourceVariantId: orderItems.sourceVariantId,
        productName: orderItems.productName,
        variantTitle: orderItems.variantTitle,
        sku: orderItems.sku,
        orderedOptions: orderItems.orderedOptions,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
        inventoryPolicy: orderItems.inventoryPolicy,
      })
      .from(orderItems)
      .where(
        and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)),
      )
      .orderBy(asc(orderItems.id));
    const events = await db
      .select({
        transition: orderEvents.transition,
        actorId: orderEvents.actorId,
        actorAuthority: orderEvents.actorAuthority,
        reason: orderEvents.reason,
        createdAt: orderEvents.createdAt,
      })
      .from(orderEvents)
      .where(
        and(eq(orderEvents.storeId, storeId), eq(orderEvents.orderId, orderId)),
      )
      .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id));

    return {
      id: order.id,
      status: order.status,
      currency: order.currency,
      total: order.total,
      placedAt: order.placedAt,
      sourceCartId: order.sourceCartId,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      shippingAmount: order.shippingAmount,
      taxAmount: order.taxAmount,
      contact: {
        recipientName: order.recipientName,
        email: order.email,
        phone: order.phone,
      },
      deliveryAddress: {
        addressLine1: order.addressLine1,
        ...(order.addressLine2 ? { addressLine2: order.addressLine2 } : {}),
        city: order.city,
        ...(order.region ? { region: order.region } : {}),
        ...(order.postalCode ? { postalCode: order.postalCode } : {}),
        countryCode: order.countryCode,
      },
      items,
      events,
    };
  }
}

function checkoutRequestFingerprint(input: CheckoutInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        expectedCartVersion: input.expectedCartVersion,
        quoteFingerprint: input.quoteFingerprint,
        contact: {
          recipientName: input.contact.recipientName,
          email: input.contact.email,
          phone: input.contact.phone,
        },
        deliveryAddress: {
          addressLine1: input.deliveryAddress.addressLine1,
          addressLine2: input.deliveryAddress.addressLine2 ?? null,
          city: input.deliveryAddress.city,
          region: input.deliveryAddress.region ?? null,
          postalCode: input.deliveryAddress.postalCode ?? null,
          countryCode: input.deliveryAddress.countryCode,
        },
      }),
    )
    .digest('hex');
}

function isDetectedDeadlock(error: unknown): boolean {
  return (
    error instanceof DrizzleQueryError &&
    error.cause instanceof DatabaseError &&
    error.cause.code === '40P01'
  );
}

function databaseCause(error: unknown): unknown {
  return error instanceof DrizzleQueryError && error.cause instanceof Error
    ? error.cause
    : error;
}
