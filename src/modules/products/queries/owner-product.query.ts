import {
  defineApiQuery,
  enumCodec,
  filter,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { products } from '@/infrastructure/database/schema/products.schema';
import { ProductStatus } from '@/common/enums';

const productStatusCodec = enumCodec([
  ProductStatus.DRAFT,
  ProductStatus.PUBLISHED,
  ProductStatus.ARCHIVED,
]);

export const ownerProductQuery = defineApiQuery({
  resource: 'owner-products',
  primaryKey: { field: 'id', column: products.id, codec: uuidCodec },
  defaultSort: [
    { field: 'createdAt', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  maxSortFields: 2,
  fields: {
    id: products.id,
    name: products.name,
    slug: products.slug,
    description: products.description,
    status: products.status,
    version: products.version,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  },
  sortable: {
    id: { column: products.id, codec: uuidCodec },
    name: { column: products.name, codec: stringCodec },
    createdAt: { column: products.createdAt, codec: timestampCodec },
    updatedAt: { column: products.updatedAt, codec: timestampCodec },
  },
  filters: {
    status: filter(products.status, productStatusCodec, ['eq', 'ne', 'in']),
  },
  searchable: [products.name],
});
