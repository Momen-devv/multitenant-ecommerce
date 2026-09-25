CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" varchar(100) NOT NULL,
	"recipient_name" varchar(200) NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"region" varchar(100),
	"postal_code" varchar(32),
	"country_code" varchar(2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_addresses_label_check" CHECK ("user_addresses"."label" = trim("user_addresses"."label") AND char_length("user_addresses"."label") BETWEEN 1 AND 100),
	CONSTRAINT "user_addresses_recipient_name_check" CHECK ("user_addresses"."recipient_name" = trim("user_addresses"."recipient_name") AND char_length("user_addresses"."recipient_name") BETWEEN 1 AND 200),
	CONSTRAINT "user_addresses_address_line_1_check" CHECK ("user_addresses"."address_line_1" = trim("user_addresses"."address_line_1") AND char_length("user_addresses"."address_line_1") BETWEEN 1 AND 200),
	CONSTRAINT "user_addresses_address_line_2_check" CHECK ("user_addresses"."address_line_2" IS NULL OR ("user_addresses"."address_line_2" = trim("user_addresses"."address_line_2") AND char_length("user_addresses"."address_line_2") BETWEEN 1 AND 200)),
	CONSTRAINT "user_addresses_city_check" CHECK ("user_addresses"."city" = trim("user_addresses"."city") AND char_length("user_addresses"."city") BETWEEN 1 AND 100),
	CONSTRAINT "user_addresses_region_check" CHECK ("user_addresses"."region" IS NULL OR ("user_addresses"."region" = trim("user_addresses"."region") AND char_length("user_addresses"."region") BETWEEN 1 AND 100)),
	CONSTRAINT "user_addresses_postal_code_check" CHECK ("user_addresses"."postal_code" IS NULL OR ("user_addresses"."postal_code" = trim("user_addresses"."postal_code") AND char_length("user_addresses"."postal_code") BETWEEN 1 AND 32)),
	CONSTRAINT "user_addresses_country_code_check" CHECK ("user_addresses"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number_verified" boolean;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_one_default_uidx" ON "user_addresses" USING btree ("user_id") WHERE "user_addresses"."is_default";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");