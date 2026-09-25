import {
  defineApiQuery,
  enumCodec,
  filter,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { orders } from '@/infrastructure/database/schema/orders.schema';
import { ORDER_PAYMENT_METHODS, ORDER_STATUSES } from '../dto';

export const userOrderQuery = defineApiQuery({
  resource: 'user-orders',
  primaryKey: { field: 'id', column: orders.id, codec: uuidCodec },
  defaultSort: [
    { field: 'createdAt', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  fields: {
    id: orders.id,
    storeId: orders.storeId,
    status: orders.status,
    paymentMethod: orders.paymentMethod,
    paymentStatus: orders.paymentStatus,
    currency: orders.currency,
    total: orders.total,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
  },
  sortable: {
    createdAt: { column: orders.createdAt, codec: timestampCodec },
    id: { column: orders.id, codec: uuidCodec },
  },
  filters: {
    storeId: filter(orders.storeId, uuidCodec, ['eq']),
    status: filter(orders.status, enumCodec(ORDER_STATUSES), ['eq']),
    paymentMethod: filter(
      orders.paymentMethod,
      enumCodec(ORDER_PAYMENT_METHODS),
      ['eq'],
    ),
  },
  searchable: [],
});
