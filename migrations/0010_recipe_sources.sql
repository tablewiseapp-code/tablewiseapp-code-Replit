-- Reviewed additive migration: where an imported recipe came from (YouTube link for now), kept apart from recipe
-- content so real extraction can replace the mock later. Creates one new table; no existing table or row changes.
-- Constraint names match drizzle-kit's. owner_id follows the other owner-scoped tables ("operator" for the operator).
CREATE TABLE IF NOT EXISTS public.recipe_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id varchar NOT NULL CONSTRAINT recipe_sources_recipe_id_recipes_id_fk REFERENCES public.recipes(id) ON DELETE CASCADE,
  owner_id varchar(64) NOT NULL,
  provider varchar(16) NOT NULL,
  original_url text NOT NULL,
  canonical_url text NOT NULL,
  external_video_id varchar(32) NOT NULL,
  status varchar(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_sources_provider CHECK (provider IN ('youtube')),
  CONSTRAINT recipe_sources_status CHECK (status IN ('mock','pending','ready','failed')),
  CONSTRAINT recipe_sources_recipe_unique UNIQUE (recipe_id),
  CONSTRAINT recipe_sources_owner_video_unique UNIQUE (owner_id, provider, external_video_id)
);
