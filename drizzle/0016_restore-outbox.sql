-- A prior, now-removed migration dropped this table. This forward migration
-- repairs databases that applied it and is safe on databases that did not.
DO $$
BEGIN
  IF to_regtype('public.outbox_event_type') IS NULL THEN
    CREATE TYPE public.outbox_event_type AS ENUM ('plan.provisioning.requested');
  END IF;
END
$$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY NOT NULL,
  event_type public.outbox_event_type NOT NULL,
  aggregate_id varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  deduplication_key varchar(255) NOT NULL,
  available_at timestamp with time zone DEFAULT now() NOT NULL,
  published_at timestamp with time zone,
  dead_lettered_at timestamp with time zone,
  attempts integer DEFAULT 0 NOT NULL,
  last_error varchar(1000),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_type_deduplication_uidx
  ON public.outbox_events (event_type, deduplication_key);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS outbox_events_due_idx
  ON public.outbox_events
  (event_type, published_at, dead_lettered_at, available_at);
