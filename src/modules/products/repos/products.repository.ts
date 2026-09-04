import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  productImages,
  productOptionValues,
  productOptions,
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { ProductStatus } from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import type {
  CreateProductInput,
  IProductsRepository,
  ProductAggregate,
  UpdateProductInput,
} from '../interfaces/repos';
import { ownerProductQuery } from '../queries/owner-product.query';

@Injectable()
export class ProductsRepository implements IProductsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(storeId: string, input: CreateProductInput) {
    try {
      const [product] = await this.db
        .insert(products)
        .values({ storeId, ...input })
        .returning();
      return product;
    } catch (error) {
      if (this.isUniqueViolation(error, 'products_store_slug_uidx')) {
        throw new SlugConflictError();
      }

      throw error;
    }
  }

  async findOne(
    storeId: string,
    productId: string,
  ): Promise<ProductAggregate | undefined> {
    return this.db.query.products.findFirst({
      where: and(eq(products.storeId, storeId), eq(products.id, productId)),
      columns: {
        id: true,
        storeId: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        store: {
          columns: {
            defaultCurrency: true,
          },
        },
        images: {
          columns: {
            id: true,
            imageKey: true,
            publicUrl: true,
            altText: true,
            width: true,
            height: true,
            mimeType: true,
            byteSize: true,
            position: true,
          },
          orderBy: [asc(productImages.position), asc(productImages.id)],
        },
        options: {
          columns: { id: true, name: true, position: true },
          orderBy: [asc(productOptions.position), asc(productOptions.id)],
          with: {
            values: {
              columns: { id: true, value: true, position: true },
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
            sku: true,
            barcode: true,
            price: true,
            compareAtPrice: true,
            weightGrams: true,
            status: true,
            inventoryPolicy: true,
            onHand: true,
            reserved: true,
            version: true,
          },
          orderBy: [asc(productVariants.createdAt), asc(productVariants.id)],
          with: {
            optionValues: {
              columns: { optionId: true, optionValueId: true },
              with: {
                optionValue: {
                  columns: { id: true, value: true, position: true },
                },
              },
            },
          },
        },
      },
    });
  }

  async findPage(storeId: string, input: ApiListQueryInput) {
    const query = compileApiQuery(ownerProductQuery, input);
    const conditions = [eq(products.storeId, storeId), query.where];
    const hasStatusFilter = Object.keys(input.filter?.status ?? {}).length > 0;
    if (!hasStatusFilter) {
      conditions.push(ne(products.status, ProductStatus.ARCHIVED));
    }
    const rows = await this.db.query.products.findMany({
      columns: query.columns,
      where: and(...conditions),
      orderBy: query.orderBy,
      limit: query.limit + 1,
    });
    return query.createPage(rows);
  }

  async update(storeId: string, productId: string, input: UpdateProductInput) {
    const [updated] = await this.db
      .update(products)
      .set({
        ...input,
        version: sql`${products.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.id, productId),
          ne(products.status, ProductStatus.ARCHIVED),
        ),
      )
      .returning();
    return updated;
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
