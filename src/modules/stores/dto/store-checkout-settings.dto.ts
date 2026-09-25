import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsISO31661Alpha2,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateBy,
} from 'class-validator';
import { trimStringOrNull } from '@/common/utils';

export const MAX_SHIPPING_FEE_CENTS = 1_000_000;
export const MAX_SHIPPING_POLICY_LENGTH = 2_000;

const normalizeCountries = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [
        ...new Set(
          (value as unknown[]).map((country) =>
            typeof country === 'string'
              ? country.trim().toUpperCase()
              : country,
          ),
        ),
      ]
    : value;

const RequiresDeliveryCountry = (): PropertyDecorator =>
  ValidateBy({
    name: 'requiresDeliveryCountry',
    validator: {
      validate: (value: unknown, args) => {
        const input = args?.object as
          | UpdateStoreCheckoutSettingsDto
          | undefined;
        if (!input) return false;
        return (
          !(input.cashOnDeliveryEnabled || input.onlineEnabled) ||
          (Array.isArray(value) && value.length > 0)
        );
      },
      defaultMessage: () =>
        'deliveryCountries must contain at least one country when a payment method is enabled',
    },
  });

export class UpdateStoreCheckoutSettingsDto {
  @ApiProperty({
    description: 'Current settings version. Use 0 for an unconfigured Store.',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;

  @ApiProperty({
    description: 'Flat USD shipping fee in cents.',
    minimum: 0,
    maximum: MAX_SHIPPING_FEE_CENTS,
    example: 5000,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_SHIPPING_FEE_CENTS)
  shippingFee!: number;

  @ApiProperty({
    description: 'Supported ISO 3166-1 alpha-2 delivery countries.',
    type: [String],
    example: ['EG', 'US'],
  })
  @Transform(normalizeCountries)
  @IsArray()
  @IsString({ each: true })
  @IsISO31661Alpha2({ each: true })
  @RequiresDeliveryCountry()
  deliveryCountries!: string[];

  @ApiProperty({
    description: 'Optional shipping-policy text. Blank text is stored as null.',
    nullable: true,
    maxLength: MAX_SHIPPING_POLICY_LENGTH,
    example: 'Delivery takes 2–5 business days.',
  })
  @IsDefined()
  @Transform(trimStringOrNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(MAX_SHIPPING_POLICY_LENGTH)
  shippingPolicy!: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  cashOnDeliveryEnabled!: boolean;

  @ApiProperty({
    description:
      'Desired online-payment configuration. It may be enabled before Stripe readiness is complete.',
    example: false,
  })
  @IsBoolean()
  onlineEnabled!: boolean;
}

export class StoreCheckoutSettingsResponseDto {
  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: 'usd' })
  currency!: 'usd';

  @ApiProperty({ example: 5000 })
  shippingFee!: number;

  @ApiProperty({ type: [String], example: ['EG'] })
  deliveryCountries!: string[];

  @ApiProperty({ nullable: true, example: null })
  shippingPolicy!: string | null;

  @ApiProperty({ example: true })
  cashOnDeliveryEnabled!: boolean;

  @ApiProperty({ example: false })
  onlineEnabled!: boolean;

  @ApiProperty({
    description:
      'Cached connected-account readiness; no provider refresh occurs.',
    example: false,
  })
  onlineReady!: boolean;
}

export class StoreCheckoutOptionsResponseDto {
  @ApiProperty({ example: 'usd' })
  currency!: 'usd';

  @ApiProperty({ example: 5000 })
  shippingFee!: number;

  @ApiProperty({ type: [String], example: ['EG'] })
  deliveryCountries!: string[];

  @ApiProperty({ nullable: true, example: null })
  shippingPolicy!: string | null;

  @ApiProperty({
    enum: ['cash_on_delivery', 'online'],
    isArray: true,
    example: ['cash_on_delivery'],
  })
  paymentMethods!: Array<'cash_on_delivery' | 'online'>;

  @ApiProperty({ example: true })
  checkoutAvailable!: boolean;
}
