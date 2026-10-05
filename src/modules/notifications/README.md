# Notifications

This module provides a persistent inbox, email preferences, asynchronous email
delivery, and authenticated live inbox hints. PostgreSQL owns notification state;
BullMQ schedules work and Redis pub/sub tells clients to refetch.

## Delivery flow

1. Source operations record notification intents in the outbox alongside their
   domain changes. Stable source keys and lifetime milestones prevent duplicates.
2. The dispatcher validates each intent, creates or finds its event, and queues
   an event reference. Polling recovers missed process-local signals.
3. Materialization processes captured recipients in batches of 25 under a leased
   checkpoint transaction. It creates recipient state, inbox rows, and eligible
   email deliveries. Each delivery payload contains only its own recipient.
4. Email workers recheck recipient access and preferences before sending. Leases,
   stable provider idempotency keys, and database uniqueness protect retries.
5. Inbox changes publish generic Redis hints. Clients fetch the authorized inbox
   and unread count through HTTP.

Inbox messages and email deliveries have separate lifecycles. Reading, archiving,
or deleting a message does not cancel email. `sent` means provider acceptance,
not confirmed arrival in a mailbox.

Application queries use Drizzle builders. Small SQL expressions handle PostgreSQL
functions, JSON access, timestamps, and window ranking. Triggers and lifecycle
functions remain SQL migrations.

## Events and recipients

The [notification catalog](domain/notification-policy.ts) defines supported
combinations and mandatory email policy.

| Events | Recipients | Mandatory email |
| --- | --- | --- |
| `order.placed`, `order.cancelled`, `order.refunded` | Customer and authorized staff | Customer |
| `order.shipped`, `order.delivered` | Customer and authorized staff | None |
| `invitation.created` | Invitee | Invitee |
| `invitation.reminder` | Invitee | None |
| `invitation.accepted`, `invitation.rejected`, `invitation.expired` | Inviter | None |
| `invitation.cancelled` | Inviter and invitee | None |
| `user.registered` | Registered user | None |
| `store.created` | Store owner | None |
| `subscription.activated` | Store owner | Store owner |
| `order.intervention_required`, `notification.delivery_failed` | Platform administrators | None |

The existing order-email pipeline remains the sole sender of shopper emails.
A recipient who is both customer and staff receives one shopper email, without
an additional staff email for that transition. Welcome delivery waits for verified
account eligibility and uses the persisted registration rollout cutoff.

Recipients are captured at source time. Current account availability, ownership,
membership, and permissions are checked again where required for inbox visibility
and delivery. Email-only invitees can receive invitations; inbox binding requires
a matching verified account while the invitation remains pending and valid.

## Invitation integration

Better Auth owns invitation and membership operations. The integration enables
Drizzle transactions and wraps invitation endpoints so status changes and
membership creation share a transaction. PostgreSQL triggers capture lifecycle
state and notification intents within those writes.

The async auth provider verifies both `invitation_notification_capture` and
`invitation_membership_confirmation` before startup completes. Apply migrations
before starting the application. The Better Auth `sendInvitationEmail` callback
is intentionally a no-op because durable workers own invitation delivery.

Reconciliation expires pending invitations, records reminders after three days,
and binds verified invitees. It shares the database lifecycle writer used by the
triggers. The endpoint wrapper depends on installed Better Auth transaction
contracts; inspect those contracts when upgrading the dependency.

## HTTP API

All routes use the `/api/v1/notifications` prefix and require an authenticated
session. Foreign or inaccessible notification IDs return `404`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | List visible messages, newest first |
| GET | `/unread-count` | Count unread, non-archived messages |
| GET | `/preferences` | Read effective email preferences and overrides |
| PATCH | `/preferences` | Atomically apply a preference batch |
| POST | `/read-all` | Mark visible, non-archived messages read |
| GET | `/stream` | Open the SSE connection |
| GET | `/:id` | Read a message without marking it read |
| PATCH | `/:id/read` | Idempotently mark a message read |
| PATCH | `/:id/archive` | Archive with `{ "archived": true }`; restore with `false` |
| DELETE | `/:id` | Soft-delete and retain a recipient tombstone |

Listing accepts `storeId`, `type`, `unread`, `archived`, `limit`, and `cursor`.
`unread` and `archived` use strings `"true"` and `"false"`. Archived messages are
excluded by default. `limit` defaults to 20 and is capped at 100. Cursors are
opaque and bound to the user and original filters. Deleted and expired messages
are always excluded. Restoring an unread message returns it to unread counts.

Unread count and preferences accept an optional `storeId` query parameter.
Read-all accepts an optional `storeId` in its JSON body; messages committed after
the statement snapshot remain unread.

### Email preferences

Optional email defaults to enabled. Store overrides take precedence over global
overrides, followed by the catalog default. Mandatory policy takes precedence
over all overrides. Preferences do not disable inbox materialization.

Example `PATCH /api/v1/notifications/preferences` body:

```json
{
  "updates": [
    {
      "eventType": "order.shipped",
      "audience": "customer",
      "emailEnabled": false
    }
  ]
}
```

Add `storeId` for a Store override. Set `emailEnabled` to `null` to remove an
override. Unsupported or duplicate keys and attempts to disable mandatory email
reject the entire batch. Store scope requires current membership or qualifying
customer/invitation history.

## Live inbox stream

Use `new EventSource(url, { withCredentials: true })` and listen for
`inbox.changed`. Events contain only `{}`: no Store, resource, notification,
recipient, or session identifiers.

Refetch inbox and unread count on connection, on every hint, after reconnect,
and every 60 seconds while the inbox is open. Replace local results with the
authorized response because access may have changed. There is no durable replay,
event ID, or `Last-Event-ID` support.

Hints coalesce and flush on the heartbeat, which defaults to 25 seconds. Each
heartbeat revalidates the exact session without cookie caching and checks current
account availability in PostgreSQL. Revocation signals close affected streams;
periodic checks recover missed signals. Redis or authorization failures close
streams. New connections return `503` when Redis is unavailable and `429` when
the user reaches the connection limit.

Five connections per user are allowed across replicas by default. Redis leases
expire after 75 seconds; disconnect and shutdown release them immediately.
Slow clients disconnect rather than accumulating an unbounded write queue.
Disable proxy buffering, allow idle connections longer than the heartbeat, and
preserve session cookies.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `NOTIFICATION_INBOX_ENABLED` | Enabled | Literal `false` disables inbox/preferences endpoints and new streams |
| `NOTIFICATION_EMAIL_ENABLED` | Enabled | Literal `false` pauses notification email recovery and sending |
| `NOTIFICATION_STREAM_ENABLED` | Enabled | Literal `false` disables new streams |
| `NOTIFICATION_STREAM_MAX_CONNECTIONS` | `5` | Concurrent streams per user across replicas |
| `NOTIFICATION_STREAM_HEARTBEAT_MS` | `25000` | Heartbeat interval, validated at 1,000–40,000 ms; values outside this range fail startup validation |
| `TRUSTED_ORIGINS` | `BASE_URL` fallback | Comma-separated exact browser origins allowed for streams |

Use consistent settings on every replica and restart processes after deployment
configuration changes. Origins include scheme, host, and port, without paths or
wildcards. Disallowed browser origins receive `403`. Rollout flags do not remove
source capture, durable state, or deduplication records.

## Recovery and retention

| Scheduled work | Interval |
| --- | --- |
| Outbox dispatch and event recovery | 10 seconds |
| Email recovery | 10 seconds |
| Invitation reconciliation | 30 seconds |
| Registration and verified welcome reconciliation | 30 seconds |
| Retention cleanup and metrics | 60 seconds |

Workers use expiring leases and persisted retry state. PostgreSQL remains the
source of truth after queue or process failure. Provider requests reuse their
idempotency key within the 23-hour safety window. Ambiguous requests beyond that
window require review rather than automatic resend. There is no manual reset API
or operator CLI; dead letters need a separately audited recovery procedure.

The shared [retention policy](domain/notification-retention.ts) defines:

- **90 days from source occurrence:** inbox visibility and physical retention,
  including read, unread, archived, and deleted messages.
- **180 days from source occurrence:** supported replay period and eligibility for
  terminal event/delivery payload cleanup. Active work is retained.
- **180 days from outbox creation:** cleanup of terminal outbox payloads without
  an event, including malformed intents. Linked payloads wait for event cleanup.

Cleanup processes up to 500 rows per category with row locks and skip-locked
selection. Source milestones, deduplication keys, and recipient tombstones remain
so retries cannot recreate deleted history. Terminal invitation destinations are
scrubbed after 180 days without active dependent work.

`Notification operations snapshot` logs expose cleanup counts, status counts,
backlog age, retry totals, and local SSE connections. Aggregate connections across
replicas. Investigate growing backlogs, dead letters, and `review_required`
deliveries; never blindly reset sent or ambiguous deliveries.

## Code map

| Location | Responsibility |
| --- | --- |
| `controllers/`, `dto/` | HTTP contracts and validation |
| `domain/` | Event validation, audience policy, retention, and rollout controls |
| `repos/` | Persistence, authorization predicates, leases, checkpoints, and cleanup |
| `services/` | Materialization, delivery, recipient eligibility, and SSE |
| `tasks/` | Dispatch, reconciliation, recovery, and scheduled operations |
| `../../infrastructure/outbox/` | Source intent writers and outbox persistence |
| `../../infrastructure/queue/notifications/` | BullMQ scheduling and processing |
| `../auth/` | Better Auth integration and source hooks |

Before deployment, validate invitation rollback, duplicate source handling,
expired-lease recovery, recipient access changes, retention boundaries, and
multi-replica streaming against PostgreSQL and Redis. Build and lint checks alone
do not establish these runtime guarantees.
