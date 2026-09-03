import type { Product } from '@/infrastructure/database/schema/schema.types';

export type CreateProductInput = Pick<Product, 'name' | 'slug' | 'description'>;

export interface IProductsRepository {
  create(storeId: string, input: CreateProductInput): Promise<Product>;
  findOne(storeId: string, productId: string): Promise<Product | undefined>;
}
