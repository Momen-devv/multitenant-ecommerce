import type { ApiListQueryInput, CursorPage } from '@/common/api-query';
import type { Category } from '@/infrastructure/database/schema/schema.types';
import type { CategoryStatus } from '@/common/enums';

export type CreateCategoryInput = Pick<
  Category,
  'name' | 'slug' | 'description'
>;
export type UpdateCategoryInput = Partial<
  Pick<Category, 'name' | 'slug' | 'description'>
>;
export type CategoryStatusTransition =
  | CategoryStatus.DRAFT
  | CategoryStatus.PUBLISHED;
export type CategoryWithProductCount = Category & { productCount: number };
export type ReorderCategoryInput = {
  id: string;
  expectedVersion: number;
};

export interface ICategoriesRepository {
  create(
    storeId: string,
    input: CreateCategoryInput,
    categoryLimit: number,
  ): Promise<Category>;
  findOne(
    storeId: string,
    categoryId: string,
  ): Promise<CategoryWithProductCount | undefined>;
  findPage(
    storeId: string,
    input: ApiListQueryInput,
  ): Promise<CursorPage<Record<string, unknown>>>;
  update(
    storeId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    expectedVersion: number,
  ): Promise<Category | undefined>;
  transitionStatus(
    storeId: string,
    categoryId: string,
    status: CategoryStatusTransition,
    expectedVersion: number,
  ): Promise<Category | undefined>;
  archive(
    storeId: string,
    categoryId: string,
    expectedVersion: number,
  ): Promise<Category | undefined>;
  reorder(
    storeId: string,
    categories: ReorderCategoryInput[],
  ): Promise<Category[]>;
}
