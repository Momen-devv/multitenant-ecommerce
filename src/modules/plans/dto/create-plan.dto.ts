import { ApiProperty } from '@nestjs/swagger';
import {
  IsBooleanRecord,
  IsNonNegativeIntegerRecord,
} from '@/common/decorators/record-validation.decorator';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { CreatePlanPriceDto } from './create-plan-price.dto';

export class CreatePlanDto {
  @ApiProperty({
    description: 'Display name of the plan',
    example: 'Professional',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({
    description: 'Unique lowercase identifier for the plan',
    example: 'professional',
    pattern: '^[a-z0-9-]+$',
    minLength: 2,
    maxLength: 64,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'code can contain only lowercase letters, numbers, and hyphens',
  })
  @Length(2, 64)
  code!: string;

  @ApiProperty({
    description: 'Optional description of the plan',
    example: 'For growing businesses',
    maxLength: 500,
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  description?: string;

  @ApiProperty({
    description: 'Feature flags included with the plan',
    type: 'object',
    additionalProperties: { type: 'boolean' },
    example: { customDomain: true, analytics: false },
  })
  @IsObject()
  @IsBooleanRecord()
  features!: Record<string, boolean>;

  @ApiProperty({
    description: 'Numeric usage limits for the plan',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { products: 1000, coupons: 1000, categories: 1000 },
  })
  @IsObject()
  @IsNonNegativeIntegerRecord()
  limits!: Record<string, number>;

  @ApiProperty({
    description: 'At least one price for the plan',
    type: () => CreatePlanPriceDto,
    isArray: true,
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique(
    (price: CreatePlanPriceDto | null | undefined) =>
      price && typeof price === 'object'
        ? `${String(price.currency)}:${String(price.interval)}`
        : price,
    { message: 'Only one price per currency and billing interval is allowed' },
  )
  @ValidateNested({ each: true })
  @Type(() => CreatePlanPriceDto)
  prices!: CreatePlanPriceDto[];
}
