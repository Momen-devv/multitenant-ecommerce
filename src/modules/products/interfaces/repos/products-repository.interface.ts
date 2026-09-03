import type {
  Product,
  ProductImage,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  ProductVariantOptionValue,
  Store,
} from '@/infrastructure/database/schema/schema.types';

export type CreateProductInput = Pick<Product, 'name' | 'slug' | 'description'>;

export type ProductAggregate = Product & {
  store: Pick<Store, 'defaultCurrency'> | null;
  images: ProductImage[];
  options: Array<ProductOption & { values: ProductOptionValue[] }>;
  variants: Array<
    ProductVariant & {
      optionValues: Array<
        ProductVariantOptionValue & {
          optionValue: ProductOptionValue | null;
        }
      >;
    }
  >;
};

export interface IProductsRepository {
  create(storeId: string, input: CreateProductInput): Promise<Product>;
  findOne(
    storeId: string,
    productId: string,
  ): Promise<ProductAggregate | undefined>;
}
