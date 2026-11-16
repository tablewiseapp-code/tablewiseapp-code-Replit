-- Reviewed additive migration: grocery share links (a saved copy of a list, opened by link with a role) and
-- per-item grocery notes. Constraint names match drizzle-kit's, so a later schema push sees no difference.
-- Creates three new tables only. No existing table or row is changed.
CREATE TABLE IF NOT EXISTS public.shared_grocery_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(64) NOT NULL,
  token varchar(64) NOT NULL CONSTRAINT shared_grocery_lists_token_unique UNIQUE,
  role varchar(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_grocery_lists_role CHECK (role IN ('view','add','edit'))
);
CREATE INDEX IF NOT EXISTS shared_grocery_lists_owner ON public.shared_grocery_lists (owner_id, created_at);

CREATE TABLE IF NOT EXISTS public.shared_grocery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL CONSTRAINT shared_grocery_items_list_id_shared_grocery_lists_id_fk REFERENCES public.shared_grocery_lists(id) ON DELETE CASCADE,
  category varchar(40) NOT NULL,
  text varchar(300) NOT NULL,
  recipes varchar(300) NOT NULL DEFAULT '',
  checked boolean NOT NULL DEFAULT false,
  note varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_grocery_items_list ON public.shared_grocery_items (list_id);

CREATE TABLE IF NOT EXISTS public.grocery_notes (
  owner_id varchar(64) NOT NULL,
  item_key varchar(300) NOT NULL,
  note varchar(500) NOT NULL,
  CONSTRAINT grocery_notes_owner_id_item_key_pk PRIMARY KEY (owner_id, item_key)
);
