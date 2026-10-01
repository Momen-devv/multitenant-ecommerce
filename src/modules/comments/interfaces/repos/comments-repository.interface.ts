import type { ApiListQueryInput, CursorPage } from '@/common/api-query';
import type { ProductComment } from '@/infrastructure/database/schema/schema.types';
import type { CommentCreateResponse } from '@/infrastructure/database/schema/comments.schema';

export interface ICommentsRepository {
  list(
    storeSlug: string,
    productSlug: string,
    query: ApiListQueryInput,
  ): Promise<CursorPage<Record<string, unknown>> | undefined>;
  publishedProductById(
    productId: string,
  ): Promise<{ id: string; storeId: string } | undefined>;
  find(
    commentId: string,
    productId: string,
    userId: string,
  ): Promise<ProductComment | undefined>;
  findCreateRequest(
    userId: string,
    idempotencyKey: string,
  ): Promise<
    { requestHash: string; response: CommentCreateResponse } | undefined
  >;
  create(
    productId: string,
    userId: string,
    content: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CommentCreateResponse>;
  update(
    commentId: string,
    productId: string,
    userId: string,
    content: string,
    version: number,
  ): Promise<CommentCreateResponse | undefined>;
  deleteOwn(
    commentId: string,
    productId: string,
    userId: string,
  ): Promise<{ id: string } | undefined>;
}
