import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { ProductStatus, StoreStatus } from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import { generateUUIDv7 } from '@/common/utils';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  commentCreateRequests,
  productComments,
  products,
  store,
} from '@/infrastructure/database/schema/schema';
import { publicCommentQuery } from '../queries/public-comment.query';
import type { ICommentsRepository } from '../interfaces/repos';

@Injectable()
export class CommentsRepository implements ICommentsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async publishedProductById(productId: string) {
    const [row] = await this.db
      .select({ id: products.id, storeId: products.storeId })
      .from(products)
      .innerJoin(store, eq(store.id, products.storeId))
      .where(
        and(
          eq(products.id, productId),
          eq(products.status, ProductStatus.PUBLISHED),
          eq(store.status, StoreStatus.ACTIVE),
        ),
      )
      .limit(1);
    return row;
  }

  async list(storeSlug: string, productSlug: string, input: ApiListQueryInput) {
    const query = compileApiQuery(publicCommentQuery, input);
    return this.db.transaction(
      async (tx) => {
        const [product] = await tx
          .select({ id: products.id })
          .from(products)
          .innerJoin(store, eq(store.id, products.storeId))
          .where(
            and(
              eq(store.slug, storeSlug),
              eq(store.status, StoreStatus.ACTIVE),
              eq(products.slug, productSlug),
              eq(products.status, ProductStatus.PUBLISHED),
            ),
          )
          .limit(1);
        if (!product) return undefined;
        const rows = await tx.query.productComments.findMany({
          columns: { ...query.columns, id: true },
          extras: query.extras,
          where: and(eq(productComments.productId, product.id), query.where),
          orderBy: query.orderBy,
          limit: query.limit + 1,
        });
        return query.createPage(rows);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async find(commentId: string, productId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(productComments)
      .where(
        and(
          eq(productComments.id, commentId),
          eq(productComments.productId, productId),
          eq(productComments.userId, userId),
        ),
      )
      .limit(1);
    return row;
  }

  async findCreateRequest(userId: string, idempotencyKey: string) {
    const [row] = await this.db
      .select({
        requestHash: commentCreateRequests.requestHash,
        response: commentCreateRequests.response,
      })
      .from(commentCreateRequests)
      .where(
        and(
          eq(commentCreateRequests.userId, userId),
          eq(commentCreateRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row;
  }

  async create(
    productId: string,
    userId: string,
    content: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const response = {
        id: generateUUIDv7(),
        productId,
        userId,
        content,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      const [claimed] = await tx
        .insert(commentCreateRequests)
        .values({ userId, idempotencyKey, requestHash, response })
        .onConflictDoNothing({
          target: [
            commentCreateRequests.userId,
            commentCreateRequests.idempotencyKey,
          ],
        })
        .returning({ userId: commentCreateRequests.userId });
      if (!claimed) {
        const [existing] = await tx
          .select({
            requestHash: commentCreateRequests.requestHash,
            response: commentCreateRequests.response,
          })
          .from(commentCreateRequests)
          .where(
            and(
              eq(commentCreateRequests.userId, userId),
              eq(commentCreateRequests.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (!existing || existing.requestHash !== requestHash) {
          throw new ConflictException(
            'This Idempotency-Key was already used with a different request.',
          );
        }
        return existing.response;
      }

      const [product] = await tx
        .select({ storeId: products.storeId })
        .from(products)
        .innerJoin(store, eq(store.id, products.storeId))
        .where(
          and(
            eq(products.id, productId),
            eq(products.status, ProductStatus.PUBLISHED),
            eq(store.status, StoreStatus.ACTIVE),
          ),
        )
        .limit(1)
        .for('share');
      if (!product) throw new NotFoundException('Published product not found.');

      const [comment] = await tx
        .insert(productComments)
        .values({
          id: response.id,
          storeId: product.storeId,
          productId,
          userId,
          content,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [productComments.productId, productComments.userId],
        })
        .returning({ id: productComments.id });
      if (!comment)
        throw new ConflictException('You already commented on this product.');
      return response;
    });
  }

  async update(
    commentId: string,
    productId: string,
    userId: string,
    content: string,
    version: number,
  ) {
    const [row] = await this.db
      .update(productComments)
      .set({
        content,
        version: sql`${productComments.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productComments.id, commentId),
          eq(productComments.productId, productId),
          eq(productComments.userId, userId),
          eq(productComments.version, version),
        ),
      )
      .returning({
        id: productComments.id,
        productId: productComments.productId,
        userId: productComments.userId,
        content: productComments.content,
        createdAt: productComments.createdAt,
        updatedAt: productComments.updatedAt,
      });
    return (
      row && {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    );
  }

  async deleteOwn(commentId: string, productId: string, userId: string) {
    const [row] = await this.db
      .delete(productComments)
      .where(
        and(
          eq(productComments.id, commentId),
          eq(productComments.productId, productId),
          eq(productComments.userId, userId),
        ),
      )
      .returning({ id: productComments.id });
    return row;
  }
}
