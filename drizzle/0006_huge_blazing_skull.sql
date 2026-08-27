CREATE TYPE "public"."billing_webhook_event_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"status" "billing_webhook_event_status" DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_error" varchar(1000),
	"stripe_created_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_stripe_event_id_uidx" ON "billing_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "billing_webhook_events_status_idx" ON "billing_webhook_events" USING btree ("status");