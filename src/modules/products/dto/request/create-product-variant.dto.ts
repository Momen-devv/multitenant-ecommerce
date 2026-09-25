import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { InventoryPolicy, ProductVariantStatus } from '@/common/enums';
import { MAX_PRODUCT_OPTIONS } from '../../domain/product-catalog-limits';
import { MAX_UNIT_PRICE_MINOR_UNITS } from '@/common/commerce/limits';

export class CreateProductVariantDto {
  @ApiPropertyOptional({
    type: () => [String],
    format: 'uuid',
    description:
      'One value ID for each current option, in the Product option order. Required for configurable Products.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_OPTIONS)
  @IsUUID('all', { each: true })
  optionValueIds?: string[];

  @ApiProperty({ description: 'Positive minor currency units', minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_UNIT_PRICE_MINOR_UNITS)
  price!: number;

  @ApiPropertyOptional({
    description: 'Positive minor currency units, greater than price',
    minimum: 1,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_UNIT_PRICE_MINOR_UNITS)
  compareAtPrice?: number | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number | null;

  @ApiPropertyOptional({
    enum: InventoryPolicy,
    default: InventoryPolicy.TRACKED,
  })
  @IsOptional()
  @IsEnum(InventoryPolicy)
  inventoryPolicy?: InventoryPolicy;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Required when inventoryPolicy is tracked',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  onHand?: number;

  @ApiPropertyOptional({
    enum: ProductVariantStatus,
    default: ProductVariantStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ProductVariantStatus)
  status?: ProductVariantStatus;
}
