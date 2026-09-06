import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  productImages,
  productOptionValues,
  productOptions,
  productVariantOptionValues,
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import { store } from '@/infrastructure/database/schema/app.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { ProductLimitExceededError } from '@/common/errors/product-limit-exceeded.error';
import { ProductLifecycleConflictError } from '@/common/errors/product-lifecycle-conflict.error';
import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import { ProductStatus } from '@/common/enums';
import {
  InventoryPolicy,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import type {
  CreateProductInput,
  IProductsRepository,
  ProductAggregate,
  ProductStatusTransition,
  UpdateProductInput,
} from '../interfaces/repos';
import { ownerProductQuery } from '../queries/owner-product.query';

@Injectable()
export class ProductsRepository implements IProductsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(
    storeId: string,
    input: CreateProductInput,
    productLimit: number,
  ) {
    try {
      const product = await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${storeId}))`,
        );
        const [result] = await tx
          .select({ count: count() })
          .from(products)
          .where(
            and(
              eq(products.storeId, storeId),
              ne(products.status, ProductStatus.ARCHIVED),
            ),
          );
        if (result.count >= productLimit) {
          throw new ProductLimitExceededError(productLimit, result.count);
        }
        const [product] = await tx
          .insert(products)
          .values({ storeId, ...input })
          .returning();
        return product;
      });
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

  async transitionStatus(
    storeId: string,
    productId: string,
    desiredStatus: ProductStatusTransition,
  ) {
    return this.db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
        .for('update');
      if (!product) return undefined;

      const [lockedStore] = await tx
        .select({ status: store.status })
        .from(store)
        .where(eq(store.id, storeId))
        .for('update');
      if (lockedStore?.status !== StoreStatus.ACTIVE) {
        throw new StoreLifecycleConflictError(
          'The Store is no longer active and cannot be modified.',
        );
      }

      if (product.status === ProductStatus.ARCHIVED) {
        throw new ProductLifecycleConflictError(
          'Archived Products cannot change status.',
        );
      }
      if (product.status === desiredStatus) return product;

      if (desiredStatus === ProductStatus.PUBLISHED) {
        await this.assertPublishable(tx, storeId, product);
      }

      const [updated] = await tx
        .update(products)
        .set({
          status: desiredStatus,
          publishedAt:
            desiredStatus === ProductStatus.PUBLISHED ? new Date() : null,
          version: sql`${products.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.id, productId),
            eq(products.status, product.status),
          ),
        )
        .returning();
      if (!updated) {
        throw new ProductLifecycleConflictError(
          'Product status changed during this request.',
        );
      }
      return updated;
    });
  }

  private async assertPublishable(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    product: typeof products.$inferSelect,
  ) {
    if (
      product.name !== product.name.trim() ||
      product.name.length === 0 ||
      product.slug !== product.slug.trim() ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)
    ) {
      throw new ProductLifecycleConflictError(
        'Product identity must be normalized before publishing.',
      );
    }

    const images = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(
        and(
          eq(productImages.storeId, storeId),
          eq(productImages.productId, product.id),
        ),
      )
      .for('update');
    if (images.length === 0) {
      throw new ProductLifecycleConflictError(
        'A Product needs at least one image before publishing.',
      );
    }

    const optionRows = await tx
      .select({ id: productOptions.id, position: productOptions.position })
      .from(productOptions)
      .where(
        and(
          eq(productOptions.storeId, storeId),
          eq(productOptions.productId, product.id),
        ),
      )
      .orderBy(asc(productOptions.position), asc(productOptions.id))
      .for('update');
    const variants = await tx
      .select({
        id: productVariants.id,
        title: productVariants.title,
        optionSignature: productVariants.optionSignature,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, product.id),
          eq(productVariants.status, ProductVariantStatus.ACTIVE),
        ),
      )
      .for('update');
    if (variants.length === 0) {
      throw new ProductLifecycleConflictError(
        'A Product needs at least one active complete Variant before publishing.',
      );
    }

    const selections = await tx
      .select({
        variantId: productVariantOptionValues.variantId,
        optionId: productVariantOptionValues.optionId,
        optionValueId: productVariantOptionValues.optionValueId,
        optionPosition: productOptions.position,
      })
      .from(productVariantOptionValues)
      .innerJoin(
        productOptions,
        and(
          eq(productOptions.id, productVariantOptionValues.optionId),
          eq(productOptions.storeId, storeId),
          eq(productOptions.productId, product.id),
        ),
      )
      .innerJoin(
        productOptionValues,
        and(
          eq(productOptionValues.id, productVariantOptionValues.optionValueId),
          eq(productOptionValues.optionId, productVariantOptionValues.optionId),
          eq(productOptionValues.storeId, storeId),
          eq(productOptionValues.productId, product.id),
        ),
      )
      .where(
        and(
          eq(productVariantOptionValues.storeId, storeId),
          eq(productVariantOptionValues.productId, product.id),
        ),
      );
    const selectionsByVariant = new Map<string, typeof selections>();
    for (const selection of selections) {
      const current = selectionsByVariant.get(selection.variantId) ?? [];
      current.push(selection);
      selectionsByVariant.set(selection.variantId, current);
    }

    const optionIds = new Set(optionRows.map((option) => option.id));
    if (optionRows.length === 0) {
      if (
        variants.length !== 1 ||
        variants[0].optionSignature !== '' ||
        (selectionsByVariant.get(variants[0].id)?.length ?? 0) !== 0
      ) {
        throw new ProductLifecycleConflictError(
          'A Product without options requires exactly one active default Variant.',
        );
      }
    }

    const signatures = new Set<string>();
    for (const variant of variants) {
      this.assertVariantCatalogState(variant);
      const variantSelections = selectionsByVariant.get(variant.id) ?? [];

      if (optionRows.length > 0) {
        const selectedOptionIds = new Set(
          variantSelections.map((selection) => selection.optionId),
        );
        if (
          variantSelections.length !== optionRows.length ||
          selectedOptionIds.size !== optionRows.length ||
          [...optionIds].some((optionId) => !selectedOptionIds.has(optionId))
        ) {
          throw new ProductLifecycleConflictError(
            'Every active Variant must select exactly one value for every Product option.',
          );
        }
        const signature = [...variantSelections]
          .sort((left, right) => left.optionPosition - right.optionPosition)
          .map((selection) => selection.optionValueId)
          .join('|');
        if (!signature || variant.optionSignature !== signature) {
          throw new ProductLifecycleConflictError(
            'Every active Variant must have a valid option signature.',
          );
        }
      }

      if (signatures.has(variant.optionSignature)) {
        throw new ProductLifecycleConflictError(
          'Every active Variant must have a unique option signature.',
        );
      }
      signatures.add(variant.optionSignature);
    }
  }

  private assertVariantCatalogState(variant: {
    title: string;
    price: number;
    compareAtPrice: number | null;
    inventoryPolicy: InventoryPolicy;
    onHand: number | null;
    reserved: number | null;
  }) {
    const validIdentity =
      variant.title === variant.title.trim() && variant.title.length > 0;
    const validPrice =
      Number.isInteger(variant.price) &&
      variant.price > 0 &&
      (variant.compareAtPrice === null ||
        (Number.isInteger(variant.compareAtPrice) &&
          variant.compareAtPrice > variant.price));
    const validInventory =
      variant.inventoryPolicy === InventoryPolicy.TRACKED
        ? variant.onHand !== null &&
          variant.reserved !== null &&
          Number.isInteger(variant.onHand) &&
          Number.isInteger(variant.reserved) &&
          variant.onHand >= 0 &&
          variant.reserved >= 0 &&
          variant.reserved <= variant.onHand
        : variant.inventoryPolicy === InventoryPolicy.UNTRACKED &&
          variant.onHand === null &&
          variant.reserved === null;
    if (!validIdentity || !validPrice || !validInventory) {
      throw new ProductLifecycleConflictError(
        'Every active Variant must have valid identity, price, and inventory state.',
      );
    }
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
