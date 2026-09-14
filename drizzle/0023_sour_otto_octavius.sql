DROP TRIGGER IF EXISTS "user_contact_change_before_update" ON "user";--> statement-breakpoint
DROP FUNCTION IF EXISTS "record_user_contact_change"();--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "phone_verified_at";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "contact_version";
