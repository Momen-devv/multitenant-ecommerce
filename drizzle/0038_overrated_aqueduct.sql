ALTER TYPE "public"."outbox_event_type" ADD VALUE 'notification.intent' BEFORE 'plan.provisioning.requested';--> statement-breakpoint
ALTER TYPE "public"."order_email_delivery_status" ADD VALUE 'suppressed' BEFORE 'pending';--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD COLUMN "suppression_reason" varchar(255);