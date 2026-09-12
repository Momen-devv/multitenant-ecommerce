CREATE TYPE "public"."category_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"status" "category_status" DEFAULT 'draft' NOT NULL,
	"position" integer NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "categories_name_normalized_check" CHECK ("categories"."name" = trim("categories"."name") AND char_length("categories"."name") BETWEEN 1 AND 200),
	CONSTRAINT "categories_slug_format_check" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "categories_description_normalized_check" CHECK ("categories"."description" IS NULL OR ("categories"."description" = trim("categories"."description") AND char_length("categories"."description") BETWEEN 1 AND 50000)),
	CONSTRAINT "categories_position_nonnegative_check" CHECK ("categories"."position" >= 0),
	CONSTRAINT "categories_version_positive_check" CHECK ("categories"."version" > 0),
	CONSTRAINT "categories_lifecycle_timestamps_check" CHECK (("categories"."status" = 'draft' AND "categories"."published_at" IS NULL AND "categories"."archived_at" IS NULL)
        OR ("categories"."status" = 'published' AND "categories"."published_at" IS NOT NULL AND "categories"."archived_at" IS NULL)
        OR ("categories"."status" = 'archived' AND "categories"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_pk" PRIMARY KEY("store_id","product_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_category_fk" FOREIGN KEY ("store_id","category_id") REFERENCES "public"."categories"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_store_slug_uidx" ON "categories" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "categories_store_status_position_idx" ON "categories" USING btree ("store_id","status","position","id");--> statement-breakpoint
CREATE INDEX "product_categories_category_product_idx" ON "product_categories" USING btree ("category_id","product_id");