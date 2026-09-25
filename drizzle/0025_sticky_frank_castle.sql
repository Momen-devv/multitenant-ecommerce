ALTER TYPE "public"."cart_state" ADD VALUE 'expired';--> statement-breakpoint
ALTER TABLE "carts" DROP CONSTRAINT "carts_token_digest_format_check";--> statement-breakpoint
ALTER TABLE "carts" DROP CONSTRAINT "carts_state_timestamps_check";--> statement-breakpoint
ALTER TABLE "carts" ALTER COLUMN "token_digest" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "carts_active_store_user_uidx" ON "carts" USING btree ("store_id","user_id") WHERE "carts"."state" = 'active' AND "carts"."user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_ownership_check" CHECK (("carts"."user_id" IS NULL AND "carts"."token_digest" IS NOT NULL)
        OR ("carts"."user_id" IS NOT NULL AND "carts"."token_digest" IS NULL));--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_expired_at_check" CHECK ("carts"."expired_at" IS NULL OR "carts"."expired_at" >= "carts"."created_at");--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_token_digest_format_check" CHECK ("carts"."token_digest" IS NULL OR "carts"."token_digest" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_state_timestamps_check" CHECK (("carts"."state" = 'active' AND "carts"."converted_at" IS NULL)
        OR ("carts"."state" = 'converted' AND "carts"."converted_at" IS NOT NULL AND "carts"."expired_at" IS NULL)
        OR ("carts"."state"::text = 'expired' AND "carts"."expired_at" IS NOT NULL AND "carts"."converted_at" IS NULL));
