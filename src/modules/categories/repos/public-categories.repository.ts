import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { CategoryStatus, ProductStatus, StoreStatus } from '@/common/enums';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  categories,
  productCategories,
} from '@/infrastructure/database/schema/categories.schema';
import { products } from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class PublicCategoriesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findVisible(storeSlug: string) {
    const activeStore = await this.findActiveStore(storeSlug);
    if (!activeStore) return undefined;
    const rows = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        position: categories.position,
        productCount: count(products.id),
      })
      .from(categories)
      .innerJoin(
        productCategories,
        and(
          eq(productCategories.storeId, categories.storeId),
          eq(productCategories.categoryId, categories.id),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.storeId, productCategories.storeId),
          eq(products.id, productCategories.productId),
          eq(products.status, ProductStatus.PUBLISHED),
        ),
      )
      .where(
        and(
          eq(categories.storeId, activeStore.id),
          eq(categories.status, CategoryStatus.PUBLISHED),
        ),
      )
      .groupBy(categories.id)
      .orderBy(asc(categories.position), asc(categories.id));
    return { items: rows };
  }

  async findVisibleBySlug(storeSlug: string, categorySlug: string) {
    const page = await this.findVisible(storeSlug);
    if (!page) return undefined;
    return page.items.find((category) => category.slug === categorySlug);
  }

  private async findActiveStore(storeSlug: string) {
    return this.db.query.store.findFirst({
      columns: { id: true },
      where: and(
        eq(store.slug, storeSlug),
        eq(store.status, StoreStatus.ACTIVE),
      ),
    });
  }
}
