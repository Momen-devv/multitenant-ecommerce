CREATE TABLE "product_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_comments_content_check" CHECK ("product_comments"."content" = trim("product_comments"."content") AND char_length("product_comments"."content") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_store_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_comments_product_user_uidx" ON "product_comments" USING btree ("product_id","user_id");--> statement-breakpoint
CREATE INDEX "product_comments_product_created_id_idx" ON "product_comments" USING btree ("product_id","created_at","id");