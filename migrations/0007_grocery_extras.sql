-- Reviewed additive migration: Groceries "+ Add item" (products the owner adds by hand).
-- Constraint and index names match drizzle-kit's, so a later schema push sees no difference.
-- Creates one new table only. No existing table or row is changed.
CREATE TABLE IF NOT EXISTS public.grocery_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(64) NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grocery_extras_text CHECK (length(text) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX IF NOT EXISTS grocery_extras_owner_text ON public.grocery_extras (owner_id, text);
