import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { MAX_CATEGORIES_PER_PRODUCT } from '@/modules/products/domain/product-catalog-limits';
import { trimStringOrNull, trimStringValue } from '@/common/utils';

export class CreateProductDto {
  @ApiProperty({ example: 'Classic T-shirt', minLength: 1, maxLength: 200 })
  @Transform(trimStringValue)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({
    example: 'classic-t-shirt',
    required: false,
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    maxLength: 200,
  })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug can contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string | null;

  @ApiProperty({ required: false, maxLength: 50000 })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 50000)
  description?: string | null;

  @ApiProperty({
    required: false,
    type: () => [String],
    format: 'uuid',
    maxItems: MAX_CATEGORIES_PER_PRODUCT,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CATEGORIES_PER_PRODUCT)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds?: string[];
}
