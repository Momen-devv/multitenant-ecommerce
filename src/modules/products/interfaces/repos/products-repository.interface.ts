import type { ApiListQueryInput, CursorPage } from '@/common/api-query';
import type {
  Product,
  ProductImage,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  ProductVariantOptionValue,
  Store,
} from '@/infrastructure/database/schema/schema.types';
import { InventoryPolicy, ProductStatus } from '@/common/enums';

export type CreateProductInput = Pick<Product, 'name' | 'slug' | 'description'>;
export type UpdateProductInput = Partial<Pick<Product, 'name' | 'description'>>;
export type CreateProductSetupInput = CreateProductInput & {
  options: Array<{
    clientKey: string;
    name: string;
    values: Array<{ clientKey: string; value: string }>;
  }>;
  variants: Array<{
    optionValueClientKeys: string[];
    price: number;
    compareAtPrice: number | null;
    weightGrams: number | null;
    inventoryPolicy: InventoryPolicy;
    onHand: number | null;
  }>;
};
export type ProductStatusTransition =
  | ProductStatus.DRAFT
  | ProductStatus.PUBLISHED;

export type ProductAggregate = Pick<
  Product,
  | 'id'
  | 'storeId'
  | 'name'
  | 'slug'
  | 'description'
  | 'status'
  | 'publishedAt'
  | 'archivedAt'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
> & {
  store: Pick<Store, 'defaultCurrency'> | null;
  images: Array<
    Pick<
      ProductImage,
      | 'id'
      | 'imageKey'
      | 'publicUrl'
      | 'altText'
      | 'width'
      | 'height'
      | 'mimeType'
      | 'byteSize'
      | 'position'
    >
  >;
  options: Array<
    Pick<ProductOption, 'id' | 'name' | 'position'> & {
      values: Array<Pick<ProductOptionValue, 'id' | 'value' | 'position'>>;
    }
  >;
  variants: Array<
    Pick<
      ProductVariant,
      | 'id'
      | 'title'
      | 'sku'
      | 'barcode'
      | 'price'
      | 'compareAtPrice'
      | 'weightGrams'
      | 'status'
      | 'inventoryPolicy'
      | 'onHand'
      | 'reserved'
      | 'version'
    > & {
      optionValues: Array<
        Pick<ProductVariantOptionValue, 'optionId' | 'optionValueId'> & {
          optionValue: Pick<
            ProductOptionValue,
            'id' | 'value' | 'position'
          > | null;
        }
      >;
    }
  >;
};

export interface IProductsRepository {
  create(
    storeId: string,
    input: CreateProductInput,
    productLimit: number,
  ): Promise<Product>;
  createSetup(
    storeId: string,
    input: CreateProductSetupInput,
    productLimit: number,
  ): Promise<ProductAggregate>;
  findOne(
    storeId: string,
    productId: string,
  ): Promise<ProductAggregate | undefined>;
  findPage(
    storeId: string,
    input: ApiListQueryInput,
  ): Promise<CursorPage<Record<string, unknown>>>;
  update(
    storeId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<Product | undefined>;
  archive(storeId: string, productId: string): Promise<Product | undefined>;
  transitionStatus(
    storeId: string,
    productId: string,
    status: ProductStatusTransition,
  ): Promise<Product | undefined>;
}
