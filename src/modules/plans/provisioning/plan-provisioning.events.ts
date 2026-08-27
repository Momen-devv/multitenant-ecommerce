import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';
import { z } from 'zod';

const planProvisioningRequestedPayloadSchema = z.object({
  planId: z.uuid(),
  provisioningVersion: z.number().int().positive(),
});

export const PLAN_PROVISIONING_REQUESTED_EVENT =
  OutboxEventType.PLAN_PROVISIONING_REQUESTED;

export type PlanProvisioningRequestedPayload = z.infer<
  typeof planProvisioningRequestedPayloadSchema
>;

export function parsePlanProvisioningRequestedPayload(
  payload: unknown,
  aggregateId: string,
): PlanProvisioningRequestedPayload {
  const parsed = planProvisioningRequestedPayloadSchema.parse(payload);

  if (parsed.planId !== aggregateId) {
    throw new Error('Plan provisioning event aggregate does not match payload');
  }

  return parsed;
}
