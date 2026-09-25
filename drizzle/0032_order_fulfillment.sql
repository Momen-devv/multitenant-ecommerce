ALTER TABLE "orders" ADD COLUMN "carrier" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" varchar(200);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "previous_status" "order_status";--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "next_status" "order_status";--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "actor_authority" varchar(32);--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_carrier_tracking_pair_check" CHECK (("carrier" IS NULL AND "tracking_number" IS NULL) OR ("carrier" IS NOT NULL AND "tracking_number" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_reason_check" CHECK ("cancellation_reason" IS NULL OR ("cancellation_reason" = trim("cancellation_reason") AND char_length("cancellation_reason") BETWEEN 1 AND 500));--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_reason_check" CHECK ("reason" IS NULL OR ("reason" = trim("reason") AND char_length("reason") BETWEEN 1 AND 500));
