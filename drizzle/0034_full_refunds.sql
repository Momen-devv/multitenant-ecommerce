CREATE TYPE "refund_operation_status" AS ENUM ('pending', 'succeeded', 'failed', 'review_required');--> statement-breakpoint
ALTER TYPE "outbox_event_type" ADD VALUE IF NOT EXISTS 'order.refund.requested';--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "payment_charge_id" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_payment_charge_uidx" ON "checkout_attempts" USING btree ("payment_environment","connected_account_id","payment_charge_id") WHERE "checkout_attempts"."payment_charge_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "refund_operations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE restrict,
  "generation" integer NOT NULL,
  "payment_environment" "payment_environment" NOT NULL,
  "connected_account_id" varchar(255) NOT NULL,
  "payment_intent_id" varchar(255),
  "charge_id" varchar(255),
  "amount" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "status" "refund_operation_status" DEFAULT 'pending' NOT NULL,
  "provider_refund_id" varchar(255),
  "provider_request_key" varchar(255) NOT NULL,
  "provider_dispatched_at" timestamp with time zone,
  "provider_attempts" integer DEFAULT 0 NOT NULL,
  "next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_token" uuid,
  "lease_expires_at" timestamp with time zone,
  "last_provider_error" varchar(1000),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refund_operations_order_generation_uidx" UNIQUE("order_id", "generation"),
  CONSTRAINT "refund_operations_amount_check" CHECK ("amount" > 0 AND "provider_request_key" <> '')
);--> statement-breakpoint
CREATE UNIQUE INDEX "refund_operations_provider_ref_uidx" ON "refund_operations" USING btree ("payment_environment", "connected_account_id", "provider_refund_id") WHERE "refund_operations"."provider_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "refund_operations_recovery_due_idx" ON "refund_operations" USING btree ("status", "next_retry_at");--> statement-breakpoint
CREATE INDEX "refund_operations_lease_idx" ON "refund_operations" USING btree ("status", "lease_expires_at");
