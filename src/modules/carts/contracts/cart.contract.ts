export interface BlockedCartItemQuote {
  productId: string;
  variantId: string;
  quantity: number;
  blocked: true;
}

export interface PurchasableCartItemQuote {
  productId: string;
  variantId: string;
  quantity: number;
  blocked: false;
  productName: string;
  variantTitle: string;
  unitPrice: number;
  lineTotal: number;
}

export type CartItemQuote = BlockedCartItemQuote | PurchasableCartItemQuote;

export interface CartQuote {
  id: string;
  version: number;
  expiresAt: Date;
  currency: string;
  items: ReadonlyArray<CartItemQuote>;
  hasBlockedItems: boolean;
  subtotal: number;
  shippingAmount: 0;
  taxAmount: 0;
  total: number;
  requiresCheckoutReview: boolean;
  quoteFingerprint: string;
}

export interface CreatedCart {
  id: string;
  version: number;
  expiresAt: Date;
  token: string;
}

export interface SetCartItemQuantityInput {
  quantity: number;
  expectedVersion: number;
}

export interface RemoveCartItemInput {
  expectedVersion: number;
}
