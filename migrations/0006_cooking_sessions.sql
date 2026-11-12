-- Reviewed additive migration: My Cooking Experience (private cooking history, ratings, notes, photos).
-- Constraint names match drizzle-kit's, so a later schema push sees no difference.
-- Creates two new tables only. No existing table or row is changed; recipes stay exactly as they are.
CREATE TABLE IF NOT EXISTS public.cooking_sessions (
  id uuid PRIMARY KEY,
  owner_id varchar(64) NOT NULL,
  recipe_id varchar NOT NULL CONSTRAINT cooking_sessions_recipe_id_recipes_id_fk REFERENCES public.recipes(id) ON DELETE CASCADE,
  cooked_at timestamptz NOT NULL DEFAULT now(),
  rating smallint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cooking_sessions_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT cooking_sessions_notes CHECK (notes IS NULL OR length(notes) <= 4000)
);
CREATE INDEX IF NOT EXISTS cooking_sessions_owner_recipe ON public.cooking_sessions (owner_id, recipe_id, cooked_at);

CREATE TABLE IF NOT EXISTS public.cooking_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL CONSTRAINT cooking_photos_session_id_cooking_sessions_id_fk REFERENCES public.cooking_sessions(id) ON DELETE CASCADE,
  owner_id varchar(64) NOT NULL,
  image bytea NOT NULL,
  thumbnail bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cooking_photos_session ON public.cooking_photos (session_id, created_at);
CREATE INDEX IF NOT EXISTS cooking_photos_owner ON public.cooking_photos (owner_id);
