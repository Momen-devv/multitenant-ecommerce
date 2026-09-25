import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AtLeastOneField } from '@/common/decorators';
import { MAX_UNIT_PRICE_MINOR_UNITS } from '@/common/commerce/limits';

@AtLeastOneField(['price', 'compareAtPrice', 'weightGrams'])
export class UpdateProductVariantDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_UNIT_PRICE_MINOR_UNITS)
  price?: number;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
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
}
