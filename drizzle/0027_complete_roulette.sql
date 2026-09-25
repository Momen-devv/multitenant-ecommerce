CREATE TYPE "public"."connect_webhook_event_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."payment_environment" AS ENUM('sandbox', 'live');--> statement-breakpoint
CREATE TYPE "public"."store_payment_account_creation_status" AS ENUM('not_started', 'creating', 'created', 'review_required');--> statement-breakpoint
CREATE TABLE "connect_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment" "payment_environment" NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "connect_webhook_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(1000),
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connect_webhook_events_processing_lease_check" CHECK (("connect_webhook_events"."status" = 'processing') = ("connect_webhook_events"."lease_token" IS NOT NULL AND "connect_webhook_events"."lease_expires_at" IS NOT NULL)),
	CONSTRAINT "connect_webhook_events_attempts_nonnegative_check" CHECK ("connect_webhook_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_payment_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"environment" "payment_environment" NOT NULL,
	"account_id" varchar(255),
	"creation_status" "store_payment_account_creation_status" DEFAULT 'not_started' NOT NULL,
	"frozen_creation_request" jsonb NOT NULL,
	"creation_provider_key" varchar(255) NOT NULL,
	"creation_dispatched_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(1000),
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"card_payments_active" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"requirements_due" text[] DEFAULT '{}' NOT NULL,
	"disabled_reason" varchar(255),
	"checked_at" timestamp with time zone,
	"deauthorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_payment_accounts_creation_lease_check" CHECK (("store_payment_accounts"."creation_status" = 'creating') = ("store_payment_accounts"."lease_token" IS NOT NULL AND "store_payment_accounts"."lease_expires_at" IS NOT NULL)),
	CONSTRAINT "store_payment_accounts_created_requires_account_check" CHECK ("store_payment_accounts"."creation_status" IN ('not_started', 'creating', 'review_required') OR "store_payment_accounts"."account_id" IS NOT NULL),
	CONSTRAINT "store_payment_accounts_retry_count_nonnegative_check" CHECK ("store_payment_accounts"."retry_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "store_payment_accounts" ADD CONSTRAINT "store_payment_accounts_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connect_webhook_events_environment_event_uidx" ON "connect_webhook_events" USING btree ("environment","stripe_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connect_webhook_events_environment_account_event_uidx" ON "connect_webhook_events" USING btree ("environment","account_id","stripe_event_id");--> statement-breakpoint
CREATE INDEX "connect_webhook_events_due_idx" ON "connect_webhook_events" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "connect_webhook_events_lease_idx" ON "connect_webhook_events" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "store_payment_accounts_store_environment_uidx" ON "store_payment_accounts" USING btree ("store_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "store_payment_accounts_environment_account_uidx" ON "store_payment_accounts" USING btree ("environment","account_id") WHERE "store_payment_accounts"."account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "store_payment_accounts_creation_due_idx" ON "store_payment_accounts" USING btree ("creation_status","next_retry_at");--> statement-breakpoint
CREATE INDEX "store_payment_accounts_lease_idx" ON "store_payment_accounts" USING btree ("creation_status","lease_expires_at");