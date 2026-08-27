ALTER TABLE "plan_provisioning_outbox" RENAME TO "outbox_events";--> statement-breakpoint
ALTER TABLE "outbox_events" RENAME COLUMN "plan_id" TO "aggregate_id";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "plan_provisioning_outbox_plan_id_plans_id_fk";
--> statement-breakpoint
DROP INDEX "plan_provisioning_outbox_plan_version_uidx";--> statement-breakpoint
DROP INDEX "plan_provisioning_outbox_due_idx";--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "aggregate_id" TYPE varchar(255) USING "aggregate_id"::text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "event_type" varchar(100);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "deduplication_key" varchar(255);--> statement-breakpoint
UPDATE "outbox_events"
SET
	"event_type" = 'plan.provisioning.requested',
	"payload" = jsonb_build_object(
		'planId', "aggregate_id",
		'provisioningVersion', "provisioning_version"
	),
	"deduplication_key" = "aggregate_id" || ':v' || "provisioning_version"::text;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "event_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "payload" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "deduplication_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_type_deduplication_uidx" ON "outbox_events" USING btree ("event_type","deduplication_key");--> statement-breakpoint
CREATE INDEX "outbox_events_due_idx" ON "outbox_events" USING btree ("event_type","published_at","available_at");--> statement-breakpoint
ALTER TABLE "outbox_events" DROP COLUMN "provisioning_version";
