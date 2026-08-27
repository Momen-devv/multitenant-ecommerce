import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BillingInterval } from '@/common/enums/billing-interval.enum';
import {
  IsEnum,
  IsInt,
  IsISO4217CurrencyCode,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreatePlanPriceDto {
  @ApiProperty({
    description: 'Price in the smallest unit of the currency',
    example: 2900,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({
    description: 'ISO 4217 currency code',
    example: 'usd',
    minLength: 3,
    maxLength: 3,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(3, 3)
  @IsISO4217CurrencyCode()
  currency!: string;

  @ApiProperty({
    description: 'Billing interval for the price',
    enum: BillingInterval,
    example: BillingInterval.MONTH,
  })
  @IsEnum(BillingInterval)
  interval!: BillingInterval;
}
