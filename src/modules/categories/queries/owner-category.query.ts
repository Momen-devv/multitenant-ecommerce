import {
  defineApiQuery,
  enumCodec,
  filter,
  integerCodec,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { CategoryStatus } from '@/common/enums';
import { categories } from '@/infrastructure/database/schema/categories.schema';

const categoryStatusCodec = enumCodec([
  CategoryStatus.DRAFT,
  CategoryStatus.PUBLISHED,
  CategoryStatus.ARCHIVED,
]);

export const ownerCategoryQuery = defineApiQuery({
  resource: 'owner-categories',
  primaryKey: { field: 'id', column: categories.id, codec: uuidCodec },
  defaultSort: [
    { field: 'position', direction: 'asc' },
    { field: 'id', direction: 'asc' },
  ],
  maxSortFields: 2,
  fields: {
    id: categories.id,
    storeId: categories.storeId,
    name: categories.name,
    slug: categories.slug,
    description: categories.description,
    status: categories.status,
    position: categories.position,
    publishedAt: categories.publishedAt,
    archivedAt: categories.archivedAt,
    version: categories.version,
    createdAt: categories.createdAt,
    updatedAt: categories.updatedAt,
  },
  sortable: {
    id: { column: categories.id, codec: uuidCodec },
    name: { column: categories.name, codec: stringCodec },
    position: { column: categories.position, codec: integerCodec },
    createdAt: { column: categories.createdAt, codec: timestampCodec },
    updatedAt: { column: categories.updatedAt, codec: timestampCodec },
  },
  filters: {
    status: filter(categories.status, categoryStatusCodec, ['eq', 'ne', 'in']),
  },
  searchable: [categories.name],
});
