# Outbox

The outbox records dispatch intents in PostgreSQL alongside business changes, so a Redis outage after commit does not lose the intent. `OutboxModule` exports `OutboxRepository`; feature dispatchers own publication and recovery.

## Repository operations

- `claimDue`: claims due events by type with a lease, excluding published and dead-lettered events. Notification intents are selected with fairness across Stores.
- `markPublished`: records successful publication.
- `rescheduleAfterFailure`: records failure and schedules another attempt or dead-letters the event.

Storage is defined in `database/schema/outbox.schema.ts`. The module needs the global `DATABASE` provider and has no separate environment variables.

## Notification intents

Use `writeNotificationIntent` inside the transaction that changes domain state. The source key becomes the deduplication key; duplicate inserts are ignored.

`notificationTransaction` wraps a database transaction and emits local hints only after a successful commit. A failed hint cannot roll back committed work; polling remains authoritative.

`writeWelcomeIntent` also records a lifetime milestone, independently of notification retention. It only captures registrations covered by the `welcome-v1` rollout activation. `captureRegisteredUser` builds the registration intent from the persisted account; verification reconciliation owns welcome delivery.

Queue publication and provider delivery have separate state. See [queues](../queue/README.md) and [notification documentation](../../modules/notifications/README.md) for downstream behavior.
