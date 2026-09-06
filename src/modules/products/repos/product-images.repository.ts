import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { ProductStatus } from '@/common/enums';
import { ProductImageGalleryConflictError } from '@/common/errors';
import {
  productImages,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Inject, Injectable } from '@nestjs/common';

const MAX_PRODUCT_IMAGES = 10;

export type CreateProductImageInput = {
  imageKey: string;
  publicUrl: string;
  altText: string | null;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
};

@Injectable()
export class ProductImagesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async productExists(storeId: string, productId: string): Promise<boolean> {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
      .limit(1);
    return Boolean(product);
  }

  async assertProductMutable(storeId: string, productId: string) {
    const [product] = await this.db
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
      .limit(1);
    if (!product) return false;
    this.assertMutable(product.status);
    return true;
  }

  async findMany(storeId: string, productId: string) {
    return this.db
      .select({
        id: productImages.id,
        publicUrl: productImages.publicUrl,
        altText: productImages.altText,
        width: productImages.width,
        height: productImages.height,
        mimeType: productImages.mimeType,
        byteSize: productImages.byteSize,
        position: productImages.position,
      })
      .from(productImages)
      .where(
        and(
          eq(productImages.storeId, storeId),
          eq(productImages.productId, productId),
        ),
      )
      .orderBy(asc(productImages.position), asc(productImages.id));
  }

  async create(
    storeId: string,
    productId: string,
    input: CreateProductImageInput,
  ) {
    return this.inMutableTransaction(storeId, productId, async (tx) => {
      const [{ imageCount, position }] = await tx
        .select({
          imageCount: sql<number>`count(*)::int`,
          position: sql<number>`coalesce(max(${productImages.position}) + 1, 0)::int`,
        })
        .from(productImages)
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
          ),
        );
      this.assertGalleryCapacity(imageCount, 1);
      const [image] = await tx
        .insert(productImages)
        .values({ storeId, productId, position, ...input })
        .returning({
          id: productImages.id,
          publicUrl: productImages.publicUrl,
          altText: productImages.altText,
          width: productImages.width,
          height: productImages.height,
          mimeType: productImages.mimeType,
          byteSize: productImages.byteSize,
          position: productImages.position,
        });
      await this.touchProduct(tx, productId);
      return image;
    });
  }

  async createMany(
    storeId: string,
    productId: string,
    inputs: CreateProductImageInput[],
  ) {
    return this.inMutableTransaction(storeId, productId, async (tx) => {
      const [{ imageCount, nextPosition }] = await tx
        .select({
          imageCount: sql<number>`count(*)::int`,
          nextPosition: sql<number>`coalesce(max(${productImages.position}) + 1, 0)::int`,
        })
        .from(productImages)
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
          ),
        );
      this.assertGalleryCapacity(imageCount, inputs.length);
      const created = await tx
        .insert(productImages)
        .values(
          inputs.map((input, index) => ({
            storeId,
            productId,
            position: nextPosition + index,
            ...input,
          })),
        )
        .returning({
          id: productImages.id,
          publicUrl: productImages.publicUrl,
          altText: productImages.altText,
          width: productImages.width,
          height: productImages.height,
          mimeType: productImages.mimeType,
          byteSize: productImages.byteSize,
          position: productImages.position,
        });
      await this.touchProduct(tx, productId);
      return created;
    });
  }

  async updateAltText(
    storeId: string,
    productId: string,
    imageId: string,
    altText: string | null,
  ): Promise<boolean | undefined> {
    return this.inMutableTransaction(storeId, productId, async (tx) => {
      const [image] = await tx
        .update(productImages)
        .set({ altText, updatedAt: new Date() })
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
            eq(productImages.id, imageId),
          ),
        )
        .returning({ id: productImages.id });
      if (!image) return false;
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  async reorder(
    storeId: string,
    productId: string,
    imageIds: string[],
  ): Promise<boolean | undefined> {
    return this.inMutableTransaction(storeId, productId, async (tx) => {
      const current = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
          ),
        );
      this.assertExactIds(
        current.map((image) => image.id),
        imageIds,
      );

      await tx
        .update(productImages)
        .set({ position: sql`${productImages.position} + 1000000` })
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
          ),
        );
      if (imageIds.length > 0) {
        const ordering = imageIds.map(
          (id, position) => sql`(${id}::uuid, ${position}::integer)`,
        );
        await tx.execute(sql`
          update ${productImages}
          set position = ordering.position
          from (values ${sql.join(ordering, sql`, `)}) as ordering(id, position)
          where ${productImages.id} = ordering.id
        `);
      }
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  async delete(
    storeId: string,
    productId: string,
    imageId: string,
  ): Promise<{ imageKey: string } | false | undefined> {
    return this.inMutableTransaction(storeId, productId, async (tx) => {
      const [image] = await tx
        .select({
          id: productImages.id,
          imageKey: productImages.imageKey,
          position: productImages.position,
        })
        .from(productImages)
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
            eq(productImages.id, imageId),
          ),
        )
        .for('update');
      if (!image) return false;

      await tx.delete(productImages).where(eq(productImages.id, imageId));
      await this.closePositionGap(tx, storeId, productId, image.position);
      await this.touchProduct(tx, productId);
      return { imageKey: image.imageKey };
    });
  }

  async deleteMany(
    storeId: string,
    productId: string,
    imageIds: string[],
  ): Promise<{ imageKeys: string[] } | false | undefined> {
    return this.inMutableTransaction(storeId, productId, async (tx) => {
      const selected = await tx
        .select({ id: productImages.id, imageKey: productImages.imageKey })
        .from(productImages)
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
            inArray(productImages.id, imageIds),
          ),
        )
        .for('update');

      if (selected.length !== imageIds.length) return false;

      await tx
        .delete(productImages)
        .where(
          and(
            eq(productImages.storeId, storeId),
            eq(productImages.productId, productId),
            inArray(productImages.id, imageIds),
          ),
        );
      await this.normalizePositions(tx, storeId, productId);
      await this.touchProduct(tx, productId);
      return { imageKeys: selected.map((image) => image.imageKey) };
    });
  }

  private async inMutableTransaction<Result>(
    storeId: string,
    productId: string,
    operation: (tx: NodePgDatabase<typeof schema>) => Promise<Result>,
  ): Promise<Result | undefined> {
    return this.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, status: products.status })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
        .for('update');
      if (!product) return undefined;
      this.assertMutable(product.status);
      return operation(tx);
    });
  }

  private assertMutable(status: ProductStatus) {
    if (status === ProductStatus.ARCHIVED) {
      throw new ProductImageGalleryConflictError(
        'Archived Products cannot have their image gallery changed.',
      );
    }
  }

  private async closePositionGap(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
    deletedPosition: number,
  ) {
    const scope = and(
      eq(productImages.storeId, storeId),
      eq(productImages.productId, productId),
      gt(productImages.position, deletedPosition),
    );
    await tx
      .update(productImages)
      .set({ position: sql`${productImages.position} + 1000000` })
      .where(scope);
    await tx
      .update(productImages)
      .set({ position: sql`${productImages.position} - 1000001` })
      .where(
        and(
          eq(productImages.storeId, storeId),
          eq(productImages.productId, productId),
          gt(productImages.position, 999999),
        ),
      );
  }

  private async normalizePositions(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
  ) {
    const remaining = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(
        and(
          eq(productImages.storeId, storeId),
          eq(productImages.productId, productId),
        ),
      )
      .orderBy(asc(productImages.position), asc(productImages.id));
    if (remaining.length === 0) return;

    await tx
      .update(productImages)
      .set({ position: sql`${productImages.position} + 1000000` })
      .where(
        and(
          eq(productImages.storeId, storeId),
          eq(productImages.productId, productId),
        ),
      );
    const ordering = remaining.map(
      ({ id }, position) => sql`(${id}::uuid, ${position}::integer)`,
    );
    await tx.execute(sql`
      update ${productImages}
      set position = ordering.position
      from (values ${sql.join(ordering, sql`, `)}) as ordering(id, position)
      where ${productImages.id} = ordering.id
    `);
  }

  private async touchProduct(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
  ) {
    await tx
      .update(products)
      .set({
        version: sql`${products.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
  }

  private assertExactIds(currentIds: string[], requestedIds: string[]) {
    if (
      currentIds.length !== requestedIds.length ||
      new Set(requestedIds).size !== requestedIds.length ||
      currentIds.some((id) => !requestedIds.includes(id))
    ) {
      throw new ProductImageGalleryConflictError(
        'The order must contain every current image exactly once.',
      );
    }
  }

  private assertGalleryCapacity(imageCount: number, adding: number) {
    if (imageCount + adding > MAX_PRODUCT_IMAGES) {
      throw new ProductImageGalleryConflictError(
        `A Product gallery can contain at most ${MAX_PRODUCT_IMAGES} images.`,
      );
    }
  }
}
