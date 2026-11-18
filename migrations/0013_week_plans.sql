-- The Week: one plan per owner (was browser localStorage only).
CREATE TABLE IF NOT EXISTS "week_plans" (
  "owner_id" varchar(64) PRIMARY KEY NOT NULL,
  "selected_ids" jsonb NOT NULL,
  "plan_assignments" jsonb NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
