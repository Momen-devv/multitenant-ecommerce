import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { CategoryStatus, ProductStatus, StoreStatus } from '@/common/enums';
import {
  CategoryLifecycleConflictError,
  CategoryLimitExceededError,
  CategoryReorderConflictError,
  CategoryVersionConflictError,
  SlugConflictError,
  StoreLifecycleConflictError,
} from '@/common/errors';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  categories,
  productCategories,
} from '@/infrastructure/database/schema/categories.schema';
import { products } from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, count, eq, inArray, max, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Category } from '@/infrastructure/database/schema/schema.types';
import { DatabaseError } from 'pg';
import { DrizzleQueryError } from 'drizzle-orm';
import { ownerCategoryQuery } from '../queries/owner-category.query';
import type {
  CategoryStatusTransition,
  CreateCategoryInput,
  ICategoriesRepository,
  ReorderCategoryInput,
  UpdateCategoryInput,
} from '../interfaces/repos';

@Injectable()
export class CategoriesRepository implements ICategoriesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(storeId: string, input: CreateCategoryInput, limit: number) {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${storeId} || ':categories'))`,
        );
        await this.assertActiveStore(tx, storeId);
        const [{ usage }] = await tx
          .select({ usage: count() })
          .from(categories)
          .where(
            and(
              eq(categories.storeId, storeId),
              ne(categories.status, CategoryStatus.ARCHIVED),
            ),
          );
        if (usage >= limit) throw new CategoryLimitExceededError(limit, usage);
        const [{ lastPosition }] = await tx
          .select({ lastPosition: max(categories.position) })
          .from(categories)
          .where(
            and(
              eq(categories.storeId, storeId),
              ne(categories.status, CategoryStatus.ARCHIVED),
            ),
          );
        const [created] = await tx
          .insert(categories)
          .values({
            storeId,
            ...input,
            position: (lastPosition ?? -1) + 1,
          })
          .returning();
        return created;
      });
    } catch (error) {
      if (this.isUniqueViolation(error, 'categories_store_slug_uidx')) {
        throw new SlugConflictError();
      }
      throw error;
    }
  }

  async findOne(storeId: string, categoryId: string) {
    const category = await this.db.query.categories.findFirst({
      where: and(
        eq(categories.storeId, storeId),
        eq(categories.id, categoryId),
      ),
    });
    if (!category) return undefined;
    const [{ productCount }] = await this.db
      .select({ productCount: count() })
      .from(productCategories)
      .innerJoin(
        products,
        and(
          eq(products.storeId, productCategories.storeId),
          eq(products.id, productCategories.productId),
        ),
      )
      .where(
        and(
          eq(productCategories.storeId, storeId),
          eq(productCategories.categoryId, categoryId),
          ne(products.status, ProductStatus.ARCHIVED),
        ),
      );
    return { ...category, productCount };
  }

  async findPage(storeId: string, input: ApiListQueryInput) {
    const query = compileApiQuery(ownerCategoryQuery, input);
    const conditions = [eq(categories.storeId, storeId), query.where];
    const hasStatusFilter = Object.keys(input.filter?.status ?? {}).length > 0;
    if (!hasStatusFilter) {
      conditions.push(ne(categories.status, CategoryStatus.ARCHIVED));
    }
    const rows = await this.db.query.categories.findMany({
      columns: { ...query.columns, id: true },
      where: and(...conditions),
      orderBy: query.orderBy,
      limit: query.limit + 1,
    });
    const ids = rows.map((item) => item.id);
    const counts = ids.length
      ? await this.db
          .select({ categoryId: productCategories.categoryId, value: count() })
          .from(productCategories)
          .innerJoin(
            products,
            and(
              eq(products.storeId, productCategories.storeId),
              eq(products.id, productCategories.productId),
            ),
          )
          .where(
            and(
              eq(productCategories.storeId, storeId),
              inArray(productCategories.categoryId, ids),
              ne(products.status, ProductStatus.ARCHIVED),
            ),
          )
          .groupBy(productCategories.categoryId)
      : [];
    const countById = new Map(counts.map((row) => [row.categoryId, row.value]));
    return query.createPage(rows, (item) => ({
      productCount: countById.get(item.id) ?? 0,
    }));
  }

  async update(
    storeId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    expectedVersion: number,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const category = await this.lockCategory(tx, storeId, categoryId);
        if (!category) return undefined;
        this.assertMutable(category.status, category.version, expectedVersion);
        if (
          category.status === CategoryStatus.PUBLISHED &&
          input.slug !== undefined &&
          input.slug !== category.slug
        ) {
          throw new CategoryLifecycleConflictError(
            'A published Category slug cannot be changed.',
          );
        }
        const [updated] = await tx
          .update(categories)
          .set({
            ...input,
            version: sql`${categories.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(categories.storeId, storeId),
              eq(categories.id, categoryId),
              eq(categories.version, expectedVersion),
            ),
          )
          .returning();
        if (!updated) throw new CategoryVersionConflictError();
        return updated;
      });
    } catch (error) {
      if (this.isUniqueViolation(error, 'categories_store_slug_uidx')) {
        throw new SlugConflictError();
      }
      throw error;
    }
  }

  async transitionStatus(
    storeId: string,
    categoryId: string,
    status: CategoryStatusTransition,
    expectedVersion: number,
  ) {
    return this.db.transaction(async (tx) => {
      const category = await this.lockCategory(tx, storeId, categoryId);
      if (!category) return undefined;
      this.assertMutable(category.status, category.version, expectedVersion);
      if (category.status === status) {
        throw new CategoryLifecycleConflictError(
          `Category is already ${status}.`,
        );
      }
      const now = new Date();
      const [updated] = await tx
        .update(categories)
        .set({
          status,
          publishedAt: status === CategoryStatus.PUBLISHED ? now : null,
          version: sql`${categories.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(categories.storeId, storeId),
            eq(categories.id, categoryId),
            eq(categories.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated) throw new CategoryVersionConflictError();
      return updated;
    });
  }

  async archive(storeId: string, categoryId: string, expectedVersion: number) {
    return this.db.transaction(async (tx) => {
      const category = await this.lockCategory(tx, storeId, categoryId);
      if (!category) return undefined;
      this.assertMutable(category.status, category.version, expectedVersion);
      const now = new Date();
      const [archived] = await tx
        .update(categories)
        .set({
          status: CategoryStatus.ARCHIVED,
          archivedAt: now,
          version: sql`${categories.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(categories.storeId, storeId),
            eq(categories.id, categoryId),
            eq(categories.version, expectedVersion),
          ),
        )
        .returning();
      if (!archived) throw new CategoryVersionConflictError();
      return archived;
    });
  }

  async reorder(storeId: string, requested: ReorderCategoryInput[]) {
    return this.db.transaction(async (tx) => {
      await this.assertActiveStore(tx, storeId);
      const current = await tx
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.storeId, storeId),
            ne(categories.status, CategoryStatus.ARCHIVED),
          ),
        )
        .orderBy(asc(categories.position), asc(categories.id))
        .for('update');
      const byId = new Map(current.map((category) => [category.id, category]));
      if (
        current.length !== requested.length ||
        requested.some((item) => {
          const category = byId.get(item.id);
          return !category || category.version !== item.expectedVersion;
        })
      ) {
        throw new CategoryReorderConflictError(
          'The Category order is incomplete or contains stale Categories.',
        );
      }
      const updated: Category[] = [];
      for (const [position, item] of requested.entries()) {
        const [category] = await tx
          .update(categories)
          .set({
            position,
            version: sql`${categories.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(categories.storeId, storeId),
              eq(categories.id, item.id),
              eq(categories.version, item.expectedVersion),
            ),
          )
          .returning();
        if (!category) throw new CategoryVersionConflictError();
        updated.push(category);
      }
      return updated;
    });
  }

  private async lockCategory(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    categoryId: string,
  ) {
    await this.assertActiveStore(tx, storeId);
    const [category] = await tx
      .select()
      .from(categories)
      .where(
        and(eq(categories.storeId, storeId), eq(categories.id, categoryId)),
      )
      .for('update');
    return category;
  }

  private assertMutable(
    status: CategoryStatus,
    version: number,
    expectedVersion: number,
  ) {
    if (version !== expectedVersion) throw new CategoryVersionConflictError();
    if (status === CategoryStatus.ARCHIVED) {
      throw new CategoryLifecycleConflictError(
        'Archived Categories cannot be changed.',
      );
    }
  }

  private async assertActiveStore(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
  ) {
    const [row] = await tx
      .select({ status: store.status })
      .from(store)
      .where(eq(store.id, storeId))
      .for('update');
    if (row?.status !== StoreStatus.ACTIVE) {
      throw new StoreLifecycleConflictError(
        'The Store is no longer active and cannot be modified.',
      );
    }
  }

  private isUniqueViolation(error: unknown, constraint: string) {
    if (!(error instanceof DrizzleQueryError)) return false;
    return (
      error.cause instanceof DatabaseError &&
      error.cause.code === '23505' &&
      error.cause.constraint === constraint
    );
  }
}
