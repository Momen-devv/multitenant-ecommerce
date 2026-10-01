CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'sending', 'sent', 'suppressed', 'dead_lettered', 'review_required');--> statement-breakpoint
CREATE TYPE "public"."notification_event_status" AS ENUM('pending', 'processing', 'processed', 'dead_lettered');--> statement-breakpoint
CREATE TYPE "public"."notification_recipient_outcome" AS ENUM('pending_binding', 'materialized', 'expired', 'suppressed', 'deleted');--> statement-breakpoint
CREATE TABLE "invitation_notification_state" (
	"invitation_id" text PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"inviter_user_id" text NOT NULL,
	"normalized_email" text,
	"bound_user_id" text,
	"status" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reminder_event_id" uuid,
	"reminder_recorded_at" timestamp with time zone,
	"outcome_recorded_at" timestamp with time zone,
	"resend_generation" integer DEFAULT 0 NOT NULL,
	"last_resent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_notifications_generation_check" CHECK ("invitation_notification_state"."resend_generation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_email_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_identity" text NOT NULL,
	"recipient_user_id" text,
	"recipient_email" text,
	"audiences" jsonb NOT NULL,
	"channel" varchar(16) DEFAULT 'email' NOT NULL,
	"payload" jsonb,
	"provider_idempotency_key" varchar(255) NOT NULL,
	"provider_message_id" text,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_queued_at" timestamp with time zone,
	"enqueue_generation" integer DEFAULT 0 NOT NULL,
	"provider_dispatched_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"suppression_reason" varchar(255),
	"dead_lettered_at" timestamp with time zone,
	"dead_letter_reason" varchar(1000),
	"last_error" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_channel_check" CHECK ("notification_email_deliveries"."channel" = 'email' AND "notification_email_deliveries"."attempts" >= 0 AND "notification_email_deliveries"."enqueue_generation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_key" varchar(255) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"aggregate_id" varchar(255) NOT NULL,
	"aggregate_version" integer NOT NULL,
	"store_id" uuid,
	"payload_version" integer NOT NULL,
	"payload" jsonb,
	"audience_snapshot" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" "notification_event_status" DEFAULT 'pending' NOT NULL,
	"fanout_progress" integer DEFAULT 0 NOT NULL,
	"recipient_count" integer NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_queued_at" timestamp with time zone,
	"enqueue_generation" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"dead_letter_reason" varchar(1000),
	"last_error" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_events_progress_check" CHECK ("notification_events"."fanout_progress" >= 0 AND "notification_events"."fanout_progress" <= "notification_events"."recipient_count" AND "notification_events"."attempts" >= 0 AND "notification_events"."enqueue_generation" >= 0 AND "notification_events"."aggregate_version" > 0 AND "notification_events"."payload_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_milestones" (
	"source_key" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"aggregate_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"store_id" uuid,
	"event_type" varchar(80) NOT NULL,
	"audience" varchar(32) NOT NULL,
	"email_enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_recipient_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_identity" text NOT NULL,
	"user_id" text,
	"audiences" jsonb NOT NULL,
	"outcome" "notification_recipient_outcome" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"materialized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"audiences" jsonb NOT NULL,
	"store_id" uuid,
	"type" varchar(80) NOT NULL,
	"display" jsonb NOT NULL,
	"resource" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_email_deliveries" ADD CONSTRAINT "notification_email_deliveries_event_id_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_email_deliveries" ADD CONSTRAINT "notification_email_deliveries_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_recipient_states" ADD CONSTRAINT "notification_recipient_states_event_id_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_notifications_discovery_idx" ON "invitation_notification_state" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_identity_uidx" ON "notification_email_deliveries" USING btree ("event_id","recipient_identity","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_provider_key_uidx" ON "notification_email_deliveries" USING btree ("provider_idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_email_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_lease_idx" ON "notification_email_deliveries" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_events_source_uidx" ON "notification_events" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "notification_events_due_idx" ON "notification_events" USING btree ("status","next_attempt_at","store_id","occurred_at");--> statement-breakpoint
CREATE INDEX "notification_events_lease_idx" ON "notification_events" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_global_uidx" ON "notification_preferences" USING btree ("user_id","event_type","audience") WHERE "notification_preferences"."store_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_store_uidx" ON "notification_preferences" USING btree ("user_id","store_id","event_type","audience") WHERE "notification_preferences"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_states_identity_uidx" ON "notification_recipient_states" USING btree ("event_id","recipient_identity");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_states_user_uidx" ON "notification_recipient_states" USING btree ("event_id","user_id") WHERE "notification_recipient_states"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_recipient_states_binding_idx" ON "notification_recipient_states" USING btree ("outcome","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_user_uidx" ON "notifications" USING btree ("event_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_cursor_idx" ON "notifications" USING btree ("recipient_user_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "notifications_store_cursor_idx" ON "notifications" USING btree ("recipient_user_id","store_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("recipient_user_id","store_id") WHERE "notifications"."read_at" IS NULL AND "notifications"."archived_at" IS NULL AND "notifications"."deleted_at" IS NULL;