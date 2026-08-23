# Billing production runbook

## Deployment order

1. Back up PostgreSQL and verify the backup can be restored.
2. Stop the old app and webhook workers so they cannot acquire an unfenced lease
   between migrations `0009` and `0010`.
3. Apply Drizzle migrations `0006` through `0010` before starting the new app version.
4. Start the app and at least one Stripe webhook BullMQ worker.
5. Confirm the `stripe-webhook` recovery scheduler exists and runs every 30 seconds.
6. Send Stripe test events for `checkout.session.completed`,
   `checkout.session.expired`, and `customer.subscription.updated`.

Migrations `0009` and `0010` are safe for populated tables. Existing pending
Checkout attempts receive a conservative expiry at least 25 hours after the
migration, ensuring any pre-migration Stripe Session has expired first. Any event
that was `processing` during deployment is reset to `failed` and becomes
immediately recoverable with a new fenced lease. New Checkout Sessions and their
local attempts expire after one hour.

## Preflight checks

Run these read-only checks after migrating:

```sql
SELECT count(*) FROM subscription_checkout_attempts WHERE expires_at IS NULL;

SELECT count(*)
FROM billing_webhook_events
WHERE (status = 'processing') <>
      (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL);

SELECT store_id, count(*)
FROM subscription_checkout_attempts
WHERE status = 'pending'
GROUP BY store_id
HAVING count(*) > 1;

SELECT store_id, count(*)
FROM subscriptions
WHERE status NOT IN ('incomplete_expired', 'canceled')
GROUP BY store_id
HAVING count(*) > 1;
```

Every query must return zero rows or a zero count.

## Legacy webhook events

Migration `0008` dead-letters unfinished legacy inbox rows because their verified
Stripe payload was not previously retained. Do not manually replay those
synthetic payloads. Redeliver the original event from Stripe Workbench, which
will pass signature verification and create a processable inbox event.

## Monitoring and recovery

- Alert when `dead_letter` events exist, the oldest due event is older than five
  minutes, or no recovery job has completed recently.
- Keep PostgreSQL backups and Redis persistence enabled. PostgreSQL is the source
  of truth; Redis jobs are only processing nudges.
- Completed and dead-letter payloads are purged after 30 days. Their event-ID
  tombstones remain, so delayed duplicate deliveries stay idempotent.
- Use the billing service's manual replay operation only for `failed` or
  `dead_letter` rows whose retained payload is still present. Investigate and
  correct the cause before replaying.

## Rollback

The new application requires the new columns and constraints. Roll back the app
binary first only to a version compatible with migrations `0009` and `0010`.
Do not drop billing columns or enums during an incident; restore from backup if
a database rollback is unavoidable.
