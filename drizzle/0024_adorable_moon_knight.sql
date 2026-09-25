ALTER TABLE "user_addresses" DROP CONSTRAINT IF EXISTS "user_addresses_version_check";--> statement-breakpoint
ALTER TABLE "user_addresses" DROP CONSTRAINT IF EXISTS "user_addresses_recipient_phone_check";--> statement-breakpoint
ALTER TABLE "user_addresses" ALTER COLUMN "recipient_phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_addresses" DROP COLUMN IF EXISTS "version";--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_recipient_phone_check" CHECK ("user_addresses"."recipient_phone" = trim("user_addresses"."recipient_phone") AND char_length("user_addresses"."recipient_phone") BETWEEN 3 AND 50);
