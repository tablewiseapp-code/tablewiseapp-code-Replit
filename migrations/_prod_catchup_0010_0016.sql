-- Production catch-up from 0009 to 0016. Paste into the Replit Production Database SQL console in one go.
-- All or nothing: if any statement fails, run ROLLBACK; and nothing is changed.
BEGIN;

-- ===== 0010_grocery_item_photos.sql
-- Private pictures on existing grocery rows, including recipe ingredients.
CREATE TABLE "grocery_item_photos" (
  "owner_id" varchar(64) NOT NULL,
  "item_key" text NOT NULL,
  "image" text,
  CONSTRAINT "grocery_item_photos_owner_id_item_key_pk" PRIMARY KEY("owner_id", "item_key"),
  CONSTRAINT "grocery_item_photos_key" CHECK (length("item_key") BETWEEN 1 AND 12000),
  CONSTRAINT "grocery_item_photos_image" CHECK ("image" IS NULL OR length("image") <= 280023)
);

-- ===== 0010_recipe_sources.sql
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

-- ===== 0011_recipe_ingredient_parts.sql
-- REVIEW ONLY: apply separately to an explicitly approved target.
-- Additive, repeat-safe; no backfill. Recipes saved before manual import keep a NULL value and read as before.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS ingredient_parts jsonb
  CHECK (ingredient_parts IS NULL OR jsonb_typeof(ingredient_parts) = 'array');
-- Rollback: deploy readers that ignore the column first. Dropping it discards the parsed
-- quantities and units; the shown ingredient text stays in recipes.ingredients.

-- ===== 0012_home_tasks.sql
-- Home Tasks: private household to-dos and a shared catalog of suggested task names.
CREATE TABLE IF NOT EXISTS "home_tasks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_id" varchar(64) NOT NULL,
  "name" text NOT NULL,
  "due_date" date,
  "priority" varchar(8) NOT NULL,
  "image" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "home_tasks_name" CHECK (length("name") BETWEEN 1 AND 120),
  CONSTRAINT "home_tasks_priority" CHECK ("priority" IN ('high','normal','low')),
  CONSTRAINT "home_tasks_image" CHECK ("image" IS NULL OR length("image") <= 280023)
);
CREATE INDEX IF NOT EXISTS "home_tasks_owner" ON "home_tasks" USING btree ("owner_id");
CREATE TABLE IF NOT EXISTS "household_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "names" jsonb NOT NULL
);
INSERT INTO "household_tasks" (id, names) VALUES ('do-laundry', '{"en": "Do laundry", "ru": "Постирать бельё", "he": "לעשות כביסה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('fold-laundry', '{"en": "Fold laundry", "ru": "Сложить бельё", "he": "לקפל כביסה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('iron-clothes', '{"en": "Iron clothes", "ru": "Погладить одежду", "he": "לגהץ בגדים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('change-bed-sheets', '{"en": "Change bed sheets", "ru": "Поменять постельное бельё", "he": "להחליף מצעים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('wash-dishes', '{"en": "Wash the dishes", "ru": "Помыть посуду", "he": "לשטוף כלים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('run-dishwasher', '{"en": "Run the dishwasher", "ru": "Запустить посудомойку", "he": "להפעיל מדיח"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('empty-dishwasher', '{"en": "Empty the dishwasher", "ru": "Разгрузить посудомойку", "he": "לרוקן מדיח"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('take-out-trash', '{"en": "Take out the trash", "ru": "Вынести мусор", "he": "להוציא את הזבל"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('take-out-recycling', '{"en": "Take out the recycling", "ru": "Вынести вторсырьё", "he": "להוציא מחזור"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('vacuum', '{"en": "Vacuum", "ru": "Пропылесосить", "he": "לשאוב אבק"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('mop-floors', '{"en": "Mop the floors", "ru": "Помыть полы", "he": "לשטוף רצפה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('dust', '{"en": "Dust the furniture", "ru": "Вытереть пыль", "he": "לנגב אבק"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-bathroom', '{"en": "Clean the bathroom", "ru": "Убрать ванную", "he": "לנקות את חדר האמבטיה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-toilet', '{"en": "Clean the toilet", "ru": "Почистить унитаз", "he": "לנקות את האסלה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-kitchen', '{"en": "Clean the kitchen", "ru": "Убрать кухню", "he": "לנקות את המטבח"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-fridge', '{"en": "Clean the fridge", "ru": "Помыть холодильник", "he": "לנקות את המקרר"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-oven', '{"en": "Clean the oven", "ru": "Почистить духовку", "he": "לנקות את התנור"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-windows', '{"en": "Clean the windows", "ru": "Помыть окна", "he": "לנקות חלונות"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('water-plants', '{"en": "Water the plants", "ru": "Полить цветы", "he": "להשקות את העציצים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('feed-pets', '{"en": "Feed the pets", "ru": "Покормить питомцев", "he": "להאכיל את חיות המחמד"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('walk-dog', '{"en": "Walk the dog", "ru": "Выгулять собаку", "he": "להוציא את הכלב"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-litter-box', '{"en": "Clean the litter box", "ru": "Убрать кошачий лоток", "he": "לנקות ארגז חול"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('pay-electricity-bill', '{"en": "Pay electricity bill", "ru": "Оплатить счёт за электричество", "he": "לשלם חשבון חשמל"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('pay-water-bill', '{"en": "Pay water bill", "ru": "Оплатить счёт за воду", "he": "לשלם חשבון מים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('pay-rent', '{"en": "Pay rent", "ru": "Оплатить аренду", "he": "לשלם שכר דירה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('change-light-bulb', '{"en": "Change a light bulb", "ru": "Заменить лампочку", "he": "להחליף נורה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('replace-water-filter', '{"en": "Replace the water filter", "ru": "Заменить фильтр для воды", "he": "להחליף פילטר מים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('tidy-living-room', '{"en": "Tidy the living room", "ru": "Прибраться в гостиной", "he": "לסדר את הסלון"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('make-beds', '{"en": "Make the beds", "ru": "Заправить кровати", "he": "לסדר את המיטות"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('sort-mail', '{"en": "Sort the mail", "ru": "Разобрать почту", "he": "למיין את הדואר"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('declutter-closet', '{"en": "Declutter the closet", "ru": "Разобрать шкаф", "he": "לסדר את הארון"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('wash-car', '{"en": "Wash the car", "ru": "Помыть машину", "he": "לשטוף את הרכב"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;

-- ===== 0013_week_plans.sql
-- The Week: one plan per owner (was browser localStorage only).
CREATE TABLE IF NOT EXISTS "week_plans" (
  "owner_id" varchar(64) PRIMARY KEY NOT NULL,
  "selected_ids" jsonb NOT NULL,
  "plan_assignments" jsonb NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ===== 0014_grocery_shopping.sql
CREATE TABLE grocery_shopping_items (
  owner_id varchar(64) NOT NULL,
  item_key text NOT NULL,
  skipped boolean NOT NULL DEFAULT false,
  price_cents integer,
  price_text text,
  CONSTRAINT grocery_shopping_items_owner_id_item_key_pk PRIMARY KEY (owner_id, item_key),
  CONSTRAINT grocery_shopping_items_price_check CHECK (
    (price_cents IS NULL AND price_text IS NULL) OR
    (price_cents IS NOT NULL AND price_cents BETWEEN 0 AND 10000000 AND price_text IS NOT NULL)
  )
);

ALTER TABLE grocery_extras ADD COLUMN category text;
DROP INDEX grocery_extras_owner_text;
CREATE INDEX grocery_extras_owner_text ON grocery_extras (owner_id, text);

-- ===== 0015_accounts.sql
-- Accounts: email and password sign-in. An account points at one owner; guests keep working without one.
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(254) NOT NULL,
  "password_hash" text,
  "owner_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "accounts_email_unique" UNIQUE("email"),
  CONSTRAINT "accounts_owner_id_unique" UNIQUE("owner_id")
);
CREATE TABLE IF NOT EXISTS "account_sessions" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL CONSTRAINT "account_sessions_account_id_accounts_id_fk" REFERENCES "accounts"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_sessions_account" ON "account_sessions" USING btree ("account_id");

-- ===== 0016_recipe_marks.sql
-- My recipes: catalog recipes an owner liked or imported. Imports made before this migration are not attributed.
CREATE TABLE IF NOT EXISTS "recipe_marks" (
  "owner_id" varchar(64) NOT NULL,
  "recipe_id" varchar NOT NULL,
  "kind" varchar(8) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_marks_owner_id_recipe_id_kind_pk" PRIMARY KEY("owner_id","recipe_id","kind"),
  CONSTRAINT "recipe_marks_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "recipe_marks_kind" CHECK ("kind" IN ('liked','imported'))
);

COMMIT;
