import {
  defineApiQuery,
  filter,
  stringCodec,
  uuidCodec,
} from '@/common/api-query';
import { plans } from '@/infrastructure/database/schema/billing.schema';

export const publicPlanQuery = defineApiQuery({
  resource: 'public-plans',
  primaryKey: { field: 'id', column: plans.id, codec: uuidCodec },
  defaultSort: [{ field: 'id', direction: 'desc' }],
  maxSortFields: 3,
  fields: {
    id: plans.id,
    name: plans.name,
    code: plans.code,
    description: plans.description,
    features: plans.features,
    limits: plans.limits,
  },
  sortable: {
    id: { column: plans.id, codec: uuidCodec },
    name: { column: plans.name, codec: stringCodec },
    code: { column: plans.code, codec: stringCodec },
  },
  filters: {
    id: filter(plans.id, uuidCodec, ['eq', 'ne', 'in']),
    name: filter(plans.name, stringCodec, ['eq', 'ne']),
    code: filter(plans.code, stringCodec, ['eq', 'ne', 'in']),
  },
  searchable: [plans.name, plans.code],
});
