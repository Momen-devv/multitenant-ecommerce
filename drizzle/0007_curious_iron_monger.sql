CREATE TYPE "public"."subscription_checkout_attempt_status" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "subscription_checkout_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_price_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_price_id" varchar(255) NOT NULL,
	"success_url" text NOT NULL,
	"cancel_url" text NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"stripe_checkout_session_url" text,
	"status" "subscription_checkout_attempt_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_checkout_attempts_session_fields_check" CHECK (("subscription_checkout_attempts"."stripe_checkout_session_id" IS NULL) = ("subscription_checkout_attempts"."stripe_checkout_session_url" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "subscription_checkout_attempts" ADD CONSTRAINT "subscription_checkout_attempts_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_checkout_attempts" ADD CONSTRAINT "subscription_checkout_attempts_plan_price_id_plan_prices_id_fk" FOREIGN KEY ("plan_price_id") REFERENCES "public"."plan_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_checkout_attempts_store_pending_uidx" ON "subscription_checkout_attempts" USING btree ("store_id") WHERE "subscription_checkout_attempts"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_checkout_attempts_stripe_session_uidx" ON "subscription_checkout_attempts" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "subscription_checkout_attempts_store_id_idx" ON "subscription_checkout_attempts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "subscription_checkout_attempts_plan_price_id_idx" ON "subscription_checkout_attempts" USING btree ("plan_price_id");