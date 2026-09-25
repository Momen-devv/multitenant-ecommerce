import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BillingInterval } from '@/common/enums/billing-interval.enum';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  Max,
  Equals,
} from 'class-validator';
import { MAX_PRICE_MINOR_UNITS } from '@/common/commerce/limits';
import { USD_CURRENCY } from '@/common/commerce/currency';

export class CreatePlanPriceDto {
  @ApiProperty({
    description: 'Price in the smallest unit of the currency',
    example: 2900,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR_UNITS)
  amount!: number;

  @ApiPropertyOptional({
    description: 'Currency for newly created plan prices. Defaults to USD.',
    enum: [USD_CURRENCY],
    default: USD_CURRENCY,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Equals(USD_CURRENCY, { message: 'currency must be usd' })
  currency?: typeof USD_CURRENCY;

  @ApiProperty({
    description: 'Billing interval for the price',
    enum: BillingInterval,
    example: BillingInterval.MONTH,
  })
  @IsEnum(BillingInterval)
  interval!: BillingInterval;
}
