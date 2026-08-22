-- Deployment prerequisite: the migration role needs CREATE privilege on the database to install the trusted pg_trgm extension.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "store_lifecycle_audit" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "store_name_trgm_idx" ON "store" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "store_slug_trgm_idx" ON "store" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "plans_name_trgm_idx" ON "plans" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "plans_code_trgm_idx" ON "plans" USING gin ("code" gin_trgm_ops);
