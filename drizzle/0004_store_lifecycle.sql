CREATE TYPE "public"."store_status" AS ENUM('active', 'owner_closed', 'platform_suspended');
--> statement-breakpoint
CREATE TYPE "public"."store_actor_authority" AS ENUM('store_owner', 'platform_super_admin');
--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "status" "store_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
UPDATE "store"
SET "status" = CASE
  WHEN "is_active" = false THEN 'owner_closed'::"store_status"
  ELSE 'active'::"store_status"
END;
--> statement-breakpoint
ALTER TABLE "store" DROP COLUMN "is_active";
--> statement-breakpoint
ALTER TABLE "store" DROP COLUMN "deactivated_at";
--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT "store_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_organization_id_unique" UNIQUE ("organization_id");
--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_owner_id_unique" UNIQUE ("owner_id");
--> statement-breakpoint
CREATE TABLE "store_lifecycle_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_authority" "store_actor_authority" NOT NULL,
	"previous_status" "store_status" NOT NULL,
	"new_status" "store_status" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_lifecycle_audit_reason_length" CHECK (char_length(trim("reason")) BETWEEN 10 AND 500)
);
--> statement-breakpoint
ALTER TABLE "store_lifecycle_audit" ADD CONSTRAINT "store_lifecycle_audit_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_lifecycle_audit" ADD CONSTRAINT "store_lifecycle_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "store_lifecycle_audit_store_id_idx" ON "store_lifecycle_audit" USING btree ("store_id");
