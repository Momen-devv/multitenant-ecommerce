ALTER TABLE "billing_webhook_events" ALTER COLUMN "payload" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "payload_expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "payload_purged_at" timestamp with time zone;--> statement-breakpoint
UPDATE "billing_webhook_events"
SET
	"status" = 'failed',
	"last_error" = 'Processing lease reset during lease-fencing migration',
	"next_retry_at" = now(),
	"lease_expires_at" = NULL,
	"updated_at" = now()
WHERE "status" = 'processing';--> statement-breakpoint
ALTER TABLE "subscription_checkout_attempts" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "subscription_checkout_attempts"
SET "expires_at" = CASE
	WHEN "status" = 'pending'
		THEN GREATEST("created_at" + interval '25 hours', now() + interval '25 hours')
	ELSE "created_at" + interval '25 hours'
END
WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "subscription_checkout_attempts" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_checkout_attempts_pending_expiry_idx" ON "subscription_checkout_attempts" USING btree ("status","expires_at");
