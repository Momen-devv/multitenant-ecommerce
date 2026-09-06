import { ApiProperty } from '@nestjs/swagger';
import {
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
} from '@/common/enums';

export class ProductListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProductListResponseDto {
  @ApiProperty({ type: () => [ProductListItemResponseDto] })
  items!: ProductListItemResponseDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    properties: {
      nextCursor: { type: 'string', nullable: true },
      hasNextPage: { type: 'boolean' },
    },
  })
  pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}

export class PublicProductListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({
    description: 'Lowest active Variant price, in minor currency units',
  })
  price!: number;

  @ApiProperty({
    description:
      'Compare-at price for the active Variant that supplies price, in minor currency units',
    nullable: true,
  })
  compareAtPrice!: number | null;

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PublicProductListResponseDto {
  @ApiProperty({ type: () => [PublicProductListItemResponseDto] })
  items!: PublicProductListItemResponseDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    properties: {
      nextCursor: { type: 'string', nullable: true },
      hasNextPage: { type: 'boolean' },
    },
  })
  pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}

export class ProductContentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  storeId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

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

export class ProductImageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  imageKey!: string;

  @ApiProperty({ nullable: true })
  publicUrl!: string | null;

  @ApiProperty({ nullable: true })
  altText!: string | null;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  byteSize!: number;

  @ApiProperty()
  position!: number;
}

export class ProductOptionValueResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  position!: number;
}

export class ProductOptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ type: () => [ProductOptionValueResponseDto] })
  values!: ProductOptionValueResponseDto[];
}

export class ProductVariantAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  optionId!: string;

  @ApiProperty({ format: 'uuid' })
  optionValueId!: string;
}

export class ProductVariantOptionValueResponseDto extends ProductVariantAssignmentResponseDto {
  @ApiProperty({ type: () => ProductOptionValueResponseDto, nullable: true })
  optionValue!: ProductOptionValueResponseDto | null;
}

export class ProductVariantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  barcode!: string;

  @ApiProperty({ description: 'Minor currency units' })
  price!: number;

  @ApiProperty({ description: 'Minor currency units', nullable: true })
  compareAtPrice!: number | null;

  @ApiProperty({ nullable: true })
  weightGrams!: number | null;

  @ApiProperty({ enum: ProductVariantStatus })
  status!: ProductVariantStatus;

  @ApiProperty({ enum: InventoryPolicy })
  inventoryPolicy!: InventoryPolicy;

  @ApiProperty({ nullable: true })
  onHand!: number | null;

  @ApiProperty({ nullable: true })
  reserved!: number | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: () => [ProductVariantOptionValueResponseDto] })
  optionValues!: ProductVariantOptionValueResponseDto[];
}

export class OwnerProductVariantResponseDto extends ProductVariantResponseDto {
  @ApiProperty({ nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiProperty({
    nullable: true,
    description: 'On-hand quantity less reserved quantity; null when untracked',
  })
  available!: number | null;

  @ApiProperty()
  inStock!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProductVariantBarcodeResponseDto {
  @ApiProperty({ example: 'SKU-01981B2C3D4E5F6789ABCDEF01234567' })
  barcode!: string;
}

export class ProductStoreResponseDto {
  @ApiProperty({ example: 'usd' })
  defaultCurrency!: string;
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  storeId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

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

  @ApiProperty({ type: () => ProductStoreResponseDto, nullable: true })
  store!: ProductStoreResponseDto | null;

  @ApiProperty({ type: () => [ProductOptionResponseDto] })
  options!: ProductOptionResponseDto[];

  @ApiProperty({ type: () => [ProductImageResponseDto] })
  images!: ProductImageResponseDto[];

  @ApiProperty({ type: () => [ProductVariantResponseDto] })
  variants!: ProductVariantResponseDto[];
}
