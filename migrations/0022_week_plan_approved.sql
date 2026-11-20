-- The Week as a cooking plan (docs/cooking-plan.md): plan_assignments now holds dated dishes; approved_batches keeps the
-- dishes as last approved, which is what Groceries use. Rows saved before keep their slots and are converted when read
-- (server/week-plans.ts fromLegacy). NULL = never approved.
ALTER TABLE "week_plans" ADD COLUMN IF NOT EXISTS "approved_batches" jsonb;
