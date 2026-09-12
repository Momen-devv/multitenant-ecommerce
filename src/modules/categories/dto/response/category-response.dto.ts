import { ApiProperty } from '@nestjs/swagger';
import { CategoryStatus } from '@/common/enums';

export class CategorySummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  slug!: string;
  @ApiProperty({ enum: CategoryStatus })
  status!: CategoryStatus;
}

export class CategoryResponseDto extends CategorySummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  storeId!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty()
  position!: number;
  @ApiProperty()
  productCount!: number;
  @ApiProperty({ nullable: true })
  publishedAt!: Date | null;
  @ApiProperty({ nullable: true })
  archivedAt!: Date | null;
  @ApiProperty()
  version!: number;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

export class CategoryListResponseDto {
  @ApiProperty({ type: () => [CategoryResponseDto] })
  items!: CategoryResponseDto[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}

export class PublicCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  slug!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty()
  position!: number;
  @ApiProperty()
  productCount!: number;
}

export class PublicCategoryListResponseDto {
  @ApiProperty({ type: () => [PublicCategoryResponseDto] })
  items!: PublicCategoryResponseDto[];
}
