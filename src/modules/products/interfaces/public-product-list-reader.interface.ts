import type { ApiListQueryInput } from '@/common/api-query';
import type { PublicProductPage } from '../cache/public-products.cache';

export const PUBLIC_PRODUCT_LIST_READER = Symbol('PUBLIC_PRODUCT_LIST_READER');

export interface PublicProductListReader {
  listCategoryProducts(
    storeSlug: string,
    categorySlug: string,
    query: ApiListQueryInput,
  ): Promise<PublicProductPage>;

  listPublishedProducts(
    storeSlug: string,
    query: ApiListQueryInput,
    categorySlug?: string,
  ): Promise<PublicProductPage>;
}
