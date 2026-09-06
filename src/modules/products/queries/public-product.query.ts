import {
  defineApiQuery,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { products } from '@/infrastructure/database/schema/products.schema';

/**
 * Fields deliberately safe to expose from a storefront product listing.
 * Product lifecycle, tenant, and optimistic-concurrency fields stay private.
 */
export const publicProductQuery = defineApiQuery({
  resource: 'public-products',
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
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  },
  sortable: {
    id: { column: products.id, codec: uuidCodec },
    name: { column: products.name, codec: stringCodec },
    createdAt: { column: products.createdAt, codec: timestampCodec },
    updatedAt: { column: products.updatedAt, codec: timestampCodec },
  },
  filters: {},
  searchable: [products.name],
});
