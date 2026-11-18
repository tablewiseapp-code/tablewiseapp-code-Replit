-- REVIEW ONLY: apply separately to an explicitly approved target.
-- Additive, repeat-safe; no backfill. Recipes saved before manual import keep a NULL value and read as before.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS ingredient_parts jsonb
  CHECK (ingredient_parts IS NULL OR jsonb_typeof(ingredient_parts) = 'array');
-- Rollback: deploy readers that ignore the column first. Dropping it discards the parsed
-- quantities and units; the shown ingredient text stays in recipes.ingredients.
