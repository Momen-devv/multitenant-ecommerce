import { Inject, Injectable } from '@nestjs/common';
import type {
  ActiveCheckoutResponseDto,
  CartDetailResponseDto,
  CartSummaryResponseDto,
  CartVersionDto,
  PutCartItemDto,
} from '../dto';
import {
  CART_ACTIVE_CHECKOUT_READER,
  CARTS_REPOSITORY,
  type ICartsRepository,
} from '../interfaces';

export interface ICartActiveCheckoutReader {
  getActiveCheckout(cartId: string): Promise<ActiveCheckoutResponseDto | null>;
}

@Injectable()
export class CartsService {
  constructor(
    @Inject(CARTS_REPOSITORY) private readonly carts: ICartsRepository,
    @Inject(CART_ACTIVE_CHECKOUT_READER)
    private readonly activeCheckouts: ICartActiveCheckoutReader,
  ) {}

  async list(userId: string): Promise<CartSummaryResponseDto[]> {
    const carts = await this.carts.list(userId);
    return Promise.all(carts.map((cart) => this.withSummaryCheckout(cart)));
  }

  async get(userId: string, storeId: string): Promise<CartDetailResponseDto> {
    return this.withDetailCheckout(await this.carts.get(userId, storeId));
  }

  async putItem(
    userId: string,
    storeId: string,
    variantId: string,
    dto: PutCartItemDto,
  ): Promise<CartDetailResponseDto> {
    return this.withDetailCheckout(
      await this.carts.putItem(
        userId,
        storeId,
        variantId,
        dto.quantity,
        dto.version,
      ),
    );
  }

  async removeItem(
    userId: string,
    storeId: string,
    variantId: string,
    dto: CartVersionDto,
  ): Promise<CartDetailResponseDto> {
    return this.withDetailCheckout(
      await this.carts.removeItem(userId, storeId, variantId, dto.version),
    );
  }

  async delete(
    userId: string,
    storeId: string,
    dto: CartVersionDto,
  ): Promise<CartDetailResponseDto> {
    return this.withDetailCheckout(
      await this.carts.delete(userId, storeId, dto.version),
    );
  }

  private async withDetailCheckout(cart: CartDetailResponseDto) {
    if (!cart.id) return cart;
    return {
      ...cart,
      activeCheckout: await this.activeCheckouts.getActiveCheckout(cart.id),
    };
  }

  private async withSummaryCheckout(cart: CartSummaryResponseDto) {
    return {
      ...cart,
      activeCheckout: await this.activeCheckouts.getActiveCheckout(cart.id),
    };
  }
}
