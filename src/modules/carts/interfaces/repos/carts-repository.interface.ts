import type { CartDetailResponseDto, CartSummaryResponseDto } from '../../dto';

export interface ICartsRepository {
  list(userId: string): Promise<CartSummaryResponseDto[]>;
  get(userId: string, storeId: string): Promise<CartDetailResponseDto>;
  putItem(
    userId: string,
    storeId: string,
    variantId: string,
    quantity: number,
    version: number,
  ): Promise<CartDetailResponseDto>;
  removeItem(
    userId: string,
    storeId: string,
    variantId: string,
    version: number,
  ): Promise<CartDetailResponseDto>;
  delete(
    userId: string,
    storeId: string,
    version: number,
  ): Promise<CartDetailResponseDto>;
}
