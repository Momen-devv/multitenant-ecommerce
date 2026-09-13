import {
  InventoryPolicy,
  OrderPaymentMethod,
  OrderStatus,
} from '@/common/enums';
import { MAX_CART_DISTINCT_VARIANTS, MAX_CART_ITEM_QUANTITY } from './money';

export interface DeliveryContactInput {
  recipientName: string;
  email: string;
  phone: string;
}

export interface DeliveryAddressInput {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  countryCode: string;
}

export interface OrderedOptionSnapshot {
  name: string;
  value: string;
}

export interface CheckoutInput {
  expectedCartVersion: number;
  quoteFingerprint: string;
  idempotencyKey: string;
  contact: DeliveryContactInput;
  deliveryAddress: DeliveryAddressInput;
}

export interface PlacedOrderItemReceipt {
  id: string;
  sourceProductId: string;
  sourceVariantId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  orderedOptions: ReadonlyArray<OrderedOptionSnapshot>;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  inventoryPolicy: InventoryPolicy;
}

export interface CheckoutReceipt {
  id: string;
  sourceCartId: string;
  status: OrderStatus.PLACED;
  currency: string;
  paymentMethod: OrderPaymentMethod.CASH_ON_DELIVERY;
  subtotal: number;
  shippingAmount: 0;
  taxAmount: 0;
  total: number;
  placedAt: Date;
  items: ReadonlyArray<PlacedOrderItemReceipt>;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  currency: string;
  total: number;
  placedAt: Date;
}

export interface OrderEventReceipt {
  transition: OrderStatus;
  actorId: string | null;
  actorAuthority: 'guest' | 'store_owner';
  reason: string | null;
  createdAt: Date;
}

export interface OrderDetail extends OrderSummary {
  sourceCartId: string;
  paymentMethod: OrderPaymentMethod.CASH_ON_DELIVERY;
  subtotal: number;
  shippingAmount: number;
  taxAmount: number;
  contact: DeliveryContactInput;
  deliveryAddress: DeliveryAddressInput;
  items: ReadonlyArray<PlacedOrderItemReceipt>;
  events: ReadonlyArray<OrderEventReceipt>;
}

export interface OrderListResult {
  items: ReadonlyArray<OrderSummary>;
  nextCursor: string | null;
}

export const checkoutLimits = {
  maxDistinctVariants: MAX_CART_DISTINCT_VARIANTS,
  maxItemQuantity: MAX_CART_ITEM_QUANTITY,
} as const;
