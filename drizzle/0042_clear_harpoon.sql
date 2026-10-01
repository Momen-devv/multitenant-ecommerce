CREATE TABLE "comment_create_requests" (
	"user_id" text NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_create_requests_pk" PRIMARY KEY("user_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "product_comments" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_create_requests" ADD CONSTRAINT "comment_create_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_version_check" CHECK ("product_comments"."version" > 0);