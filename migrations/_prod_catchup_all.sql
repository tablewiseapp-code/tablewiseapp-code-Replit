-- Explicit additive development migration. Never run automatically at startup.
CREATE TABLE IF NOT EXISTS "public"."pilot_events" (
  event_id uuid PRIMARY KEY,
  pilot_id uuid NOT NULL,
  event_name varchar(40) NOT NULL,
  week_start date NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  recipe_id varchar(150) NOT NULL DEFAULT '',
  CONSTRAINT pilot_events_name CHECK (event_name IN
    ('planner_opened','meal_selected','plan_completed','grocery_list_opened','next_week_plan_created')),
  CONSTRAINT pilot_events_week CHECK (extract(isodow FROM week_start) = 1 AND week_start BETWEEN '2000-01-01' AND '2100-12-31'),
  CONSTRAINT pilot_events_recipe CHECK (
    (event_name = 'meal_selected' AND recipe_id ~ '^[a-zA-Z0-9:_-]{1,150}$')
    OR (event_name <> 'meal_selected' AND recipe_id = '')),
  CONSTRAINT pilot_events_semantic UNIQUE (pilot_id, event_name, week_start, recipe_id)
);
CREATE INDEX IF NOT EXISTS pilot_events_completion ON "public"."pilot_events" (pilot_id, occurred_at, event_id) WHERE event_name = 'plan_completed';
CREATE INDEX IF NOT EXISTS pilot_events_funnel ON "public"."pilot_events" (event_name, week_start);
-- Additive only. Run explicitly after reviewing the target database.
-- Does not alter existing recipes or infer preparation durations.
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS prep_time integer
  CHECK (prep_time IS NULL OR prep_time BETWEEN 0 AND 10080);
-- Reviewed additive development migration. No startup or deployment hook.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS credit_kind text;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS credit_name varchar(120);
DO $credit$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recipes'::regclass AND conname = 'recipes_credit_check') THEN
    ALTER TABLE public.recipes ADD CONSTRAINT recipes_credit_check CHECK (
      (credit_kind IS NULL AND credit_name IS NULL) OR
      (credit_kind IS NOT NULL AND credit_kind IN ('chef', 'mine') AND
        (credit_name IS NULL OR (length(btrim(credit_name)) BETWEEN 1 AND 120 AND credit_name = btrim(credit_name))) AND
        (credit_kind = 'mine' OR credit_name IS NOT NULL))
    );
  END IF;
END $credit$;
-- Reviewed development-only setup. Never run automatically at startup/publish.
CREATE TABLE IF NOT EXISTS recipe_nutrition (
  recipe_id varchar PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  input_hash varchar(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
-- REVIEW ONLY: apply separately to an explicitly approved target.
-- Additive, repeat-safe; no backfill and no changes to instruction text.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS step_analysis jsonb
  CHECK (step_analysis IS NULL OR
    (jsonb_typeof(step_analysis) = 'object' AND step_analysis->>'version' = '1'
     AND jsonb_typeof(step_analysis->'steps') = 'array'));
-- Rollback: deploy legacy-compatible readers first. Dropping this column
-- permanently discards analysis; export it before any separately approved DROP.
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
-- Additive: private item reference photos and a shared suggestion catalog.
ALTER TABLE public.grocery_extras ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE public.grocery_extras DROP CONSTRAINT IF EXISTS grocery_extras_image;
ALTER TABLE public.grocery_extras ADD CONSTRAINT grocery_extras_image CHECK (image IS NULL OR length(image) <= 280023);
CREATE TABLE IF NOT EXISTS public.household_products (
 id text PRIMARY KEY, category text NOT NULL, names jsonb NOT NULL, aliases jsonb NOT NULL
);
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('potatoes', 'Produce', '{"en": "Potatoes", "ru": "Картофель", "he": "תפוחי אדמה"}'::jsonb, '["potato"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('onions', 'Produce', '{"en": "Onions", "ru": "Лук", "he": "בצל"}'::jsonb, '["onion"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('carrots', 'Produce', '{"en": "Carrots", "ru": "Морковь", "he": "גזר"}'::jsonb, '["carrot"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('tomatoes', 'Produce', '{"en": "Tomatoes", "ru": "Помидоры", "he": "עגבניות"}'::jsonb, '["tomato"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cucumbers', 'Produce', '{"en": "Cucumbers", "ru": "Огурцы", "he": "מלפפונים"}'::jsonb, '["cucumber"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('garlic', 'Produce', '{"en": "Garlic", "ru": "Чеснок", "he": "שום"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('lettuce', 'Produce', '{"en": "Lettuce", "ru": "Салат", "he": "חסה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('spinach', 'Produce', '{"en": "Spinach", "ru": "Шпинат", "he": "תרד"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('broccoli', 'Produce', '{"en": "Broccoli", "ru": "Брокколи", "he": "ברוקולי"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cauliflower', 'Produce', '{"en": "Cauliflower", "ru": "Цветная капуста", "he": "כרובית"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cabbage', 'Produce', '{"en": "Cabbage", "ru": "Капуста", "he": "כרוב"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('bell-peppers', 'Produce', '{"en": "Bell peppers", "ru": "Сладкий перец", "he": "פלפלים"}'::jsonb, '["pepper"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('zucchini', 'Produce', '{"en": "Zucchini", "ru": "Кабачки", "he": "קישואים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('mushrooms', 'Produce', '{"en": "Mushrooms", "ru": "Грибы", "he": "פטריות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('apples', 'Produce', '{"en": "Apples", "ru": "Яблоки", "he": "תפוחים"}'::jsonb, '["apple"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('bananas', 'Produce', '{"en": "Bananas", "ru": "Бананы", "he": "בננות"}'::jsonb, '["banana"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('oranges', 'Produce', '{"en": "Oranges", "ru": "Апельсины", "he": "תפוזים"}'::jsonb, '["orange"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('lemons', 'Produce', '{"en": "Lemons", "ru": "Лимоны", "he": "לימונים"}'::jsonb, '["lemon"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('avocados', 'Produce', '{"en": "Avocados", "ru": "Авокадо", "he": "אבוקדו"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('strawberries', 'Produce', '{"en": "Strawberries", "ru": "Клубника", "he": "תותים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('blueberries', 'Produce', '{"en": "Blueberries", "ru": "Черника", "he": "אוכמניות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('grapes', 'Produce', '{"en": "Grapes", "ru": "Виноград", "he": "ענבים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('milk', 'Dairy & Eggs', '{"en": "Milk", "ru": "Молоко", "he": "חלב"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('eggs', 'Dairy & Eggs', '{"en": "Eggs", "ru": "Яйца", "he": "ביצים"}'::jsonb, '["egg"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('butter', 'Dairy & Eggs', '{"en": "Butter", "ru": "Сливочное масло", "he": "חמאה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cheese', 'Dairy & Eggs', '{"en": "Cheese", "ru": "Сыр", "he": "גבינה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('yogurt', 'Dairy & Eggs', '{"en": "Yogurt", "ru": "Йогурт", "he": "יוגורט"}'::jsonb, '["yoghurt"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('sour-cream', 'Dairy & Eggs', '{"en": "Sour cream", "ru": "Сметана", "he": "שמנת חמוצה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cream', 'Dairy & Eggs', '{"en": "Cream", "ru": "Сливки", "he": "שמנת"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cottage-cheese', 'Dairy & Eggs', '{"en": "Cottage cheese", "ru": "Творог", "he": "קוטג׳"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('chicken', 'Meat & Poultry', '{"en": "Chicken", "ru": "Курица", "he": "עוף"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('ground-beef', 'Meat & Poultry', '{"en": "Ground beef", "ru": "Говяжий фарш", "he": "בשר בקר טחון"}'::jsonb, '["minced beef"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('turkey', 'Meat & Poultry', '{"en": "Turkey", "ru": "Индейка", "he": "הודו"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('beef', 'Meat & Poultry', '{"en": "Beef", "ru": "Говядина", "he": "בקר"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('salmon', 'Seafood', '{"en": "Salmon", "ru": "Лосось", "he": "סלמון"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('white-fish', 'Seafood', '{"en": "White fish", "ru": "Белая рыба", "he": "דג לבן"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('canned-tuna', 'Canned & Jarred', '{"en": "Canned tuna", "ru": "Тунец консервированный", "he": "טונה בשימורים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('chickpeas', 'Canned & Jarred', '{"en": "Chickpeas", "ru": "Нут", "he": "חומוס"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('beans', 'Canned & Jarred', '{"en": "Beans", "ru": "Фасоль", "he": "שעועית"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('lentils', 'Canned & Jarred', '{"en": "Lentils", "ru": "Чечевица", "he": "עדשים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('canned-tomatoes', 'Canned & Jarred', '{"en": "Canned tomatoes", "ru": "Томаты консервированные", "he": "עגבניות משומרות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('tomato-paste', 'Canned & Jarred', '{"en": "Tomato paste", "ru": "Томатная паста", "he": "רסק עגבניות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('corn', 'Canned & Jarred', '{"en": "Corn", "ru": "Кукуруза", "he": "תירס"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('peanut-butter', 'Canned & Jarred', '{"en": "Peanut butter", "ru": "Арахисовая паста", "he": "חמאת בוטנים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('jam', 'Canned & Jarred', '{"en": "Jam", "ru": "Варенье", "he": "ריבה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('honey', 'Canned & Jarred', '{"en": "Honey", "ru": "Мёд", "he": "דבש"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('bread', 'Grains & Pasta', '{"en": "Bread", "ru": "Хлеб", "he": "לחם"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('rice', 'Grains & Pasta', '{"en": "Rice", "ru": "Рис", "he": "אורז"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('pasta', 'Grains & Pasta', '{"en": "Pasta", "ru": "Макароны", "he": "פסטה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('oats', 'Grains & Pasta', '{"en": "Oats", "ru": "Овсянка", "he": "שיבולת שועל"}'::jsonb, '["oatmeal"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('flour', 'Grains & Pasta', '{"en": "Flour", "ru": "Мука", "he": "קמח"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('gluten-free-flour', 'Grains & Pasta', '{"en": "Gluten-free flour", "ru": "Безглютеновая мука", "he": "קמח ללא גלוטן"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('gluten-free-bread', 'Grains & Pasta', '{"en": "Gluten-free bread", "ru": "Безглютеновый хлеб", "he": "לחם ללא גלוטן"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('gluten-free-pasta', 'Grains & Pasta', '{"en": "Gluten-free pasta", "ru": "Безглютеновые макароны", "he": "פסטה ללא גלוטן"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cereal', 'Grains & Pasta', '{"en": "Cereal", "ru": "Хлопья", "he": "דגני בוקר"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('tortillas', 'Grains & Pasta', '{"en": "Tortillas", "ru": "Тортильи", "he": "טורטיות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('salt', 'Spices & Seasonings', '{"en": "Salt", "ru": "Соль", "he": "מלח"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('black-pepper', 'Spices & Seasonings', '{"en": "Black pepper", "ru": "Чёрный перец", "he": "פלפל שחור"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('paprika', 'Spices & Seasonings', '{"en": "Paprika", "ru": "Паприка", "he": "פפריקה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cumin', 'Spices & Seasonings', '{"en": "Cumin", "ru": "Кумин", "he": "כמון"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('cinnamon', 'Spices & Seasonings', '{"en": "Cinnamon", "ru": "Корица", "he": "קינמון"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('olive-oil', 'Spices & Seasonings', '{"en": "Olive oil", "ru": "Оливковое масло", "he": "שמן זית"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('vegetable-oil', 'Spices & Seasonings', '{"en": "Vegetable oil", "ru": "Растительное масло", "he": "שמן צמחי"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('vinegar', 'Spices & Seasonings', '{"en": "Vinegar", "ru": "Уксус", "he": "חומץ"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('sugar', 'Other', '{"en": "Sugar", "ru": "Сахар", "he": "סוכר"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('baking-powder', 'Other', '{"en": "Baking powder", "ru": "Разрыхлитель", "he": "אבקת אפייה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('baking-soda', 'Other', '{"en": "Baking soda", "ru": "Пищевая сода", "he": "סודה לשתייה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('coffee', 'Other', '{"en": "Coffee", "ru": "Кофе", "he": "קפה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('tea', 'Other', '{"en": "Tea", "ru": "Чай", "he": "תה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('juice', 'Other', '{"en": "Juice", "ru": "Сок", "he": "מיץ"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('water', 'Other', '{"en": "Water", "ru": "Вода", "he": "מים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('oat-milk', 'Other', '{"en": "Oat milk", "ru": "Овсяное молоко", "he": "חלב שיבולת שועל"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('almond-milk', 'Other', '{"en": "Almond milk", "ru": "Миндальное молоко", "he": "חלב שקדים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('frozen-peas', 'Other', '{"en": "Frozen peas", "ru": "Замороженный горошек", "he": "אפונה קפואה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('frozen-vegetables', 'Other', '{"en": "Frozen vegetables", "ru": "Замороженные овощи", "he": "ירקות קפואים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('nuts', 'Other', '{"en": "Nuts", "ru": "Орехи", "he": "אגוזים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('crackers', 'Other', '{"en": "Crackers", "ru": "Крекеры", "he": "קרקרים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('toothbrush', 'Other', '{"en": "Toothbrush", "ru": "Зубная щётка", "he": "מברשת שיניים"}'::jsonb, '["tooth brush"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('toothpaste', 'Other', '{"en": "Toothpaste", "ru": "Зубная паста", "he": "משחת שיניים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('dental-floss', 'Other', '{"en": "Dental floss", "ru": "Зубная нить", "he": "חוט דנטלי"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('soap', 'Other', '{"en": "Soap", "ru": "Мыло", "he": "סבון"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('shampoo', 'Other', '{"en": "Shampoo", "ru": "Шампунь", "he": "שמפו"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('conditioner', 'Other', '{"en": "Conditioner", "ru": "Кондиционер для волос", "he": "מרכך שיער"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('body-wash', 'Other', '{"en": "Body wash", "ru": "Гель для душа", "he": "סבון רחצה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('deodorant', 'Other', '{"en": "Deodorant", "ru": "Дезодорант", "he": "דאודורנט"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('toilet-paper', 'Other', '{"en": "Toilet paper", "ru": "Туалетная бумага", "he": "נייר טואלט"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('tissues', 'Other', '{"en": "Tissues", "ru": "Бумажные платки", "he": "ממחטות נייר"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('paper-towels', 'Other', '{"en": "Paper towels", "ru": "Бумажные полотенца", "he": "מגבות נייר"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('dish-soap', 'Other', '{"en": "Dish soap", "ru": "Средство для мытья посуды", "he": "סבון כלים"}'::jsonb, '["washing up liquid"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('dishwasher-tablets', 'Other', '{"en": "Dishwasher tablets", "ru": "Таблетки для посудомоечной машины", "he": "טבליות למדיח"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('laundry-detergent', 'Other', '{"en": "Laundry detergent", "ru": "Средство для стирки", "he": "חומר כביסה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('fabric-softener', 'Other', '{"en": "Fabric softener", "ru": "Кондиционер для белья", "he": "מרכך כביסה"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('all-purpose-cleaner', 'Other', '{"en": "All-purpose cleaner", "ru": "Универсальное чистящее средство", "he": "חומר ניקוי כללי"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('sponges', 'Other', '{"en": "Sponges", "ru": "Губки", "he": "ספוגים"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('garbage-bags', 'Other', '{"en": "Garbage bags", "ru": "Мусорные пакеты", "he": "שקיות אשפה"}'::jsonb, '["trash bags", "bin bags"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('aluminum-foil', 'Other', '{"en": "Aluminum foil", "ru": "Фольга", "he": "נייר אלומיניום"}'::jsonb, '["aluminium foil", "tin foil"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('baking-paper', 'Other', '{"en": "Baking paper", "ru": "Бумага для выпечки", "he": "נייר אפייה"}'::jsonb, '["parchment paper"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('food-storage-bags', 'Other', '{"en": "Food storage bags", "ru": "Пакеты для хранения продуктов", "he": "שקיות מזון"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('diapers', 'Other', '{"en": "Diapers", "ru": "Подгузники", "he": "חיתולים"}'::jsonb, '["nappies"]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('baby-wipes', 'Other', '{"en": "Baby wipes", "ru": "Детские влажные салфетки", "he": "מגבונים לתינוקות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
INSERT INTO public.household_products (id, category, names, aliases) VALUES ('batteries', 'Other', '{"en": "Batteries", "ru": "Батарейки", "he": "סוללות"}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, names = EXCLUDED.names, aliases = EXCLUDED.aliases;
