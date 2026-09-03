import { ApiProperty } from '@nestjs/swagger';

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

export class ProductVariantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  sku!: string | null;

  @ApiProperty({ nullable: true })
  barcode!: string | null;

  @ApiProperty({ description: 'Minor currency units' })
  price!: number;

  @ApiProperty({ description: 'Minor currency units', nullable: true })
  compareAtPrice!: number | null;

  @ApiProperty({ nullable: true })
  weightGrams!: number | null;

  @ApiProperty({ enum: ['active', 'archived'] })
  status!: 'active' | 'archived';

  @ApiProperty({ enum: ['tracked', 'untracked'] })
  inventoryPolicy!: 'tracked' | 'untracked';

  @ApiProperty({ nullable: true })
  onHand!: number | null;

  @ApiProperty({ nullable: true })
  reserved!: number | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: () => [ProductVariantAssignmentResponseDto] })
  assignments!: ProductVariantAssignmentResponseDto[];
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ['draft', 'published', 'archived'] })
  status!: 'draft' | 'published' | 'archived';

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: () => [ProductVariantResponseDto] })
  variants!: ProductVariantResponseDto[];

  @ApiProperty({ type: () => [ProductOptionResponseDto] })
  options!: ProductOptionResponseDto[];

  @ApiProperty({ type: () => [ProductImageResponseDto] })
  gallery!: ProductImageResponseDto[];
}
