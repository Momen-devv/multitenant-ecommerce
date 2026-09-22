export const ORDER_EMAIL_TYPES = [
  'placed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

export type OrderEmailType = (typeof ORDER_EMAIL_TYPES)[number];

/** Immutable description of the transition that caused a shopper email. */
export type OrderEmailIntent = {
  type: OrderEmailType;
  orderId: string;
  version: number;
  to: string;
  recipientName: string;
  total: number;
  currency: string;
  reason: string | null;
};

/** Accept intents written before recipient details were added without querying
 * the mutable Order record. */
export function parseOrderEmailIntent(value: unknown): OrderEmailIntent | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.orderId === 'string' &&
    typeof input.version === 'number' &&
    typeof input.to === 'string' &&
    typeof input.total === 'number' &&
    typeof input.currency === 'string' &&
    typeof input.type === 'string' &&
    (ORDER_EMAIL_TYPES as readonly string[]).includes(input.type)
  ) {
    return {
      type: input.type as OrderEmailType,
      orderId: input.orderId,
      version: input.version,
      to: input.to,
      recipientName:
        typeof input.recipientName === 'string' ? input.recipientName : 'there',
      total: input.total,
      currency: input.currency,
      reason: typeof input.reason === 'string' ? input.reason : null,
    };
  }
  return null;
}
