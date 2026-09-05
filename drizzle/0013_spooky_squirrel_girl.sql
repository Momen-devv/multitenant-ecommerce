UPDATE "product_variants"
SET "sku" = 'SKU-' || upper(replace("id"::text, '-', ''))
WHERE "sku" IS NULL;--> statement-breakpoint
UPDATE "product_variants"
SET "barcode" = 'PV-' || upper(replace("id"::text, '-', ''))
WHERE "barcode" IS NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "sku" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "barcode" SET NOT NULL;
