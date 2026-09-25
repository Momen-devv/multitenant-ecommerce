import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ORDER_STATUSES = [
  'placed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;
export const ORDER_PAYMENT_METHODS = ['cash_on_delivery', 'online'] as const;
export const ORDER_PAYMENT_STATUSES = [
  'unpaid',
  'paid',
  'refund_pending',
  'refunded',
  'refund_failed',
] as const;

export class CreateCheckoutQuoteDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() addressId!: string;
  @ApiProperty({ enum: ['cash_on_delivery', 'online'] })
  @IsEnum(['cash_on_delivery', 'online'])
  paymentMethod!: 'cash_on_delivery' | 'online';
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;
}
export class StartCheckoutDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() quoteId!: string;
}
export class CheckoutQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ name: 'filter[storeId][eq]', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  'filter[storeId][eq]'?: string;
  @ApiPropertyOptional({ name: 'filter[status][eq]' })
  @IsOptional()
  @IsString()
  'filter[status][eq]'?: string;
}
export class OrderQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor returned by a prior page',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @IsObject()
  filter?: Record<string, Record<string, string | string[]>>;
}
export class CheckoutContactDto {
  @ApiProperty() email!: string;
  @ApiProperty() phoneNumber!: string;
}
export class CheckoutAddressDto {
  @ApiProperty() recipientName!: string;
  @ApiProperty() recipientPhone!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiPropertyOptional({ nullable: true }) region!: string | null;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty() countryCode!: string;
}
export class CheckoutItemDto {
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() variantTitle!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() lineTotal!: number;
}
export class QuoteResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty() cartVersion!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiProperty({ type: () => [CheckoutItemDto] }) items!: CheckoutItemDto[];
  @ApiProperty() subtotal!: number;
  @ApiProperty() shippingFee!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: () => CheckoutContactDto })
  accountContact!: CheckoutContactDto;
  @ApiProperty({ type: () => CheckoutAddressDto })
  shippingAddress!: CheckoutAddressDto;
  @ApiPropertyOptional({ nullable: true }) shippingPolicy!: string | null;
}
export class AttemptResponseDto {
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty({ format: 'uuid' }) storeId!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiProperty() status!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() total!: number;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  expiresAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) paymentUrl!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) orderId!:
    | string
    | null;
  @ApiProperty() paymentReviewRequired!: boolean;
  @ApiProperty({ type: [String] }) allowedActions!: string[];
}
export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  version!: number;
  @ApiProperty() storeId!: string;
  @ApiProperty({ enum: ORDER_STATUSES }) status!: string;
  @ApiProperty({ enum: ORDER_PAYMENT_METHODS }) paymentMethod!: string;
  @ApiProperty({ enum: ORDER_PAYMENT_STATUSES }) paymentStatus!: string;
  @ApiProperty({ enum: ['usd'] }) currency!: string;
  @ApiProperty({ minimum: 0 }) subtotal!: number;
  @ApiProperty({ minimum: 0, maximum: 1_000_000 }) shippingFee!: number;
  @ApiProperty({ minimum: 50, maximum: 99_999_999 }) total!: number;
  @ApiProperty({ minimum: 0 }) refundedAmount!: number;
  @ApiProperty() paymentReviewRequired!: boolean;
  @ApiProperty({ type: [String] }) allowedActions!: string[];
  @ApiProperty({ type: () => CheckoutContactDto })
  accountContact!: CheckoutContactDto;
  @ApiProperty({ type: () => CheckoutAddressDto })
  shippingAddress!: CheckoutAddressDto;
  @ApiPropertyOptional({ nullable: true }) shippingPolicy!: string | null;
  @ApiProperty({ type: () => [CheckoutItemDto] }) items!: CheckoutItemDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 100 })
  carrier?: string | null;
  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 200 })
  trackingNumber?: string | null;
  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 500 })
  cancellationReason?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  preparedAt?: Date | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  shippedAt?: Date | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  deliveredAt?: Date | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  cancelledAt?: Date | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  returnedAt?: Date | null;
  @ApiProperty({ type: () => [OrderTimelineEventDto] })
  timeline!: OrderTimelineEventDto[];
}

export class OrderTimelineEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ORDER_STATUSES }) kind!: string;
  @ApiPropertyOptional({ nullable: true, enum: ORDER_STATUSES })
  previousStatus!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: ORDER_STATUSES })
  nextStatus!: string | null;
  @ApiPropertyOptional({ nullable: true }) actorAuthority!: string | null;
  @ApiPropertyOptional({ nullable: true }) actorUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class OrderSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) storeId!: string;
  @ApiProperty({ enum: ORDER_STATUSES })
  status!: (typeof ORDER_STATUSES)[number];
  @ApiProperty({ enum: ORDER_PAYMENT_METHODS })
  paymentMethod!: (typeof ORDER_PAYMENT_METHODS)[number];
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}
export class OrderVersionDto {
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;
}
export class CancelOrderDto extends OrderVersionDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
export class StaffCancelOrderDto extends OrderVersionDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
export class ShipOrderDto extends OrderVersionDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  carrier?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  trackingNumber?: string;
}
export class DeliverOrderDto extends OrderVersionDto {
  @ApiPropertyOptional({
    description: 'Required and true for COD Orders; omit for online Orders.',
  })
  @IsOptional()
  @IsBoolean()
  cashCollected?: boolean;
}
export class ReturnToStoreOrderDto extends OrderVersionDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
  @ApiProperty({ enum: [true] }) @IsBoolean() itemsReceived!: boolean;
}
export class StartCheckoutResponseDto extends AttemptResponseDto {
  @ApiProperty({ type: () => OrderResponseDto, nullable: true })
  order!: OrderResponseDto | null;
}
export class CursorPageDto {
  @ApiProperty({ type: [Object] }) items!: object[];
  @ApiProperty() pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}

export class OrderCursorPageDto {
  @ApiProperty({ type: () => [OrderSummaryDto] }) items!: OrderSummaryDto[];
  @ApiProperty({
    type: 'object',
    properties: {
      nextCursor: { type: 'string', nullable: true },
      hasNextPage: { type: 'boolean' },
    },
  })
  pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}
