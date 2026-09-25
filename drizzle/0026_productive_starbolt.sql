-- Retire the Cart/Order feature without leaving its inventory holds behind.
-- The migrator executes this migration transactionally.
LOCK TABLE "carts", "cart_items", "orders", "order_items", "order_events", "product_variants" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
UPDATE "product_variants" AS variant
SET "reserved" = variant."reserved" - held.quantity,
    "version" = variant."version" + 1,
    "updated_at" = now()
FROM (
  SELECT item."store_id", item."source_variant_id", sum(item."quantity")::integer AS quantity
  FROM "order_items" AS item
  JOIN "orders" AS purchase ON purchase."id" = item."order_id" AND purchase."store_id" = item."store_id"
  WHERE purchase."status" = 'placed' AND item."inventory_policy" = 'tracked'
  GROUP BY item."store_id", item."source_variant_id"
) AS held
WHERE variant."id" = held."source_variant_id" AND variant."store_id" = held."store_id";--> statement-breakpoint
DROP TABLE "order_events";--> statement-breakpoint
DROP TABLE "order_items";--> statement-breakpoint
DROP TABLE "orders";--> statement-breakpoint
DROP TABLE "cart_items";--> statement-breakpoint
DROP TABLE "carts";--> statement-breakpoint
-- Legacy custom OTP storage abandoned during the authenticated-checkout work.
-- Better Auth uses its own verification storage; no current schema references this table.
DROP TABLE IF EXISTS "user_phone_challenges";--> statement-breakpoint
DROP TYPE "public"."cart_state";--> statement-breakpoint
DROP TYPE "public"."order_event_actor_authority";--> statement-breakpoint
DROP TYPE "public"."order_payment_method";--> statement-breakpoint
DROP TYPE "public"."order_status";
