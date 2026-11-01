-- REVIEW ONLY: apply separately to an explicitly approved target.
-- Additive, repeat-safe; no backfill and no changes to instruction text.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS step_analysis jsonb
  CHECK (step_analysis IS NULL OR
    (jsonb_typeof(step_analysis) = 'object' AND step_analysis->>'version' = '1'
     AND jsonb_typeof(step_analysis->'steps') = 'array'));
-- Rollback: deploy legacy-compatible readers first. Dropping this column
-- permanently discards analysis; export it before any separately approved DROP.
