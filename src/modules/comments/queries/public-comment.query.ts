import {
  defineApiQuery,
  filter,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { productComments } from '@/infrastructure/database/schema/comments.schema';

export const publicCommentQuery = defineApiQuery({
  resource: 'public-product-comments',
  primaryKey: { field: 'id', column: productComments.id, codec: uuidCodec },
  defaultSort: [
    { field: 'createdAt', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  maxSortFields: 2,
  fields: {
    id: productComments.id,
    productId: productComments.productId,
    userId: productComments.userId,
    content: productComments.content,
    createdAt: productComments.createdAt,
    updatedAt: productComments.updatedAt,
  },
  sortable: {
    id: { column: productComments.id, codec: uuidCodec },
    createdAt: { column: productComments.createdAt, codec: timestampCodec },
  },
  filters: {
    userId: filter(productComments.userId, stringCodec, ['eq']),
  },
  searchable: [],
});
