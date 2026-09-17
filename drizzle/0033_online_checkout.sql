ALTER TABLE "checkout_attempts" ADD COLUMN "connected_account_id" varchar(255);--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "payment_environment" "payment_environment";--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "checkout_session_id" varchar(255);--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "payment_intent_id" varchar(255);--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_request_key" varchar(255);--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "next_retry_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_request" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "last_provider_error" varchar(1000);--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_session_uidx" ON "checkout_attempts" USING btree ("payment_environment","connected_account_id","checkout_session_id") WHERE "checkout_attempts"."checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_payment_intent_uidx" ON "checkout_attempts" USING btree ("payment_environment","connected_account_id","payment_intent_id") WHERE "checkout_attempts"."payment_intent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "checkout_attempts_recovery_due_idx" ON "checkout_attempts" USING btree ("status","next_retry_at");
--> statement-breakpoint
CREATE INDEX "checkout_attempts_lease_idx" ON "checkout_attempts" USING btree ("status","lease_expires_at");
