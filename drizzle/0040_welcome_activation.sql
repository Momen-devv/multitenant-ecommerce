-- Apply before deploying event writers. Locks prevent concurrent creations from
-- falling between the baseline and the persisted cutoff. Drizzle runs migrations
-- in a transaction. Existing Subscriptions (including trialing ones) are excluded.
LOCK TABLE "user", store, subscriptions IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE notification_registration_rollout (
  id text PRIMARY KEY,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
INSERT INTO notification_registration_rollout(id) VALUES ('welcome-v1');
--> statement-breakpoint
INSERT INTO notification_milestones(source_key, event_type, aggregate_id, occurred_at)
SELECT 'user:' || id || ':registered', 'user.registered', id, created_at FROM "user"
UNION ALL
SELECT 'store:' || id || ':created', 'store.created', id::text, created_at FROM store
UNION ALL
SELECT 'subscription:' || id || ':activated', 'subscription.activated', id::text, created_at FROM subscriptions
ON CONFLICT DO NOTHING;
