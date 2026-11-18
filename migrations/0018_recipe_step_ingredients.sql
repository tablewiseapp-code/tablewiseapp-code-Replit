-- Step-level ingredients: one list per step of the ingredients that step uses, as written for that step.
-- An empty list means the step uses none. NULL (every existing recipe) means no step-level data.
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "step_ingredients" jsonb;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_step_ingredients_check" CHECK ("recipes"."step_ingredients" IS NULL OR jsonb_typeof("recipes"."step_ingredients") = 'array');
