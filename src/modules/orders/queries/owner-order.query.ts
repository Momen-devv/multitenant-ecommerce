import {
  defineApiQuery,
  enumCodec,
  filter,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { OrderStatus } from '@/common/enums';
import { orders } from '@/infrastructure/database/schema/commerce.schema';

const orderStatusCodec = enumCodec([
  OrderStatus.PLACED,
  OrderStatus.FULFILLED,
  OrderStatus.CANCELLED,
]);

export const ownerOrderQuery = defineApiQuery({
  resource: 'owner-orders',
  primaryKey: { field: 'id', column: orders.id, codec: uuidCodec },
  defaultSort: [
    { field: 'placedAt', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  maxSortFields: 2,
  fields: {
    id: orders.id,
    status: orders.status,
    currency: orders.currency,
    total: orders.total,
    placedAt: orders.placedAt,
  },
  sortable: {
    id: { column: orders.id, codec: uuidCodec },
    placedAt: { column: orders.placedAt, codec: timestampCodec },
  },
  filters: {
    status: filter(orders.status, orderStatusCodec, ['eq']),
  },
  searchable: [],
});
