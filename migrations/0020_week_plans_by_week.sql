-- The Week is dated: one plan per owner and calendar week (Monday). The plan each owner already has becomes the
-- week this migration runs in (Postgres weeks start on Monday). `proposed`: the full-week proposal was made once.
ALTER TABLE "week_plans" ADD COLUMN IF NOT EXISTS "week_start" date;
UPDATE "week_plans" SET "week_start" = date_trunc('week', now())::date WHERE "week_start" IS NULL;
ALTER TABLE "week_plans" ALTER COLUMN "week_start" SET NOT NULL;
ALTER TABLE "week_plans" ADD COLUMN IF NOT EXISTS "proposed" boolean DEFAULT false NOT NULL;
ALTER TABLE "week_plans" DROP CONSTRAINT IF EXISTS "week_plans_pkey";
ALTER TABLE "week_plans" ADD CONSTRAINT "week_plans_owner_id_week_start_pk" PRIMARY KEY ("owner_id", "week_start");
