import type { OrganizationOptions } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { confirmInvitationCapture } from '@/modules/notifications/services/invitation-notification-capture';

export function createInvitationNotificationHooks(
  database: NodePgDatabase<typeof schema>,
) {
  const capture = ({ invitation }: { invitation: { id: string } }) =>
    confirmInvitationCapture(database, invitation.id);
  return {
    organizationHooks: {
      afterCreateInvitation: capture,
      afterAcceptInvitation: capture,
      afterRejectInvitation: capture,
      afterCancelInvitation: capture,
    },
    sendInvitationEmail: ({ id }) => confirmInvitationCapture(database, id),
  } satisfies Pick<
    OrganizationOptions,
    'organizationHooks' | 'sendInvitationEmail'
  >;
}
