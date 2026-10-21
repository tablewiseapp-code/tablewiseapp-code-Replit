import catalog from "./researched-dinners.json";
import { recipeId, recipeInput } from "../request-schemas";
import { recipeToolKeys } from "../../client/src/lib/recipe-tools";

export const researchedDinners = catalog.recipes.map(record => {
  const { id, ...input } = record;
  const parsed = recipeInput.parse(input);
  if (!id.startsWith("tablewise:real:v1:") || parsed.prepTime == null ||
    parsed.cookTime == null || !parsed.servings || !parsed.sourceUrl ||
    !["www.bbcgoodfood.com", "www.budgetbytes.com"].includes(new URL(parsed.sourceUrl).hostname) ||
    !parsed.tags?.includes("Dinner") || recipeToolKeys(parsed.steps).length === 0) {
    throw new Error("Researched dinners require complete, sourced metadata and identifiable equipment.");
  }
  return { id: recipeId.parse(id), ...parsed, image: null };
});
if (researchedDinners.length !== 12 ||
  new Set(researchedDinners.map(recipe => recipe.id)).size !== 12 ||
  new Set(researchedDinners.map(recipe => recipe.sourceUrl)).size !== 12) {
  throw new Error("Expected exactly twelve unique researched dinner recipes and source URLs.");
}

export function researchedImportSQL() {
  const payload = Buffer.from(JSON.stringify(researchedDinners), "utf8").toString("base64");
  if (!/^[A-Za-z0-9+/=]+$/.test(payload)) throw new Error("Unsafe payload encoding.");
  // Base64 is an allowlisted SQL literal, not interpolated recipe prose. No schema
  // migrations, updates or deletes: Publish must supply prep_time beforehand.
  return `-- Twelve source-checked dinners. Additive data import; reviewed ${catalog.reviewedOn}.
-- First Publish the nullable preparation-time field. Do NOT overwrite production with development data.
-- Run in the intended database's SQL editor. Existing recipes are never replaced.
-- Human-readable records: server/seeds/researched-dinners.json
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE;
DO $tablewise_import$
DECLARE
  payload jsonb := convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb;
  originals jsonb;
  entry jsonb;
  actual jsonb;
  inserted_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'recipes'::regclass AND attname = 'prep_time' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Preparation-time storage is missing. Publish the development schema first; no recipes were imported.';
  END IF;
  SELECT coalesce(jsonb_object_agg(r.id, md5(to_jsonb(r)::text)), '{}'::jsonb)
    INTO originals FROM recipes r;
  IF EXISTS (
    SELECT 1 FROM recipes r JOIN jsonb_array_elements(payload) p
    ON r.source_url = p->>'sourceUrl' AND r.id <> p->>'id'
  ) THEN
    RAISE EXCEPTION 'A source already exists under another recipe ID. Review it rather than importing duplicates.';
  END IF;
  INSERT INTO recipes (id, title, ingredients, steps, image, source_url, prep_time, cook_time, servings, tags)
  SELECT id, title, ingredients, steps, image, "sourceUrl", "prepTime", "cookTime", servings, tags
  FROM jsonb_to_recordset(payload) AS incoming(
    id text, title text, ingredients text[], steps text[], image text,
    "sourceUrl" text, "prepTime" integer, "cookTime" integer, servings text, tags text[]
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  FOR entry IN SELECT value FROM jsonb_array_elements(payload) LOOP
    SELECT jsonb_build_object(
      'id',r.id,'title',r.title,'ingredients',r.ingredients,'steps',r.steps,
      'image',r.image,'sourceUrl',r.source_url,'prepTime',r.prep_time,
      'cookTime',r.cook_time,'servings',r.servings,'tags',r.tags
    ) INTO actual FROM recipes r WHERE r.id = entry->>'id';
    IF actual IS DISTINCT FROM entry THEN
      RAISE EXCEPTION 'An import ID has different existing content. Nothing from this import was committed.';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(originals) o
    LEFT JOIN recipes r ON r.id = o.key
    WHERE r.id IS NULL OR md5(to_jsonb(r)::text) IS DISTINCT FROM o.value
  ) THEN
    RAISE EXCEPTION 'An existing recipe changed during import. Nothing was committed.';
  END IF;
  RAISE NOTICE 'Imported % recipes; % already matched; all pre-existing records preserved.',
    inserted_count, jsonb_array_length(payload) - inserted_count;
END;
$tablewise_import$;
COMMIT;
SELECT count(*) AS total_recipes,
  count(*) FILTER (WHERE id LIKE 'tablewise:real:v1:%') AS researched_dinners,
  count(*) FILTER (WHERE id NOT LIKE 'tablewise:real:v1:%') AS preserved_other_recipes
FROM recipes;
`;
}
