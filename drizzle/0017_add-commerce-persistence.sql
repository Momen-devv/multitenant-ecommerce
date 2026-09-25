CREATE TYPE "public"."cart_state" AS ENUM('active', 'converted');--> statement-breakpoint
CREATE TYPE "public"."order_event_actor_authority" AS ENUM('guest', 'store_owner');--> statement-breakpoint
CREATE TYPE "public"."order_payment_method" AS ENUM('cash_on_delivery');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('placed', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_check" CHECK ("cart_items"."quantity" BETWEEN 1 AND 99)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"state" "cart_state" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "carts_token_digest_format_check" CHECK ("carts"."token_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "carts_version_positive_check" CHECK ("carts"."version" > 0),
	CONSTRAINT "carts_expiry_after_creation_check" CHECK ("carts"."expires_at" > "carts"."created_at"),
	CONSTRAINT "carts_state_timestamps_check" CHECK (("carts"."state" = 'active' AND "carts"."converted_at" IS NULL)
        OR ("carts"."state" = 'converted' AND "carts"."converted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"transition" "order_status" NOT NULL,
	"actor_id" text,
	"actor_authority" "order_event_actor_authority" NOT NULL,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_actor_check" CHECK (("order_events"."transition" = 'placed' AND "order_events"."actor_authority" = 'guest' AND "order_events"."actor_id" IS NULL AND "order_events"."reason" IS NULL)
        OR ("order_events"."transition" = 'fulfilled' AND "order_events"."actor_authority" = 'store_owner' AND "order_events"."actor_id" IS NOT NULL AND "order_events"."reason" IS NULL)
        OR ("order_events"."transition" = 'cancelled' AND "order_events"."actor_authority" = 'store_owner' AND "order_events"."actor_id" IS NOT NULL AND "order_events"."reason" = trim("order_events"."reason") AND char_length("order_events"."reason") BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"source_product_id" uuid NOT NULL,
	"source_variant_id" uuid NOT NULL,
	"product_name" varchar(200) NOT NULL,
	"variant_title" varchar(200) NOT NULL,
	"sku" varchar(100) NOT NULL,
	"ordered_options" jsonb NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" integer NOT NULL,
	"inventory_policy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_product_name_check" CHECK ("order_items"."product_name" = trim("order_items"."product_name") AND char_length("order_items"."product_name") BETWEEN 1 AND 200),
	CONSTRAINT "order_items_variant_title_check" CHECK ("order_items"."variant_title" = trim("order_items"."variant_title") AND char_length("order_items"."variant_title") BETWEEN 1 AND 200),
	CONSTRAINT "order_items_sku_check" CHECK ("order_items"."sku" = trim("order_items"."sku") AND char_length("order_items"."sku") BETWEEN 1 AND 100),
	CONSTRAINT "order_items_options_array_check" CHECK (jsonb_typeof("order_items"."ordered_options") = 'array'),
	CONSTRAINT "order_items_unit_price_check" CHECK ("order_items"."unit_price" BETWEEN 1 AND 20202020),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" BETWEEN 1 AND 99),
	CONSTRAINT "order_items_line_total_check" CHECK ("order_items"."line_total" = "order_items"."unit_price" * "order_items"."quantity" AND "order_items"."line_total" <= 2000000000),
	CONSTRAINT "order_items_inventory_policy_check" CHECK ("order_items"."inventory_policy" IN ('tracked', 'untracked')),
	CONSTRAINT "order_items_options_shape_check" CHECK (NOT jsonb_path_exists("order_items"."ordered_options", '$[*] ? (!exists(@.name) || !exists(@.value) || @.name.type() != "string" || @.value.type() != "string" || @.name == "" || @.value == "")'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"source_cart_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'placed' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal" integer NOT NULL,
	"shipping_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"payment_method" "order_payment_method" DEFAULT 'cash_on_delivery' NOT NULL,
	"recipient_name" varchar(200) NOT NULL,
	"email" varchar(254) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"region" varchar(100),
	"postal_code" varchar(32),
	"country_code" varchar(2) NOT NULL,
	"checkout_idempotency_key" varchar(255) NOT NULL,
	"checkout_request_fingerprint" varchar(128) NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "orders_currency_format_check" CHECK ("orders"."currency" ~ '^[a-z]{3}$'),
	CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal" >= 0 AND "orders"."shipping_amount" >= 0 AND "orders"."tax_amount" >= 0
        AND "orders"."subtotal" <= 2000000000
        AND "orders"."shipping_amount" <= 2000000000
        AND "orders"."tax_amount" <= 2000000000
        AND "orders"."total" = ("orders"."subtotal"::bigint + "orders"."shipping_amount"::bigint + "orders"."tax_amount"::bigint)
        AND "orders"."total" <= 2000000000),
	CONSTRAINT "orders_recipient_name_check" CHECK ("orders"."recipient_name" = trim("orders"."recipient_name") AND char_length("orders"."recipient_name") BETWEEN 1 AND 200),
	CONSTRAINT "orders_email_check" CHECK ("orders"."email" = trim("orders"."email") AND char_length("orders"."email") BETWEEN 3 AND 254),
	CONSTRAINT "orders_phone_check" CHECK ("orders"."phone" = trim("orders"."phone") AND char_length("orders"."phone") BETWEEN 3 AND 50),
	CONSTRAINT "orders_address_line_1_check" CHECK ("orders"."address_line_1" = trim("orders"."address_line_1") AND char_length("orders"."address_line_1") BETWEEN 1 AND 200),
	CONSTRAINT "orders_address_line_2_check" CHECK ("orders"."address_line_2" IS NULL OR ("orders"."address_line_2" = trim("orders"."address_line_2") AND char_length("orders"."address_line_2") BETWEEN 1 AND 200)),
	CONSTRAINT "orders_city_check" CHECK ("orders"."city" = trim("orders"."city") AND char_length("orders"."city") BETWEEN 1 AND 100),
	CONSTRAINT "orders_region_check" CHECK ("orders"."region" IS NULL OR ("orders"."region" = trim("orders"."region") AND char_length("orders"."region") BETWEEN 1 AND 100)),
	CONSTRAINT "orders_postal_code_check" CHECK ("orders"."postal_code" IS NULL OR ("orders"."postal_code" = trim("orders"."postal_code") AND char_length("orders"."postal_code") BETWEEN 1 AND 32)),
	CONSTRAINT "orders_country_code_check" CHECK ("orders"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "orders_idempotency_key_check" CHECK ("orders"."checkout_idempotency_key" = trim("orders"."checkout_idempotency_key") AND char_length("orders"."checkout_idempotency_key") BETWEEN 1 AND 255),
	CONSTRAINT "orders_fingerprint_check" CHECK ("orders"."checkout_request_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "orders_state_timestamps_check" CHECK (("orders"."status" = 'placed' AND "orders"."fulfilled_at" IS NULL AND "orders"."cancelled_at" IS NULL)
        OR ("orders"."status" = 'fulfilled' AND "orders"."fulfilled_at" IS NOT NULL AND "orders"."cancelled_at" IS NULL)
        OR ("orders"."status" = 'cancelled' AND "orders"."cancelled_at" IS NOT NULL AND "orders"."fulfilled_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_store_cart_fk" FOREIGN KEY ("store_id","cart_id") REFERENCES "public"."carts"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_store_product_variant_fk" FOREIGN KEY ("store_id","product_id","variant_id") REFERENCES "public"."product_variants"("store_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_store_order_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_order_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_product_variant_fk" FOREIGN KEY ("store_id","source_product_id","source_variant_id") REFERENCES "public"."product_variants"("store_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_source_cart_fk" FOREIGN KEY ("store_id","source_cart_id") REFERENCES "public"."carts"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_variant_uidx" ON "cart_items" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE INDEX "cart_items_store_cart_idx" ON "cart_items" USING btree ("store_id","cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_token_digest_uidx" ON "carts" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "carts_active_expiry_idx" ON "carts" USING btree ("expires_at") WHERE "carts"."state" = 'active';--> statement-breakpoint
CREATE INDEX "order_events_store_order_created_idx" ON "order_events" USING btree ("store_id","order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_variant_uidx" ON "order_items" USING btree ("order_id","source_variant_id");--> statement-breakpoint
CREATE INDEX "order_items_store_order_idx" ON "order_items" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_source_cart_uidx" ON "orders" USING btree ("source_cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_source_cart_idempotency_uidx" ON "orders" USING btree ("source_cart_id","checkout_idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_store_status_placed_id_idx" ON "orders" USING btree ("store_id","status","placed_at","id");