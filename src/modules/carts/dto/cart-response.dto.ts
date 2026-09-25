import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActiveCheckoutResponseDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt!: Date | null;
}

export class CartItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  variantId!: string;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'T-shirt' })
  name!: string;

  @ApiProperty({ example: 'Large / blue' })
  variantTitle!: string;

  @ApiProperty({ minimum: 1, maximum: 99 })
  quantity!: number;

  @ApiProperty({
    description: 'Current USD unit price in cents.',
    example: 2500,
  })
  unitPrice!: number;

  @ApiProperty({ description: 'Current line total in cents.', example: 5000 })
  lineTotal!: number;

  @ApiProperty({ enum: ['available', 'unavailable', 'insufficient_stock'] })
  availability!: 'available' | 'unavailable' | 'insufficient_stock';
}

export class CartDetailResponseDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, example: null })
  id!: string | null;

  @ApiProperty({ format: 'uuid' })
  storeId!: string;

  @ApiProperty({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  version!: number;

  @ApiProperty({ example: 'usd' })
  currency!: 'usd';

  @ApiProperty({ type: () => [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({
    description: 'Informational current item subtotal in cents.',
    example: 5000,
  })
  subtotal!: number;

  @ApiPropertyOptional({
    type: () => ActiveCheckoutResponseDto,
    nullable: true,
  })
  activeCheckout!: ActiveCheckoutResponseDto | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, example: null })
  lastActivityAt!: Date | null;
}

export class CartSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  storeId!: string;

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  version!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  itemCount!: number;

  @ApiProperty({ minimum: 1 })
  quantityCount!: number;

  @ApiProperty({ example: 5000 })
  subtotal!: number;

  @ApiProperty({ example: 'usd' })
  currency!: 'usd';

  @ApiPropertyOptional({
    type: () => ActiveCheckoutResponseDto,
    nullable: true,
  })
  activeCheckout!: ActiveCheckoutResponseDto | null;

  @ApiProperty({ format: 'date-time' })
  lastActivityAt!: Date;
}

export class CartListResponseDto {
  @ApiProperty({ type: () => [CartSummaryResponseDto] })
  items!: CartSummaryResponseDto[];
}
