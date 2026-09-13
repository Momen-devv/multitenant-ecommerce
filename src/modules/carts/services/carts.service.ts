import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CartState, ProductStatus, ProductVariantStatus } from '@/common/enums';
import {
  calculateCartLineTotal,
  MAX_ORDER_TOTAL_MINOR_UNITS,
  MAX_CART_UNIT_PRICE_MINOR_UNITS,
  sumCartMinorUnits,
} from '@/common/commerce/money';
import { SecureTokenService } from '@/common/services/secure-token.service';
import {
  CARTS_REPOSITORY,
  type CartAccessInput,
  type CartPersistenceItem,
  type CartPersistenceSnapshot,
  type ICartsRepository,
} from '../interfaces/repos';
import type {
  CartItemQuote,
  CartQuote,
  CreatedCart,
  PurchasableCartItemQuote,
  RemoveCartItemInput,
  SetCartItemQuantityInput,
} from '../contracts';

export const CART_EXPIRY_DAYS = 30;

@Injectable()
export class CartsService {
  constructor(
    @Inject(CARTS_REPOSITORY)
    private readonly cartsRepository: ICartsRepository,
    private readonly secureTokenService: SecureTokenService,
  ) {}

  async create(storeSlug: string): Promise<CreatedCart> {
    const { token, hashedToken } = this.secureTokenService.generate();
    const expiresAt = new Date(
      Date.now() + CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    const cart = await this.cartsRepository.create({
      storeSlug,
      tokenDigest: hashedToken,
      expiresAt,
    });
    if (!cart) throw new NotFoundException('Store not found');

    return { ...cart, token };
  }

  async read(
    storeSlug: string,
    cartId: string,
    token: string,
  ): Promise<CartQuote> {
    return this.toQuote(
      await this.findAccessibleCart(storeSlug, cartId, token),
    );
  }

  async assertCheckoutAccess(
    storeSlug: string,
    cartId: string,
    token: string,
  ): Promise<void> {
    const accessible = await this.cartsRepository.hasCheckoutAccess(
      this.accessInput(storeSlug, cartId, token),
    );
    if (!accessible) throw new NotFoundException('Cart not found');
  }

  async setQuantity(
    storeSlug: string,
    cartId: string,
    token: string,
    variantId: string,
    input: SetCartItemQuantityInput,
  ): Promise<CartQuote> {
    this.assertQuantity(input.quantity);
    this.assertVersion(input.expectedVersion);
    const access = this.accessInput(storeSlug, cartId, token);
    try {
      await this.cartsRepository.setQuantity({
        ...access,
        variantId,
        ...input,
      });
    } catch (error) {
      this.rethrowCartConflict(error);
    }
    return this.toQuote(
      await this.findAccessibleCart(storeSlug, cartId, token),
    );
  }

  async remove(
    storeSlug: string,
    cartId: string,
    token: string,
    variantId: string,
    input: RemoveCartItemInput,
  ): Promise<CartQuote> {
    this.assertVersion(input.expectedVersion);
    const access = this.accessInput(storeSlug, cartId, token);
    try {
      await this.cartsRepository.remove({ ...access, variantId, ...input });
    } catch (error) {
      this.rethrowCartConflict(error);
    }
    return this.toQuote(
      await this.findAccessibleCart(storeSlug, cartId, token),
    );
  }

  private async findAccessibleCart(
    storeSlug: string,
    cartId: string,
    token: string,
  ): Promise<CartPersistenceSnapshot> {
    const cart = await this.cartsRepository.read(
      this.accessInput(storeSlug, cartId, token),
    );
    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.state !== CartState.ACTIVE || cart.expiresAt <= new Date()) {
      throw new ConflictException('Cart is no longer active');
    }
    return cart;
  }

  private accessInput(
    storeSlug: string,
    cartId: string,
    token: string,
  ): CartAccessInput {
    return {
      storeSlug,
      cartId,
      tokenDigest: this.secureTokenService.hash(token),
    };
  }

  private toQuote(cart: CartPersistenceSnapshot): CartQuote {
    const items: CartItemQuote[] = cart.items.map((item) =>
      isPurchasableItem(item)
        ? {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            blocked: false,
            productName: item.productName,
            variantTitle: item.variantTitle,
            unitPrice: item.unitPrice,
            lineTotal: calculateCartLineTotal(item.unitPrice, item.quantity),
          }
        : {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            blocked: true,
          },
    );
    const activeItems = items.filter(
      (item): item is PurchasableCartItemQuote => !item.blocked,
    );
    const subtotal = sumCartMinorUnits(
      ...activeItems.map((item) => item.lineTotal),
    );
    const hasBlockedItems = items.some((item) => item.blocked);
    return {
      id: cart.id,
      version: cart.version,
      expiresAt: cart.expiresAt,
      currency: cart.currency,
      items,
      hasBlockedItems,
      subtotal,
      shippingAmount: 0,
      taxAmount: 0,
      total: subtotal,
      requiresCheckoutReview: subtotal > MAX_ORDER_TOTAL_MINOR_UNITS,
      quoteFingerprint: quoteFingerprint(cart.currency, activeItems),
    };
  }

  private assertQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new ConflictException('Quantity must be between 1 and 99');
    }
  }

  private assertVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) {
      throw new ConflictException('Cart version is invalid');
    }
  }

  private rethrowCartConflict(error: unknown): never | void {
    if (error instanceof NotFoundException) throw error;
    if (error instanceof ConflictException) throw error;
    throw new ConflictException('Cart could not be updated');
  }
}

function isPurchasableItem(
  item: CartPersistenceItem,
): item is CartPersistenceItem & {
  productName: string;
  variantTitle: string;
  unitPrice: number;
  availableQuantity: number;
} {
  return (
    item.productStatus === ProductStatus.PUBLISHED &&
    item.variantStatus === ProductVariantStatus.ACTIVE &&
    item.productName !== null &&
    item.variantTitle !== null &&
    item.unitPrice !== null &&
    item.unitPrice >= 1 &&
    item.unitPrice <= MAX_CART_UNIT_PRICE_MINOR_UNITS &&
    item.availableQuantity !== null &&
    item.availableQuantity >= item.quantity
  );
}

export function quoteFingerprint(
  currency: string,
  items: ReadonlyArray<{
    productId: string;
    variantId: string;
    quantity: number;
    unitPrice: number;
  }>,
): string {
  const canonical = JSON.stringify({
    currency,
    items: [...items]
      .sort((left, right) => left.variantId.localeCompare(right.variantId))
      .map(({ productId, variantId, quantity, unitPrice }) => ({
        productId,
        variantId,
        quantity,
        unitPrice,
      })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
