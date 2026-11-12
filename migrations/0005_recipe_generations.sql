-- Reviewed additive migration: AI recipe generation requests and private drafts.
-- Creates one new table only. No existing table, row or visibility is changed;
-- every existing recipe stays exactly as public as before.
CREATE TABLE IF NOT EXISTS public.recipe_generations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(64) NOT NULL,
  search_text varchar(120) NOT NULL,
  request jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  draft jsonb NOT NULL,
  model varchar(80) NOT NULL,
  prompt_version varchar(80) NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  recipe_id varchar REFERENCES public.recipes(id) ON DELETE SET NULL,
  approved_by varchar(64),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_generations_status CHECK (status IN ('draft','pending_review','changes_requested','rejected','published','unpublished')),
  CONSTRAINT recipe_generations_published CHECK (status <> 'published' OR (approved_at IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS recipe_generations_owner ON public.recipe_generations (owner_id, created_at);
CREATE INDEX IF NOT EXISTS recipe_generations_recipe ON public.recipe_generations (recipe_id);
