import type {
  CartState,
  ProductStatus,
  ProductVariantStatus,
} from '@/common/enums';

export interface CreateCartPersistenceInput {
  storeSlug: string;
  tokenDigest: string;
  expiresAt: Date;
}

export interface CartPersistenceItem {
  productId: string;
  variantId: string;
  quantity: number;
  productName: string | null;
  variantTitle: string | null;
  unitPrice: number | null;
  productStatus: ProductStatus | null;
  variantStatus: ProductVariantStatus | null;
  availableQuantity: number | null;
}

export interface CartPersistenceSnapshot {
  id: string;
  state: CartState;
  version: number;
  expiresAt: Date;
  currency: string;
  items: ReadonlyArray<CartPersistenceItem>;
}

export interface CartAccessInput {
  storeSlug: string;
  cartId: string;
  tokenDigest: string;
}

export interface SetCartItemQuantityPersistenceInput extends CartAccessInput {
  variantId: string;
  quantity: number;
  expectedVersion: number;
}

export interface RemoveCartItemPersistenceInput extends CartAccessInput {
  variantId: string;
  expectedVersion: number;
}

export interface ICartsRepository {
  create(
    input: CreateCartPersistenceInput,
  ): Promise<
    Pick<CartPersistenceSnapshot, 'id' | 'version' | 'expiresAt'> | undefined
  >;
  read(input: CartAccessInput): Promise<CartPersistenceSnapshot | undefined>;
  setQuantity(input: SetCartItemQuantityPersistenceInput): Promise<void>;
  remove(input: RemoveCartItemPersistenceInput): Promise<void>;
}
