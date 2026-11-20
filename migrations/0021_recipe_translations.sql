-- Recipe translations (design test, 2026-11-20): the original stays in "recipes" with its language;
-- each reading language (en, ru, he) gets one row. Lists follow the original's order.
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "language" varchar(2);
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_language_check" CHECK ("recipes"."language" IS NULL OR "recipes"."language" ~ '^[a-z]{2}$');

CREATE TABLE IF NOT EXISTS "recipe_translations" (
  "recipe_id" varchar NOT NULL,
  "language" varchar(2) NOT NULL,
  "title" text NOT NULL,
  "ingredients" text[] NOT NULL,
  "steps" text[] NOT NULL,
  "translated_by" varchar(8) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_translations_recipe_id_language_pk" PRIMARY KEY("recipe_id","language"),
  CONSTRAINT "recipe_translations_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "recipe_translations_language" CHECK ("language" IN ('en','ru','he')),
  CONSTRAINT "recipe_translations_translated_by" CHECK ("translated_by" IN ('ai','person'))
);
