import {
  defineApiQuery,
  enumCodec,
  filter,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { store } from '@/infrastructure/database/schema/app.schema';
import { STORE_STATUSES } from '../domain/store-status';

const storeStatusCodec = enumCodec(STORE_STATUSES);

export const platformStoreQuery = defineApiQuery({
  resource: 'platform-stores',
  primaryKey: { field: 'id', column: store.id, codec: uuidCodec },
  defaultSort: [{ field: 'id', direction: 'desc' }],
  maxSortFields: 3,
  fields: {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    logo: store.logo,
    status: store.status,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  },
  sortable: {
    id: { column: store.id, codec: uuidCodec },
    name: { column: store.name, codec: stringCodec },
    slug: { column: store.slug, codec: stringCodec },
    status: { column: store.status, codec: storeStatusCodec },
    createdAt: { column: store.createdAt, codec: timestampCodec },
    updatedAt: { column: store.updatedAt, codec: timestampCodec },
  },
  filters: {
    name: filter(store.name, stringCodec, ['eq', 'ne']),
    slug: filter(store.slug, stringCodec, ['eq', 'ne', 'in']),
    status: filter(store.status, storeStatusCodec, ['eq', 'ne', 'in']),
    createdAt: filter(store.createdAt, timestampCodec, [
      'gt',
      'gte',
      'lt',
      'lte',
    ]),
    updatedAt: filter(store.updatedAt, timestampCodec, [
      'gt',
      'gte',
      'lt',
      'lte',
    ]),
  },
  searchable: [store.name, store.slug],
});
