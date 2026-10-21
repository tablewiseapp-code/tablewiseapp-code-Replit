-- Additive only. Run explicitly after reviewing the target database.
-- Does not alter existing recipes or infer preparation durations.
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS prep_time integer
  CHECK (prep_time IS NULL OR prep_time BETWEEN 0 AND 10080);
