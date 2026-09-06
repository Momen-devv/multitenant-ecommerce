CREATE TYPE "public"."inventory_policy" AS ENUM('tracked', 'untracked');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_variant_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"public_url" text,
	"alt_text" varchar(255),
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"byte_size" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_image_key_not_blank_check" CHECK (char_length(trim("product_images"."image_key")) > 0),
	CONSTRAINT "product_images_public_url_not_blank_check" CHECK ("product_images"."public_url" IS NULL OR char_length(trim("product_images"."public_url")) > 0),
	CONSTRAINT "product_images_alt_text_normalized_check" CHECK ("product_images"."alt_text" IS NULL OR ("product_images"."alt_text" = trim("product_images"."alt_text") AND char_length("product_images"."alt_text") BETWEEN 1 AND 255)),
	CONSTRAINT "product_images_dimensions_positive_check" CHECK ("product_images"."width" > 0 AND "product_images"."height" > 0),
	CONSTRAINT "product_images_byte_size_positive_check" CHECK ("product_images"."byte_size" > 0),
	CONSTRAINT "product_images_mime_type_check" CHECK ("product_images"."mime_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "product_images_position_nonnegative_check" CHECK ("product_images"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_option_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"value" varchar(100) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_option_values_store_product_option_id_unique" UNIQUE("store_id","product_id","option_id","id"),
	CONSTRAINT "product_option_values_value_normalized_check" CHECK ("product_option_values"."value" = trim("product_option_values"."value") AND char_length("product_option_values"."value") BETWEEN 1 AND 100),
	CONSTRAINT "product_option_values_position_nonnegative_check" CHECK ("product_option_values"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_options_store_product_id_unique" UNIQUE("store_id","product_id","id"),
	CONSTRAINT "product_options_name_normalized_check" CHECK ("product_options"."name" = trim("product_options"."name") AND char_length("product_options"."name") BETWEEN 1 AND 100),
	CONSTRAINT "product_options_position_check" CHECK ("product_options"."position" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE "product_variant_option_values" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variant_option_values_pk" PRIMARY KEY("variant_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"option_signature" text DEFAULT '' NOT NULL,
	"sku" varchar(100),
	"barcode" varchar(100),
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"weight_grams" integer,
	"status" "product_variant_status" DEFAULT 'active' NOT NULL,
	"inventory_policy" "inventory_policy" DEFAULT 'tracked' NOT NULL,
	"on_hand" integer DEFAULT 0,
	"reserved" integer DEFAULT 0,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_store_product_id_unique" UNIQUE("store_id","product_id","id"),
	CONSTRAINT "product_variants_title_normalized_check" CHECK ("product_variants"."title" = trim("product_variants"."title") AND char_length("product_variants"."title") BETWEEN 1 AND 200),
	CONSTRAINT "product_variants_signature_normalized_check" CHECK ("product_variants"."option_signature" = trim("product_variants"."option_signature")),
	CONSTRAINT "product_variants_sku_normalized_check" CHECK ("product_variants"."sku" IS NULL OR ("product_variants"."sku" = trim("product_variants"."sku") AND char_length("product_variants"."sku") BETWEEN 1 AND 100)),
	CONSTRAINT "product_variants_barcode_normalized_check" CHECK ("product_variants"."barcode" IS NULL OR ("product_variants"."barcode" = trim("product_variants"."barcode") AND char_length("product_variants"."barcode") BETWEEN 1 AND 100)),
	CONSTRAINT "product_variants_price_positive_check" CHECK ("product_variants"."price" > 0),
	CONSTRAINT "product_variants_compare_at_price_check" CHECK ("product_variants"."compare_at_price" IS NULL OR "product_variants"."compare_at_price" > "product_variants"."price"),
	CONSTRAINT "product_variants_weight_nonnegative_check" CHECK ("product_variants"."weight_grams" IS NULL OR "product_variants"."weight_grams" >= 0),
	CONSTRAINT "product_variants_inventory_state_check" CHECK (("product_variants"."inventory_policy" = 'tracked' AND "product_variants"."on_hand" IS NOT NULL AND "product_variants"."reserved" IS NOT NULL AND "product_variants"."on_hand" >= 0 AND "product_variants"."reserved" >= 0 AND "product_variants"."reserved" <= "product_variants"."on_hand")
        OR ("product_variants"."inventory_policy" = 'untracked' AND "product_variants"."on_hand" IS NULL AND "product_variants"."reserved" IS NULL)),
	CONSTRAINT "product_variants_lifecycle_check" CHECK (("product_variants"."status" = 'active' AND "product_variants"."archived_at" IS NULL)
        OR ("product_variants"."status" = 'archived' AND "product_variants"."archived_at" IS NOT NULL)),
	CONSTRAINT "product_variants_version_positive_check" CHECK ("product_variants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "products_name_normalized_check" CHECK ("products"."name" = trim("products"."name") AND char_length("products"."name") BETWEEN 1 AND 200),
	CONSTRAINT "products_slug_format_check" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "products_description_normalized_check" CHECK ("products"."description" IS NULL OR ("products"."description" = trim("products"."description") AND char_length("products"."description") BETWEEN 1 AND 50000)),
	CONSTRAINT "products_version_positive_check" CHECK ("products"."version" > 0),
	CONSTRAINT "products_lifecycle_timestamps_check" CHECK (("products"."status" = 'draft' AND "products"."published_at" IS NULL AND "products"."archived_at" IS NULL)
        OR ("products"."status" = 'published' AND "products"."published_at" IS NOT NULL AND "products"."archived_at" IS NULL)
        OR ("products"."status" = 'archived' AND "products"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "default_currency" varchar(3) DEFAULT 'usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_store_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_fk" FOREIGN KEY ("store_id","product_id","option_id") REFERENCES "public"."product_options"("store_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_store_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_variant_fk" FOREIGN KEY ("store_id","product_id","variant_id") REFERENCES "public"."product_variants"("store_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_value_fk" FOREIGN KEY ("store_id","product_id","option_id","option_value_id") REFERENCES "public"."product_option_values"("store_id","product_id","option_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_image_key_uidx" ON "product_images" USING btree ("image_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_position_uidx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_values_option_value_uidx" ON "product_option_values" USING btree ("option_id",lower("value"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_values_option_position_uidx" ON "product_option_values" USING btree ("option_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_product_name_uidx" ON "product_options" USING btree ("product_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_product_position_uidx" ON "product_options" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_option_values_variant_value_uidx" ON "product_variant_option_values" USING btree ("variant_id","option_value_id");--> statement-breakpoint
CREATE INDEX "product_variant_option_values_value_id_idx" ON "product_variant_option_values" USING btree ("option_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_signature_uidx" ON "product_variants" USING btree ("product_id","option_signature");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_sku_uidx" ON "product_variants" USING btree ("store_id",lower("sku")) WHERE "product_variants"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_barcode_uidx" ON "product_variants" USING btree ("store_id",lower("barcode")) WHERE "product_variants"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_variants_product_status_idx" ON "product_variants" USING btree ("product_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_slug_uidx" ON "products" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "products_store_status_created_id_idx" ON "products" USING btree ("store_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "products_store_status_updated_id_idx" ON "products" USING btree ("store_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_default_currency_format_check" CHECK ("store"."default_currency" ~ '^[a-z]{3}$');