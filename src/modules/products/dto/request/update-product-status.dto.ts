import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ProductStatus } from '@/common/enums';

export class UpdateProductStatusDto {
  @ApiProperty({
    enum: [ProductStatus.DRAFT, ProductStatus.PUBLISHED],
    example: ProductStatus.PUBLISHED,
  })
  @IsIn([ProductStatus.DRAFT, ProductStatus.PUBLISHED], {
    message: `status must be one of: ${ProductStatus.DRAFT}, ${ProductStatus.PUBLISHED}`,
  })
  status!: ProductStatus.DRAFT | ProductStatus.PUBLISHED;
}
