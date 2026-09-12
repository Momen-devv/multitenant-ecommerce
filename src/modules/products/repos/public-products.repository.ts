import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  CategoryStatus,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  productImages,
  productOptionValues,
  productOptions,
  products,
  productVariantOptionValues,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import {
  categories,
  productCategories,
} from '@/infrastructure/database/schema/categories.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, exists, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Inject, Injectable } from '@nestjs/common';
import { publicProductQuery } from '../queries/public-product.query';
import { findCategorySummariesByProduct } from '@/modules/categories/repos/category-membership.reader';

@Injectable()
export class PublicProductsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findPublishedPage(
    storeSlug: string,
    input: ApiListQueryInput,
    categorySlug?: string,
  ) {
    return this.db.transaction(
      async (tx) => {
        const activeStore = await tx.query.store.findFirst({
          columns: { id: true, defaultCurrency: true },
          where: and(
            eq(store.slug, storeSlug),
            eq(store.status, StoreStatus.ACTIVE),
          ),
        });
        if (!activeStore) return undefined;

        const query = compileApiQuery(publicProductQuery, input);
        const categoryCondition = categorySlug
          ? exists(
              tx
                .select({ value: sql`1` })
                .from(productCategories)
                .innerJoin(
                  categories,
                  and(
                    eq(categories.storeId, productCategories.storeId),
                    eq(categories.id, productCategories.categoryId),
                  ),
                )
                .where(
                  and(
                    eq(productCategories.storeId, activeStore.id),
                    eq(productCategories.productId, products.id),
                    eq(categories.slug, categorySlug),
                    eq(categories.status, CategoryStatus.PUBLISHED),
                  ),
                ),
            )
          : undefined;
        const rows = await tx.query.products.findMany({
          columns: { ...query.columns, id: true },
          with: {
            images: {
              columns: { id: true, publicUrl: true, altText: true },
              orderBy: [asc(productImages.position), asc(productImages.id)],
              limit: 1,
            },
            variants: {
              columns: { price: true, compareAtPrice: true },
              where: eq(productVariants.status, ProductVariantStatus.ACTIVE),
              orderBy: [asc(productVariants.price), asc(productVariants.id)],
              limit: 1,
            },
          },
          where: and(
            eq(products.storeId, activeStore.id),
            eq(products.status, ProductStatus.PUBLISHED),
            categoryCondition,
            query.where,
          ),
          orderBy: query.orderBy,
          limit: query.limit + 1,
        });

        const categoryMap = await findCategorySummariesByProduct(
          tx,
          activeStore.id,
          rows.map((row) => (row as unknown as { id: string }).id),
          'published',
        );
        return query.createPage(rows, (row) => {
          const {
            id,
            images: [image],
            variants: [variant],
          } = row as unknown as typeof row & { id: string };
          return {
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            currency: activeStore.defaultCurrency,
            image: image ?? null,
            categories: (categoryMap.get(id) ?? []).map(
              this.toPublicCategorySummary,
            ),
          };
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async findPublishedBySlug(storeSlug: string, slug: string) {
    return this.db.transaction(
      async (tx) => {
        const activeStore = await tx.query.store.findFirst({
          columns: { id: true, defaultCurrency: true },
          where: and(
            eq(store.slug, storeSlug),
            eq(store.status, StoreStatus.ACTIVE),
          ),
        });
        if (!activeStore) return undefined;

        const product = await tx.query.products.findFirst({
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
          extras: {
            currency: sql<string>`${activeStore.defaultCurrency}`.as(
              'currency',
            ),
          },
          where: and(
            eq(products.storeId, activeStore.id),
            eq(products.slug, slug),
            eq(products.status, ProductStatus.PUBLISHED),
          ),
          with: {
            images: {
              columns: { id: true, publicUrl: true, altText: true },
              orderBy: [asc(productImages.position), asc(productImages.id)],
            },
            options: {
              columns: { id: true, name: true },
              orderBy: [asc(productOptions.position), asc(productOptions.id)],
              with: {
                values: {
                  columns: { id: true, value: true },
                  orderBy: [
                    asc(productOptionValues.position),
                    asc(productOptionValues.id),
                  ],
                },
              },
            },
            variants: {
              columns: {
                id: true,
                title: true,
                price: true,
                compareAtPrice: true,
                weightGrams: true,
              },
              extras: {
                available:
                  sql<boolean>`case when ${productVariants.inventoryPolicy} = 'untracked' then true else ${productVariants.onHand} - ${productVariants.reserved} > 0 end`.as(
                    'available',
                  ),
              },
              where: eq(productVariants.status, ProductVariantStatus.ACTIVE),
              orderBy: [
                asc(productVariants.createdAt),
                asc(productVariants.id),
              ],
              with: {
                optionValues: {
                  columns: { optionId: true, optionValueId: true },
                  orderBy: [
                    asc(productVariantOptionValues.optionId),
                    asc(productVariantOptionValues.optionValueId),
                  ],
                },
              },
            },
          },
        });
        if (!product) return undefined;
        const categoryMap = await findCategorySummariesByProduct(
          tx,
          activeStore.id,
          [product.id],
          'published',
        );
        return {
          ...product,
          categories: (categoryMap.get(product.id) ?? []).map(
            this.toPublicCategorySummary,
          ),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private readonly toPublicCategorySummary = (category: {
    id: string;
    name: string;
    slug: string;
  }) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
  });
}
