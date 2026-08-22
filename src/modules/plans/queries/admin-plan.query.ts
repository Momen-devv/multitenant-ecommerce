import {
  booleanCodec,
  defineApiQuery,
  enumCodec,
  filter,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from '@/common/api-query';
import { PlanProvisioningStatus } from '@/common/enums';
import { plans } from '@/infrastructure/database/schema/billing.schema';

const provisioningStatusCodec = enumCodec(
  Object.values(PlanProvisioningStatus),
);

export const adminPlanQuery = defineApiQuery({
  resource: 'admin-plans',
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
    stripeProductId: plans.stripeProductId,
    provisioningStatus: plans.provisioningStatus,
    provisioningVersion: plans.provisioningVersion,
    provisioningError: plans.provisioningError,
    isActive: plans.isActive,
    createdAt: plans.createdAt,
    updatedAt: plans.updatedAt,
  },
  sortable: {
    id: { column: plans.id, codec: uuidCodec },
    name: { column: plans.name, codec: stringCodec },
    code: { column: plans.code, codec: stringCodec },
    provisioningStatus: {
      column: plans.provisioningStatus,
      codec: provisioningStatusCodec,
    },
    isActive: { column: plans.isActive, codec: booleanCodec },
    createdAt: { column: plans.createdAt, codec: timestampCodec },
    updatedAt: { column: plans.updatedAt, codec: timestampCodec },
  },
  filters: {
    code: filter(plans.code, stringCodec, ['eq', 'ne', 'in']),
    provisioningStatus: filter(
      plans.provisioningStatus,
      provisioningStatusCodec,
      ['eq', 'ne', 'in'],
    ),
    isActive: filter(plans.isActive, booleanCodec, ['eq', 'ne']),
    createdAt: filter(plans.createdAt, timestampCodec, [
      'gt',
      'gte',
      'lt',
      'lte',
    ]),
    updatedAt: filter(plans.updatedAt, timestampCodec, [
      'gt',
      'gte',
      'lt',
      'lte',
    ]),
  },
  searchable: [plans.name, plans.code],
});
