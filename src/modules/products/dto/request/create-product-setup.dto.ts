import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { InventoryPolicy } from '@/common/enums';
import { CreateProductDto } from './create-product.dto';
import {
  MAX_ACTIVE_PRODUCT_VARIANTS,
  MAX_PRODUCT_OPTIONS,
  MAX_PRODUCT_OPTION_VALUES,
} from '../../domain/product-catalog-limits';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimStringArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((entry) => trim({ value: entry })) : value;

export class CreateProductSetupOptionValueDto {
  @ApiProperty({
    example: 'red',
    minLength: 1,
    maxLength: 100,
    description: 'Client reference, unique across all setup option values.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  key!: string;

  @ApiProperty({ example: 'Red', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  value!: string;
}

export class CreateProductSetupOptionDto {
  @ApiProperty({
    example: 'color',
    minLength: 1,
    maxLength: 100,
    description: 'Client reference, unique within this setup request.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  key!: string;

  @ApiProperty({ example: 'Color', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    type: () => [CreateProductSetupOptionValueDto],
    maxItems: MAX_PRODUCT_OPTION_VALUES,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PRODUCT_OPTION_VALUES)
  @ArrayUnique((value: CreateProductSetupOptionValueDto) => value.key)
  @ValidateNested({ each: true })
  @Type(() => CreateProductSetupOptionValueDto)
  values!: CreateProductSetupOptionValueDto[];
}

export class CreateProductSetupVariantDto {
  @ApiPropertyOptional({
    type: () => [String],
    description:
      'One option-value client reference from every option. Omit or provide an empty array only for a product without options.',
  })
  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_OPTIONS)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  optionValueKeys?: string[];

  @ApiProperty({ description: 'Positive minor currency units', minimum: 1 })
  @IsInt()
  @Min(1)
  price!: number;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
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
}

export class CreateProductSetupDto extends CreateProductDto {
  @ApiPropertyOptional({
    type: () => [CreateProductSetupOptionDto],
    maxItems: MAX_PRODUCT_OPTIONS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_OPTIONS)
  @ArrayUnique((option: CreateProductSetupOptionDto) => option.key)
  @ValidateNested({ each: true })
  @Type(() => CreateProductSetupOptionDto)
  options?: CreateProductSetupOptionDto[];

  @ApiProperty({
    type: () => [CreateProductSetupVariantDto],
    maxItems: MAX_ACTIVE_PRODUCT_VARIANTS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ACTIVE_PRODUCT_VARIANTS)
  @ValidateNested({ each: true })
  @Type(() => CreateProductSetupVariantDto)
  variants!: CreateProductSetupVariantDto[];
}
