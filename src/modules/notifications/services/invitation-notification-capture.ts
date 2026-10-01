import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { integer, pgSchema, text } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';

// Read-only catalog mapping; deliberately excluded from application migrations.
const triggers = pgSchema('pg_catalog').table('pg_trigger', {
  name: text('tgname').notNull(),
  relationId: integer('tgrelid').notNull(),
  enabled: text('tgenabled').notNull(),
});

/** Fail startup if transactional invitation capture is unavailable. */
export async function assertInvitationCaptureInstalled(
  db: NodePgDatabase<typeof schema>,
) {
  const result = await db
    .select({ name: triggers.name })
    .from(triggers)
    .where(
      and(
        inArray(triggers.enabled, ['O', 'A']),
        or(
          and(
            eq(triggers.name, 'invitation_notification_capture'),
            eq(triggers.relationId, sql`to_regclass('invitation')`),
          ),
          and(
            eq(triggers.name, 'invitation_membership_confirmation'),
            eq(triggers.relationId, sql`to_regclass('member')`),
          ),
        ),
      ),
    );
  if (result.length !== 2)
    throw new Error(
      'Durable invitation capture is not installed; apply notification migrations before starting',
    );
}
