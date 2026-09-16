import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
export class OrderQueryDto extends CheckoutQueryDto {
  @ApiPropertyOptional({ name: 'filter[paymentMethod][eq]' })
  @IsOptional()
  @IsString()
  'filter[paymentMethod][eq]'?: string;
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
  @ApiProperty() version!: number;
  @ApiProperty() storeId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() subtotal!: number;
  @ApiProperty() shippingFee!: number;
  @ApiProperty() total!: number;
  @ApiProperty() refundedAmount!: number;
  @ApiProperty() accountContact!: CheckoutContactDto;
  @ApiProperty() shippingAddress!: CheckoutAddressDto;
  @ApiProperty({ type: () => [CheckoutItemDto] }) items!: CheckoutItemDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}
export class StartCheckoutResponseDto extends AttemptResponseDto {
  @ApiProperty({ type: () => OrderResponseDto, nullable: true })
  order!: OrderResponseDto | null;
}
export class CursorPageDto {
  @ApiProperty({ type: [Object] }) items!: object[];
  @ApiProperty() pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}
