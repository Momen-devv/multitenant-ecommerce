CREATE TYPE "public"."order_email_delivery_status" AS ENUM('pending', 'sending', 'sent', 'dead_lettered');--> statement-breakpoint
CREATE TABLE "order_email_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"transition_version" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"recipient_email" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "order_email_delivery_status" DEFAULT 'pending' NOT NULL,
	"provider_idempotency_key" varchar(255) NOT NULL,
	"provider_message_id" varchar(255),
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_queued_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"last_error" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_email_deliveries_outbox_event_uidx" UNIQUE("outbox_event_id"),
	CONSTRAINT "order_email_deliveries_order_transition_type_uidx" UNIQUE("order_id","transition_version","type")
);
--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_email_deliveries_due_idx" ON "order_email_deliveries" USING btree ("sent_at","dead_lettered_at","next_attempt_at");--> statement-breakpoint
CREATE INDEX "order_email_deliveries_lease_idx" ON "order_email_deliveries" USING btree ("lease_expires_at");