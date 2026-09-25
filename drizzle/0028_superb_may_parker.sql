CREATE TABLE "store_checkout_settings" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"shipping_fee" integer DEFAULT 0 NOT NULL,
	"delivery_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"shipping_policy" text,
	"cash_on_delivery_enabled" boolean DEFAULT false NOT NULL,
	"online_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_checkout_settings_version_positive_check" CHECK ("store_checkout_settings"."version" > 0),
	CONSTRAINT "store_checkout_settings_shipping_fee_range_check" CHECK ("store_checkout_settings"."shipping_fee" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
ALTER TABLE "store_checkout_settings" ADD CONSTRAINT "store_checkout_settings_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;