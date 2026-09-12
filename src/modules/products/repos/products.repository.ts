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
import {
  categories,
  productCategories,
} from '@/infrastructure/database/schema/categories.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { ProductLimitExceededError } from '@/common/errors/product-limit-exceeded.error';
import { ProductLifecycleConflictError } from '@/common/errors/product-lifecycle-conflict.error';
import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import {
  CategoryStatus,
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { CategoryAssignmentNotFoundError } from '@/common/errors';
import { findCategorySummariesByProduct } from '@/modules/categories/repos/category-membership.reader';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import type {
  CreateProductInput,
  CreateProductSetupInput,
  IProductsRepository,
  ProductAggregate,
  ProductStatusTransition,
  UpdateProductInput,
} from '../interfaces/repos';
import { ownerProductQuery } from '../queries/owner-product.query';
import {
  deriveVariantPresentation,
  generateVariantIdentifiers,
} from '../domain/variant-catalog';
import {
  MAX_CATEGORIES_PER_PRODUCT,
  MAX_ACTIVE_PRODUCT_VARIANTS,
  MAX_PRODUCT_OPTIONS,
  MAX_PRODUCT_OPTION_VALUES,
} from '../domain/product-catalog-limits';

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
        await this.assertProductLimit(tx, storeId, productLimit);
        await this.assertAssignableCategories(tx, storeId, input.categoryIds);
        const product = await this.insertProduct(tx, storeId, input);
        await this.insertCategoryMemberships(
          tx,
          storeId,
          product.id,
          input.categoryIds,
        );
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

  async createSetup(
    storeId: string,
    input: CreateProductSetupInput,
    productLimit: number,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        await this.assertProductLimit(tx, storeId, productLimit);
        this.assertSetupInput(input);
        await this.assertAssignableCategories(tx, storeId, input.categoryIds);
        const product = await this.insertProduct(tx, storeId, input);
        await this.insertCategoryMemberships(
          tx,
          storeId,
          product.id,
          input.categoryIds,
        );

        const optionClientKeys = new Set<string>();
        const valueByKey = new Map<
          string,
          {
            id: string;
            optionId: string;
            optionPosition: number;
            value: string;
          }
        >();
        for (const [optionPosition, optionInput] of input.options.entries()) {
          const [option] = await tx
            .insert(productOptions)
            .values({
              storeId,
              productId: product.id,
              name: optionInput.name,
              position: optionPosition,
            })
            .returning({ id: productOptions.id });
          optionClientKeys.add(optionInput.clientKey);

          const values = await tx
            .insert(productOptionValues)
            .values(
              optionInput.values.map((valueInput, position) => ({
                storeId,
                productId: product.id,
                optionId: option.id,
                value: valueInput.value,
                position,
              })),
            )
            .returning({
              id: productOptionValues.id,
              value: productOptionValues.value,
            });
          for (const [
            valuePosition,
            valueInput,
          ] of optionInput.values.entries()) {
            const value = values[valuePosition];
            valueByKey.set(valueInput.clientKey, {
              id: value.id,
              optionId: option.id,
              optionPosition,
              value: value.value,
            });
          }
        }

        for (const variantInput of input.variants) {
          const selectedValues = variantInput.optionValueClientKeys.map((key) =>
            valueByKey.get(key),
          );
          if (
            selectedValues.some((value) => !value) ||
            new Set(selectedValues.map((value) => value?.optionId)).size !==
              optionClientKeys.size
          ) {
            throw new ProductLifecycleConflictError(
              'Every Variant must select one value from every Product option.',
            );
          }
          const selections = selectedValues
            .filter((value): value is NonNullable<typeof value> =>
              Boolean(value),
            )
            .sort((left, right) => left.optionPosition - right.optionPosition);
          const { optionSignature, title } = deriveVariantPresentation(
            selections.map((value) => ({
              optionValueId: value.id,
              value: value.value,
            })),
          );
          const [variant] = await tx
            .insert(productVariants)
            .values({
              storeId,
              productId: product.id,
              title,
              optionSignature,
              ...generateVariantIdentifiers(),
              price: variantInput.price,
              compareAtPrice: variantInput.compareAtPrice,
              weightGrams: variantInput.weightGrams,
              status: ProductVariantStatus.ACTIVE,
              inventoryPolicy: variantInput.inventoryPolicy,
              onHand: variantInput.onHand,
              reserved:
                variantInput.inventoryPolicy === InventoryPolicy.TRACKED
                  ? 0
                  : null,
            })
            .returning({ id: productVariants.id });
          if (selections.length > 0) {
            await tx.insert(productVariantOptionValues).values(
              selections.map((value) => ({
                storeId,
                productId: product.id,
                variantId: variant.id,
                optionId: value.optionId,
                optionValueId: value.id,
              })),
            );
          }
        }
        const aggregate = await this.findOneWith(tx, storeId, product.id);
        if (!aggregate) {
          throw new ProductLifecycleConflictError(
            'Product setup could not be read after creation.',
          );
        }
        return aggregate;
      });
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
    return this.findOneWith(this.db, storeId, productId);
  }

  private async findOneWith(
    db: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
  ): Promise<ProductAggregate | undefined> {
    const product = await db.query.products.findFirst({
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
    if (!product) return undefined;
    const categoryRows = await findCategorySummariesByProduct(
      db,
      storeId,
      [product.id],
      'all',
    );
    return { ...product, categories: categoryRows.get(product.id) ?? [] };
  }

  async findPage(storeId: string, input: ApiListQueryInput) {
    const query = compileApiQuery(ownerProductQuery, input);
    const conditions = [eq(products.storeId, storeId), query.where];
    const hasStatusFilter = Object.keys(input.filter?.status ?? {}).length > 0;
    if (!hasStatusFilter) {
      conditions.push(ne(products.status, ProductStatus.ARCHIVED));
    }
    const rows = await this.db.query.products.findMany({
      columns: { ...query.columns, id: true },
      where: and(...conditions),
      orderBy: query.orderBy,
      limit: query.limit + 1,
    });
    const categoryRows = await findCategorySummariesByProduct(
      this.db,
      storeId,
      rows.map((item) => item.id),
      'non-archived',
    );
    return query.createPage(rows, (item) => ({
      categories: categoryRows.get(item.id) ?? [],
    }));
  }

  async replaceCategories(
    storeId: string,
    productId: string,
    categoryIds: string[],
    expectedVersion: number,
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
        throw new StoreLifecycleConflictError();
      }
      if (product.status === ProductStatus.ARCHIVED) {
        throw new ProductLifecycleConflictError(
          'Archived Products cannot change Categories.',
        );
      }
      if (product.version !== expectedVersion) {
        throw new ProductLifecycleConflictError(
          'Product changed during this request.',
        );
      }
      await this.assertAssignableCategories(tx, storeId, categoryIds);
      const currentNonArchivedMemberships = await tx
        .select({ categoryId: productCategories.categoryId })
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
            eq(productCategories.storeId, storeId),
            eq(productCategories.productId, productId),
            ne(categories.status, CategoryStatus.ARCHIVED),
          ),
        );
      if (currentNonArchivedMemberships.length > 0) {
        await tx.delete(productCategories).where(
          and(
            eq(productCategories.storeId, storeId),
            eq(productCategories.productId, productId),
            inArray(
              productCategories.categoryId,
              currentNonArchivedMemberships.map((row) => row.categoryId),
            ),
          ),
        );
      }
      await this.insertCategoryMemberships(tx, storeId, productId, categoryIds);
      const [updated] = await tx
        .update(products)
        .set({ version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.id, productId),
            eq(products.version, expectedVersion),
          ),
        )
        .returning({ id: products.id });
      if (!updated) {
        throw new ProductLifecycleConflictError(
          'Product changed during this request.',
        );
      }
      return this.findOneWith(tx, storeId, productId);
    });
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

  async archive(storeId: string, productId: string) {
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

      if (product.status === ProductStatus.ARCHIVED) return product;

      const archivedAt = new Date();
      const [archivedProduct] = await tx
        .update(products)
        .set({
          status: ProductStatus.ARCHIVED,
          archivedAt,
          version: sql`${products.version} + 1`,
          updatedAt: archivedAt,
        })
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.id, productId),
            eq(products.status, product.status),
          ),
        )
        .returning();
      if (!archivedProduct) {
        throw new ProductLifecycleConflictError(
          'Product status changed during this request.',
        );
      }

      await tx
        .update(productVariants)
        .set({
          status: ProductVariantStatus.ARCHIVED,
          archivedAt,
          version: sql`${productVariants.version} + 1`,
          updatedAt: archivedAt,
        })
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.productId, productId),
            eq(productVariants.status, ProductVariantStatus.ACTIVE),
          ),
        );

      return archivedProduct;
    });
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

  private assertSetupInput(input: CreateProductSetupInput) {
    if (input.options.length > MAX_PRODUCT_OPTIONS) {
      throw new ProductLifecycleConflictError(
        `A Product can have at most ${MAX_PRODUCT_OPTIONS} options.`,
      );
    }
    if (input.variants.length > MAX_ACTIVE_PRODUCT_VARIANTS) {
      throw new ProductLifecycleConflictError(
        `A Product can have at most ${MAX_ACTIVE_PRODUCT_VARIANTS} active Variants.`,
      );
    }

    const optionKeys = new Set<string>();
    const valueKeys = new Set<string>();
    const optionNames = new Set<string>();
    for (const option of input.options) {
      if (option.values.length > MAX_PRODUCT_OPTION_VALUES) {
        throw new ProductLifecycleConflictError(
          `A Product option can have at most ${MAX_PRODUCT_OPTION_VALUES} values.`,
        );
      }
      if (
        optionKeys.has(option.clientKey) ||
        optionNames.has(option.name.toLowerCase())
      ) {
        throw new ProductLifecycleConflictError(
          'Product option keys and names must be unique.',
        );
      }
      optionKeys.add(option.clientKey);
      optionNames.add(option.name.toLowerCase());
      const values = new Set<string>();
      for (const value of option.values) {
        if (
          valueKeys.has(value.clientKey) ||
          values.has(value.value.toLowerCase())
        ) {
          throw new ProductLifecycleConflictError(
            'Product option value keys and values must be unique.',
          );
        }
        valueKeys.add(value.clientKey);
        values.add(value.value.toLowerCase());
      }
    }

    const expectedSelections = input.options.length;
    const variantSignatures = new Set<string>();
    if (expectedSelections === 0 && input.variants.length !== 1) {
      throw new ProductLifecycleConflictError(
        'A Product without options requires exactly one default Variant.',
      );
    }
    for (const variant of input.variants) {
      if (
        variant.optionValueClientKeys.length !== expectedSelections ||
        new Set(variant.optionValueClientKeys).size !==
          variant.optionValueClientKeys.length
      ) {
        throw new ProductLifecycleConflictError(
          'Every Variant must select one value from every Product option.',
        );
      }
      const signature = [...variant.optionValueClientKeys].sort().join('|');
      if (variantSignatures.has(signature)) {
        throw new ProductLifecycleConflictError(
          'Every Variant must have a unique option selection.',
        );
      }
      variantSignatures.add(signature);
    }
  }

  private async assertProductLimit(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productLimit: number,
  ) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${storeId}))`);
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
  }

  private async insertProduct(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    input: CreateProductInput,
  ) {
    const [product] = await tx
      .insert(products)
      .values({
        storeId,
        name: input.name,
        slug: input.slug,
        description: input.description,
      })
      .returning();
    return product;
  }

  private async assertAssignableCategories(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    categoryIds: string[],
  ) {
    if (categoryIds.length > MAX_CATEGORIES_PER_PRODUCT) {
      throw new ProductLifecycleConflictError(
        `A Product can belong to at most ${MAX_CATEGORIES_PER_PRODUCT} Categories.`,
      );
    }
    if (categoryIds.length === 0) return;
    const rows = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.storeId, storeId),
          inArray(categories.id, categoryIds),
          ne(categories.status, CategoryStatus.ARCHIVED),
        ),
      )
      .for('update');
    if (rows.length !== new Set(categoryIds).size) {
      throw new CategoryAssignmentNotFoundError();
    }
  }

  private async insertCategoryMemberships(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
    categoryIds: string[],
  ) {
    if (categoryIds.length === 0) return;
    await tx
      .insert(productCategories)
      .values(
        categoryIds.map((categoryId) => ({ storeId, productId, categoryId })),
      );
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
