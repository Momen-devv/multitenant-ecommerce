CREATE TYPE "public"."billing_webhook_event_status_new" AS ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ALTER COLUMN "status" SET DATA TYPE "public"."billing_webhook_event_status_new" USING "status"::text::"public"."billing_webhook_event_status_new";--> statement-breakpoint
DROP TYPE "public"."billing_webhook_event_status";--> statement-breakpoint
ALTER TYPE "public"."billing_webhook_event_status_new" RENAME TO "billing_webhook_event_status";--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ALTER COLUMN "attempts" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "payload" jsonb;--> statement-breakpoint
UPDATE "billing_webhook_events"
SET "payload" = jsonb_build_object(
	'id', "stripe_event_id",
	'type', "event_type",
	'created', extract(epoch from "stripe_created_at")::bigint,
	'data', jsonb_build_object('object', jsonb_build_object()),
	'legacyPayloadUnavailable', true
);--> statement-breakpoint
UPDATE "billing_webhook_events"
SET
	"status" = 'dead_letter',
	"last_error" = 'Legacy webhook payload unavailable; manual Stripe redelivery required',
	"updated_at" = now()
WHERE "status" <> 'completed';--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ALTER COLUMN "payload" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "next_retry_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "billing_webhook_events_due_idx" ON "billing_webhook_events" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "billing_webhook_events_lease_idx" ON "billing_webhook_events" USING btree ("status","lease_expires_at");
