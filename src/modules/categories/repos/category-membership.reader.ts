import { CategoryStatus } from '@/common/enums';
import {
  categories,
  productCategories,
} from '@/infrastructure/database/schema/categories.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export async function findCategorySummariesByProduct(
  db: NodePgDatabase<typeof schema>,
  storeId: string,
  productIds: string[],
  visibility: 'all' | 'non-archived' | 'published',
) {
  if (productIds.length === 0) return new Map<string, never[]>();
  const conditions = [
    eq(productCategories.storeId, storeId),
    inArray(productCategories.productId, productIds),
  ];
  if (visibility === 'non-archived') {
    conditions.push(ne(categories.status, CategoryStatus.ARCHIVED));
  } else if (visibility === 'published') {
    conditions.push(eq(categories.status, CategoryStatus.PUBLISHED));
  }
  const rows = await db
    .select({
      productId: productCategories.productId,
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      status: categories.status,
    })
    .from(productCategories)
    .innerJoin(
      categories,
      and(
        eq(categories.storeId, productCategories.storeId),
        eq(categories.id, productCategories.categoryId),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(categories.position), asc(categories.id));
  const byProduct = new Map<
    string,
    Omit<(typeof rows)[number], 'productId'>[]
  >();
  for (const { productId, ...category } of rows) {
    const current = byProduct.get(productId) ?? [];
    current.push(category);
    byProduct.set(productId, current);
  }
  return byProduct;
}
