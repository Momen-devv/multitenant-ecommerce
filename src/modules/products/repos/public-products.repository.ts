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
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { publicProductQuery } from '../queries/public-product.query';
import { findCategorySummariesByProduct } from '@/modules/categories/repos/category-membership.reader';
import type { PublicProductAggregate } from '../cache/public-products.cache';
import type { PublicProductResponseDto } from '../dto/response/product-response.dto';

@Injectable()
export class PublicProductsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findPublishedPage(
    storeSlug: string,
    input: ApiListQueryInput,
    categorySlug?: string,
    expectedStoreId?: string,
    requireVisibleCategory = false,
  ) {
    return this.db.transaction(
      async (tx) => {
        const activeStore = await tx.query.store.findFirst({
          columns: { id: true, defaultCurrency: true },
          where: and(
            eq(store.slug, storeSlug),
            eq(store.status, StoreStatus.ACTIVE),
            expectedStoreId ? eq(store.id, expectedStoreId) : undefined,
          ),
        });
        if (!activeStore) return undefined;

        if (requireVisibleCategory) {
          if (!categorySlug)
            throw new NotFoundException('Published Category not found');
          // Visibility is independent of list filters/cursors, and shares the
          // Product page's snapshot. Cached Category data is never a gate here.
          const visibleCategory = await tx
            .select({ id: categories.id })
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
                eq(categories.slug, categorySlug),
                eq(categories.status, CategoryStatus.PUBLISHED),
              ),
            )
            .limit(1);
          if (!visibleCategory.length)
            throw new NotFoundException('Published Category not found');
        }

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
          extras: query.extras,
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

  findPublishedBySlug(
    storeSlug: string,
    slug: string,
    expectedStoreId?: string,
  ) {
    return this.readPublishedBySlug(storeSlug, slug, expectedStoreId, true);
  }

  findPublishedAggregateBySlug(
    storeSlug: string,
    slug: string,
    expectedStoreId: string,
  ) {
    return this.readPublishedBySlug(storeSlug, slug, expectedStoreId, false);
  }

  // One statement reads the entire active Variant set, including newly added
  // Variants. Filtering to cached IDs would hide graph changes.
  findLiveAvailability(storeId: string, productId: string) {
    return this.db
      .select({
        id: productVariants.id,
        available: sql<boolean>`case when ${productVariants.inventoryPolicy} = 'untracked' then true else ${productVariants.onHand} - ${productVariants.reserved} > 0 end`,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
          eq(productVariants.status, ProductVariantStatus.ACTIVE),
        ),
      );
  }

  private readPublishedBySlug(
    storeSlug: string,
    slug: string,
    expectedStoreId: string | undefined,
    includeAvailability: true,
  ): Promise<PublicProductResponseDto | undefined>;
  private readPublishedBySlug(
    storeSlug: string,
    slug: string,
    expectedStoreId: string | undefined,
    includeAvailability: false,
  ): Promise<PublicProductAggregate | undefined>;
  private async readPublishedBySlug(
    storeSlug: string,
    slug: string,
    expectedStoreId: string | undefined,
    includeAvailability: boolean,
  ): Promise<PublicProductResponseDto | PublicProductAggregate | undefined> {
    return this.db.transaction(
      async (tx) => {
        const activeStore = await tx.query.store.findFirst({
          columns: { id: true, defaultCurrency: true },
          where: and(
            eq(store.slug, storeSlug),
            eq(store.status, StoreStatus.ACTIVE),
            expectedStoreId ? eq(store.id, expectedStoreId) : undefined,
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
              extras: includeAvailability
                ? {
                    available:
                      sql<boolean>`case when ${productVariants.inventoryPolicy} = 'untracked' then true else ${productVariants.onHand} - ${productVariants.reserved} > 0 end`.as(
                        'available',
                      ),
                  }
                : undefined,
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
