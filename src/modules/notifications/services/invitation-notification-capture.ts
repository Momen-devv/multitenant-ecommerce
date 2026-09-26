import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';

/** Triggers commit capture; callbacks merely assert that the migration is active.
 * They never create a second email or decide recipients. Polling owns recovery.
 */
export async function confirmInvitationCapture(
  db: NodePgDatabase<typeof schema>,
  invitationId: string,
) {
  if (!invitationId) throw new Error('Invitation capture requires an ID');
  // Read catalog, not the uncommitted lifecycle row on a different connection.
  const result = await db.execute(sql`select 1 from pg_trigger where
    tgname = 'invitation_notification_capture' and tgrelid = 'invitation'::regclass
    and tgenabled = 'O'`);
  if (!result.rows.length)
    throw new Error(
      'Durable invitation capture is not installed for this Store',
    );
}
