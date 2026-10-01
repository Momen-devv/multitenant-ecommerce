export const notificationCatalog = {
  'order.placed': { customer: true, staff: false },
  'order.shipped': { customer: false, staff: false },
  'order.delivered': { customer: false, staff: false },
  'order.cancelled': { customer: true, staff: false },
  'order.refunded': { customer: true, staff: false },
  'invitation.created': { invitee: true },
  'invitation.reminder': { invitee: false },
  'invitation.accepted': { inviter: false },
  'invitation.rejected': { inviter: false },
  'invitation.expired': { inviter: false },
  'invitation.cancelled': { inviter: false, invitee: false },
  'order.intervention_required': { admin: false },
  'notification.delivery_failed': { admin: false },
  'user.registered': { user: false },
  'store.created': { storeOwner: false },
  'subscription.activated': { storeOwner: true },
} as const;

export type NotificationEventType = keyof typeof notificationCatalog;
export type NotificationAudience =
  | 'user'
  | 'customer'
  | 'staff'
  | 'storeOwner'
  | 'invitee'
  | 'inviter'
  | 'admin';

export function notificationPolicy(
  event: NotificationEventType,
  audience: NotificationAudience,
) {
  const entry = notificationCatalog[event] as Partial<
    Record<NotificationAudience, boolean>
  >;
  const mandatory = entry?.[audience];
  if (mandatory === undefined) throw new Error('Unsupported notification key');
  return {
    mandatory,
    emailEnabled: true,
    storeScoped: audience !== 'admin' && audience !== 'user',
  };
}

export function resolveNotificationEmail(
  event: NotificationEventType,
  audience: NotificationAudience,
  overrides: { store?: boolean | null; global?: boolean | null } = {},
) {
  const policy = notificationPolicy(event, audience);
  return (
    policy.mandatory ||
    ((policy.storeScoped ? overrides.store : undefined) ??
      overrides.global ??
      policy.emailEnabled)
  );
}

export function validatePreference(
  event: NotificationEventType,
  audience: NotificationAudience,
  storeId: string | null,
  enabled: boolean | null,
) {
  const policy = notificationPolicy(event, audience);
  if (storeId && !policy.storeScoped)
    throw new Error('This key only supports global preferences');
  if (policy.mandatory && enabled === false)
    throw new Error('Mandatory email cannot be disabled');
}
