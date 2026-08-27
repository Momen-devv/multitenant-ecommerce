DROP INDEX "outbox_events_due_idx";--> statement-breakpoint
ALTER TABLE "plan_prices" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_events_due_idx" ON "outbox_events" USING btree ("event_type","published_at","dead_lettered_at","available_at");--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_active_requires_stripe_price_check" CHECK ("plan_prices"."is_active" = false OR "plan_prices"."stripe_price_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_active_requires_ready_stripe_product_check" CHECK ("plans"."is_active" = false OR ("plans"."provisioning_status" = 'ready' AND "plans"."stripe_product_id" IS NOT NULL));