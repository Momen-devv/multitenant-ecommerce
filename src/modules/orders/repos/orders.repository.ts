import { DATABASE } from '@/common/constants/injection-tokens.constants';
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
import { CheckoutConflictError } from '@/common/errors';
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
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash } from 'node:crypto';
import type {
  CheckoutInput,
  CheckoutReceipt,
  OrderedOptionSnapshot,
} from '../contracts';

/**
 * Checkout lock order is Cart, Products (ascending ID), Store, then Variants
 * (ascending ID). Catalog write paths already lock Products before Store.
 */
@Injectable()
export class OrdersRepository {
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
          ...item,
        })),
      };
    });
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
}

function checkoutRequestFingerprint(input: CheckoutInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        expectedCartVersion: input.expectedCartVersion,
        quoteFingerprint: input.quoteFingerprint,
        contact: input.contact,
        deliveryAddress: input.deliveryAddress,
      }),
    )
    .digest('hex');
}
