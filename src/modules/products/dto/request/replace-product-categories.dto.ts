import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';
import { MAX_CATEGORIES_PER_PRODUCT } from '@/modules/products/domain/product-catalog-limits';

export class ReplaceProductCategoriesDto {
  @ApiProperty({ type: () => [String], format: 'uuid', maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(MAX_CATEGORIES_PER_PRODUCT)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds!: string[];

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
