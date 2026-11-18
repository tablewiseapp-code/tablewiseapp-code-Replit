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
