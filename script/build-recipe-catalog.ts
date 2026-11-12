// One-time build of the TableWise built-in recipe catalog v1.
// Reads hand-authored structured sources (data/catalog/source/*.json), validates them against the
// real recipe API schema and catalog-quality rules, and writes the deterministic artifacts.
// Never connects to a database. Run: npx tsx script/build-recipe-catalog.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { recipeInput, recipeId } from "../server/request-schemas";
import { toPlannerRecipe } from "../client/src/lib/planner-recipes";
import { recipeToolKeys } from "../client/src/lib/recipe-tools";
import { scaleIngredient } from "../client/src/lib/ingredient-scale";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";
import { DIET_CHECKS } from "../shared/food-rules";
import { researchedDinners } from "../server/seeds/researched-import";

export const CATALOG_VERSION = "v1";
export const ID_PREFIX = "tablewise:catalog:v1:";
const AUTHORED_ON = "2026-11-11";
const DIR = "data/catalog";
const BATCHES = ["dinner-a", "dinner-b", "lunch", "breakfast", "dessert", "snack", "soup"];
export const DISTRIBUTION = { Dinner: 70, Lunch: 40, Breakfast: 35, Dessert: 25, Snack: 20, Soup: 10 } as const;
type Category = keyof typeof DISTRIBUTION;
const CATEGORY_ORDER = Object.keys(DISTRIBUTION) as Category[];
// Extra meal-slot tag so the existing planner (inferMealType) places the recipe sensibly.
const SLOT_TAG: Partial<Record<Category, string>> = { Soup: "Lunch", Snack: "Lunch box" };
export const EXPECTED_SLOT: Record<Category, string> = {
  Dinner: "Dinner", Lunch: "Lunch", Breakfast: "Breakfast", Dessert: "Dinner", Soup: "Lunch", Snack: "Lunch box",
};
const CUISINES = ["American", "British", "Caribbean", "Chinese", "French", "Greek", "Indian", "Italian", "Japanese", "Korean",
  "Mediterranean", "Mexican", "Middle Eastern", "North African", "Scandinavian", "Spanish", "Thai", "Vietnamese",
  "Eastern European", "International"];
const TAGS = ["Chicken", "Turkey", "Beef", "Pork", "Lamb", "Fish", "Seafood", "Vegetarian", "Vegan", "Gluten-free",
  "Dairy-free", "Kid friendly", "Budget", "Batch cooking", "Pasta", "Rice", "Potatoes", "Noodles", "Eggs", "Baking"];
const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "pinch", "clove", "cloves", "slice", "slices", "sprig", "sprigs", "sheet", "sheets", ""];

export type SourceIngredient = { quantity: number; unit: string; name: string; note?: string; optional?: boolean };
export type SourceRecipe = {
  slug: string; title: string; category: Category; cuisine: string; tags: string[];
  prepTime: number; cookTime: number; servings: string; ingredients: SourceIngredient[]; steps: string[];
};
export type CatalogRecipe = {
  id: string; slug: string; title: string; category: Category; cuisine: string;
  ingredients: string[]; steps: string[]; image: null; sourceUrl: null;
  prepTime: number; cookTime: number; servings: string; tags: string[];
  ingredientsStructured: SourceIngredient[];
};

export const renderIngredient = (i: SourceIngredient) =>
  [String(i.quantity), i.unit, i.name].filter(Boolean).join(" ") + (i.note ? `, ${i.note}` : "") + (i.optional ? ", optional" : "");

// ---- Dietary verification: every ingredient line, including optional extras, must pass (shared/food-rules.ts). ----
// Tags the app filters on that must agree with ingredients.
const PROTEIN_TAG: Record<string, RegExp> = {
  Chicken: /\bchicken\b(?! stock)/, Turkey: /\bturkey\b/, Beef: /\b(beef|steak)\b(?! stock)/, Pork: /\b(pork|bacon|ham|pancetta|chorizo)\b/,
  Lamb: /\blamb\b/, Fish: /\b(fish|salmon|cod|tuna|trout|mackerel|haddock)\b(?! sauce)/, Seafood: /\b(prawns?|shrimps?|crab|mussels|squid)\b/,
};

function words(text: string) { return new Set(text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").split(/[^a-z]+/).filter(w => w.length > 2)); }
export function jaccard(a: Set<string>, b: Set<string>) {
  let shared = 0; a.forEach(x => { if (b.has(x)) shared++; });
  return shared / (a.size + b.size - shared || 1);
}

/** Returns per-recipe errors (empty when valid). Pure: no I/O. */
export function checkRecipe(s: SourceRecipe): string[] {
  const e: string[] = [];
  const need = (ok: unknown, message: string) => { if (!ok) e.push(message); };
  need(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug ?? ""), "slug must be kebab-case");
  need(CATEGORY_ORDER.includes(s.category), `unknown category ${s.category}`);
  need(CUISINES.includes(s.cuisine), `unknown cuisine ${s.cuisine}`);
  need(Array.isArray(s.tags) && s.tags.every(t => TAGS.includes(t)) && new Set(s.tags).size === s.tags.length, `tags outside vocabulary: ${s.tags}`);
  need(Number.isInteger(s.prepTime) && s.prepTime >= 1 && s.prepTime <= 240, "prepTime must be 1–240 min");
  need(Number.isInteger(s.cookTime) && s.cookTime >= 0 && s.cookTime <= 600, "cookTime must be 0–600 min");
  need(/^[1-9]\d?$/.test(s.servings ?? ""), "servings must be a number 1–99");
  need(Array.isArray(s.ingredients) && s.ingredients.length >= 2 && s.ingredients.length <= 25, "2–25 ingredients");
  need(Array.isArray(s.steps) && s.steps.length >= 3 && s.steps.length <= 10, "3–10 steps");
  if (e.length) return e;
  for (const i of s.ingredients) {
    const where = `ingredient "${i.name}"`;
    need(typeof i.quantity === "number" && i.quantity > 0 && i.quantity <= 5000 && Math.round(i.quantity * 100) === i.quantity * 100, `${where}: quantity`);
    need(UNITS.includes(i.unit), `${where}: unit "${i.unit}"`);
    need(typeof i.name === "string" && i.name.trim().length >= 2 && i.name === i.name.trim(), `${where}: name`);
    need(!/\d/.test(i.name + (i.note ?? "")), `${where}: digits after the quantity block scaling`);
    need(!/\b(to taste|as needed|some|a few|handful)\b/i.test(i.name + " " + (i.note ?? "")), `${where}: vague quantity`);
    need(i.optional === undefined || typeof i.optional === "boolean", `${where}: optional flag`);
    const line = renderIngredient(i);
    need(scaleIngredient(line, 2) !== line, `${where}: app cannot scale "${line}"`);
  }
  need(s.ingredients.filter(i => !i.optional).length >= 2, "at least 2 essential ingredients");
  for (const [index, step] of s.steps.entries()) {
    need(step.trim().length >= 25 && step.length <= 700, `step ${index + 1}: length`);
    need(/[.!)]$/.test(step.trim()), `step ${index + 1}: incomplete sentence`);
    need(!/°F|fahrenheit|gas mark/i.test(step), `step ${index + 1}: temperatures must be °C`);
  }
  const lines = s.ingredients.map(i => renderIngredient(i).toLowerCase());
  const method = s.steps.join(" ");
  for (const tag of s.tags) {
    const check = DIET_CHECKS[tag];
    const bad = check ? lines.filter(l => !check(l)) : [];
    need(bad.length === 0, `${tag} tag contradicted by: ${bad.join(" | ")}`);
    if (PROTEIN_TAG[tag]) need(lines.some(l => PROTEIN_TAG[tag].test(l)), `${tag} tag without matching ingredient`);
  }
  if (s.tags.includes("Vegan")) need(s.tags.includes("Vegetarian"), "Vegan recipes must also be tagged Vegetarian");
  const essential = s.ingredients.filter(i => !i.optional).map(i => renderIngredient(i).toLowerCase());
  for (const [tag, pattern] of Object.entries(PROTEIN_TAG)) {
    if (essential.some(l => pattern.test(l))) need(s.tags.includes(tag), `contains ${tag.toLowerCase()} but lacks the ${tag} tag`);
  }
  // Food-safety doneness cues.
  const raw = (pattern: RegExp) => essential.some(l => pattern.test(l) && !/\b(cooked|smoked|stock|canned|tinned|leftover|deli|roast(ed)? .*slices)\b/.test(l));
  if (raw(/\b(chicken|turkey)\b/)) need(/74\s?°C/.test(method), "raw poultry needs a 74°C doneness check");
  if (raw(/\b(minced (beef|pork|lamb)|(beef|pork|lamb) mince|sausages?|sausagemeat)\b/)) need(/7[14]\s?°C/.test(method), "minced meat needs a 71°C doneness check");
  if (raw(/\b(salmon|cod|trout|haddock|mackerel|white fish|fish fillets?)\b/)) need(/63\s?°C|flakes?/.test(method), "fish needs a 63°C / flakes doneness cue");
  if (raw(/\b(prawns?|shrimps?)\b/)) need(/pink|opaque/.test(method), "prawns need a pink/opaque doneness cue");
  need(recipeToolKeys(s.steps).length > 0, "steps name no identifiable equipment");
  return e;
}

export function toCatalogRecipe(s: SourceRecipe): CatalogRecipe {
  const extra = [...(SLOT_TAG[s.category] ? [SLOT_TAG[s.category]!] : []), s.cuisine];
  const quick = s.prepTime + s.cookTime <= 30 ? ["Quick"] : [];
  const tags = [s.category, ...extra, ...TAGS.filter(t => s.tags.includes(t)), ...quick];
  return {
    id: ID_PREFIX + s.slug, slug: s.slug, title: s.title, category: s.category, cuisine: s.cuisine,
    ingredients: s.ingredients.map(renderIngredient), steps: s.steps.map(x => x.trim()), image: null, sourceUrl: null,
    prepTime: s.prepTime, cookTime: s.cookTime, servings: s.servings, tags, ingredientsStructured: s.ingredients,
  };
}

/** The exact row written to `recipes` (only columns present since migration 0002). */
export function dbRow(r: CatalogRecipe) {
  return { id: r.id, title: r.title, ingredients: r.ingredients, steps: r.steps, image: r.image, source_url: r.sourceUrl,
    prep_time: r.prepTime, cook_time: r.cookTime, servings: r.servings, tags: r.tags };
}

export function contentHash(rows: ReturnType<typeof dbRow>[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

/** Whole-catalog validation. Returns the report; `errors` empty means valid. */
export function validateCatalog(recipes: CatalogRecipe[], perRecipeErrors: Record<string, string[]> = {}) {
  const errors: string[] = Object.entries(perRecipeErrors).flatMap(([slug, list]) => list.map(m => `${slug}: ${m}`));
  const counts = Object.fromEntries(CATEGORY_ORDER.map(c => [c, recipes.filter(r => r.category === c).length]));
  if (recipes.length !== 200) errors.push(`expected 200 recipes, found ${recipes.length}`);
  for (const c of CATEGORY_ORDER) if (counts[c] !== DISTRIBUTION[c]) errors.push(`${c}: expected ${DISTRIBUTION[c]}, found ${counts[c]}`);
  const dup = <T,>(values: T[]) => values.filter((v, i) => values.indexOf(v) !== i);
  const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
  dup(recipes.map(r => r.id)).forEach(id => errors.push(`duplicate id ${id}`));
  dup(recipes.map(r => norm(r.title))).forEach(t => errors.push(`duplicate title ${t}`));
  dup(recipes.map(r => JSON.stringify([r.ingredients, r.steps]))).forEach(() => errors.push("exact duplicate recipe content"));
  const existing = [...dinnerCatalog, ...researchedDinners];
  const existingIds = new Set(existing.map(r => r.id));
  const existingTitles = new Map(existing.map(r => [norm(r.title), r.id]));
  for (const r of recipes) {
    if (!recipeId.safeParse(r.id).success || !r.id.startsWith(ID_PREFIX)) errors.push(`${r.slug}: invalid id`);
    if (existingIds.has(r.id)) errors.push(`${r.slug}: id collides with an existing seed`);
    if (existingTitles.has(norm(r.title))) errors.push(`${r.slug}: same title as existing ${existingTitles.get(norm(r.title))}`);
    const parsed = recipeInput.safeParse({ title: r.title, ingredients: r.ingredients, steps: r.steps, image: r.image,
      sourceUrl: r.sourceUrl, prepTime: r.prepTime, cookTime: r.cookTime, servings: r.servings, tags: r.tags });
    if (!parsed.success) errors.push(`${r.slug}: recipe API schema: ${parsed.error.issues.map(i => i.path.join(".") + " " + i.message).join("; ")}`);
    const slot = toPlannerRecipe({ ...r, createdAt: new Date(), updatedAt: new Date(), stepAnalysis: null } as never).mealType;
    if (slot !== EXPECTED_SLOT[r.category]) errors.push(`${r.slug}: planner would place "${r.title}" in ${slot}, expected ${EXPECTED_SLOT[r.category]}`);
  }
  // Near-duplicate detection on essential ingredient names.
  // Same ingredients alone is not a duplicate (pancakes vs waffles); same ingredients AND same method is.
  const sets = recipes.map(r => words(r.ingredientsStructured.filter(i => !i.optional).map(i => i.name).join(" ")));
  const methods = recipes.map(r => words(r.steps.join(" ")));
  const similar: { a: string; b: string; ingredientSimilarity: number; methodSimilarity: number }[] = [];
  const round = (n: number) => Math.round(n * 100) / 100;
  for (let i = 0; i < recipes.length; i++) for (let j = i + 1; j < recipes.length; j++) {
    const score = jaccard(sets[i], sets[j]);
    if (score >= 0.6) similar.push({ a: recipes[i].slug, b: recipes[j].slug, ingredientSimilarity: round(score), methodSimilarity: round(jaccard(methods[i], methods[j])) });
  }
  similar.filter(p => p.ingredientSimilarity >= 0.85 && p.methodSimilarity >= 0.6).forEach(p => errors.push(`near-duplicate recipes ${p.a} / ${p.b}`));
  const tagCount = (t: string) => recipes.filter(r => r.tags.includes(t)).length;
  return {
    totalRecipes: recipes.length, categoryCounts: counts, expectedDistribution: DISTRIBUTION,
    duplicateChecks: { uniqueIds: new Set(recipes.map(r => r.id)).size, uniqueTitles: new Set(recipes.map(r => norm(r.title))).size,
      collisionsWithExistingSeeds: errors.filter(x => /existing/.test(x)).length, similarPairsReported: similar },
    coverage: Object.fromEntries([...TAGS, "Quick"].map(t => [t, tagCount(t)])),
    cuisines: Object.fromEntries(CUISINES.map(c => [c, recipes.filter(r => r.cuisine === c).length]).filter(([, n]) => n)),
    ingredientQuality: { totalLines: recipes.reduce((n, r) => n + r.ingredients.length, 0),
      allQuantifiedAndScalable: !errors.some(x => /ingredient/.test(x)) },
    cookingSteps: { totalSteps: recipes.reduce((n, r) => n + r.steps.length, 0), minPerRecipe: Math.min(...recipes.map(r => r.steps.length)),
      maxPerRecipe: Math.max(...recipes.map(r => r.steps.length)) },
    errors,
  };
}

const sourceFile = new Map<string, string>();
export function loadSources(): SourceRecipe[] {
  return BATCHES.flatMap(b => {
    const list = JSON.parse(readFileSync(`${DIR}/source/${b}.json`, "utf8")) as SourceRecipe[];
    list.forEach(s => sourceFile.set(s.slug, `${DIR}/source/${b}.json`));
    return list;
  });
}

export function buildCatalog() {
  const sources = loadSources();
  const perRecipe: Record<string, string[]> = {};
  for (const s of sources) { const e = checkRecipe(s); if (e.length) perRecipe[s.slug ?? s.title] = e; }
  const recipes = sources.map(toCatalogRecipe)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.slug.localeCompare(b.slug));
  return { recipes, report: validateCatalog(recipes, perRecipe) };
}

// ---- SQL import: one atomic DO block; inserts missing IDs, verifies every catalog ID, never updates/deletes. ----
export function catalogSQL(rows: ReturnType<typeof dbRow>[], hash: string) {
  const payload = Buffer.from(JSON.stringify(rows), "utf8").toString("base64");
  if (!/^[A-Za-z0-9+/=]+$/.test(payload)) throw new Error("Unsafe payload encoding.");
  return `-- TableWise built-in recipe catalog ${CATALOG_VERSION}: ${rows.length} recipes. Generated by script/build-recipe-catalog.ts.
-- Content SHA-256 (canonical JSON of rows): ${hash}
-- Additive only: inserts missing ${ID_PREFIX}* rows; never updates or deletes. Any ID holding
-- different content, or any change to a pre-existing row, aborts the whole import.
-- Dry run (verifies, then rolls back): SET tablewise.dry_run = 'on'; before running this file,
-- or PGOPTIONS='-c tablewise.dry_run=on' psql ... -f this-file. See docs/recipe-catalog-import.md.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE;
DO $tablewise_catalog$
DECLARE
  payload jsonb := convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb;
  before_hash text;
  after_hash text;
  inserted_count integer;
  mismatched integer;
BEGIN
  IF jsonb_array_length(payload) <> ${rows.length} THEN RAISE EXCEPTION 'Corrupt payload.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'recipes'::regclass AND attname = 'prep_time' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'recipes.prep_time is missing: apply migration 0002 first. Nothing imported.';
  END IF;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.id), '')) INTO before_hash
    FROM recipes r WHERE r.id NOT LIKE '${ID_PREFIX}%';
  INSERT INTO recipes (id, title, ingredients, steps, image, source_url, prep_time, cook_time, servings, tags)
  SELECT id, title, ingredients, steps, image, source_url, prep_time, cook_time, servings, tags
  FROM jsonb_to_recordset(payload) AS p(id text, title text, ingredients text[], steps text[], image text,
    source_url text, prep_time integer, cook_time integer, servings text, tags text[])
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT count(*) INTO mismatched FROM jsonb_array_elements(payload) e
  WHERE NOT EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = e->>'id' AND jsonb_build_object(
      'id', r.id, 'title', r.title, 'ingredients', r.ingredients, 'steps', r.steps, 'image', r.image,
      'source_url', r.source_url, 'prep_time', r.prep_time, 'cook_time', r.cook_time, 'servings', r.servings, 'tags', r.tags) = e);
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'Conflict: % catalog ID(s) already hold different content. Nothing from this import was committed.', mismatched;
  END IF;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.id), '')) INTO after_hash
    FROM recipes r WHERE r.id NOT LIKE '${ID_PREFIX}%';
  IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'A pre-existing recipe changed during import. Nothing committed.'; END IF;
  IF current_setting('tablewise.dry_run', true) = 'on' THEN
    RAISE EXCEPTION 'DRY RUN OK: would insert % recipe(s); % already present with identical content. Rolled back.',
      inserted_count, ${rows.length} - inserted_count;
  END IF;
  RAISE NOTICE 'Catalog ${CATALOG_VERSION}: inserted %, already present %, other recipes preserved.', inserted_count, ${rows.length} - inserted_count;
END;
$tablewise_catalog$;
COMMIT;
SELECT count(*) FILTER (WHERE id LIKE '${ID_PREFIX}%') AS catalog_v1_recipes,
       count(*) FILTER (WHERE id NOT LIKE '${ID_PREFIX}%') AS other_recipes FROM recipes;
`;
}

function main() {
  const { recipes, report } = buildCatalog();
  if (report.errors.length) {
    console.error(`Catalog invalid (${report.errors.length} problems):\n` + report.errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  const rows = recipes.map(dbRow);
  const hash = contentHash(rows);
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  writeFileSync(`${DIR}/tablewise-recipes-${CATALOG_VERSION}.json`, json({
    catalog: "tablewise-recipes", version: CATALOG_VERSION, idPrefix: ID_PREFIX, recipeCount: recipes.length,
    contentSha256: hash, note: "Source of truth. `ingredients` is the stored string[]; `ingredientsStructured` is reference metadata only.",
    recipes,
  }));
  writeFileSync(`${DIR}/tablewise-recipes-${CATALOG_VERSION}.sql`, catalogSQL(rows, hash));
  writeFileSync(`${DIR}/tablewise-recipes-${CATALOG_VERSION}-sources.json`, json({
    catalog: `tablewise-recipes-${CATALOG_VERSION}`,
    sources: [{
      sourceId: "tablewise-original",
      kind: "Original recipes authored for TableWise",
      license: "Proprietary TableWise content (no third-party licence obligations)",
      attribution: "TableWise",
      method: "Written for this catalog from general culinary knowledge (common dish names, standard techniques, food-safety temperatures). No third-party recipe text, datasets, scraped pages or photographs were used. Authored with AI assistance inside the development session; no paid external API was called.",
      authoredOn: AUTHORED_ON,
      reviewRequired: "Human culinary review recommended before production publication; see validation report.",
    }],
    images: "None. Every recipe has image = null and uses the app's existing no-image fallback.",
    nutrition: "None stored. No nutrition values were calculated or invented.",
    recipes: recipes.map(r => ({ id: r.id, title: r.title, sourceId: "tablewise-original", sourceUrl: null,
      license: "Proprietary TableWise content", attribution: "TableWise", sourceFile: sourceFile.get(r.slug) })),
  }));
  const reportPath = `${DIR}/tablewise-recipes-${CATALOG_VERSION}-validation.json`;
  let restoreVerification: unknown = "not yet run: script/recipe-catalog-db.sh";
  try { restoreVerification = JSON.parse(readFileSync(reportPath, "utf8")).restoreVerification ?? restoreVerification; } catch { /* first build */ }
  writeFileSync(reportPath, json({
    catalog: `tablewise-recipes-${CATALOG_VERSION}`, contentSha256: hash,
    schemaValidation: "Every recipe passed server/request-schemas.ts recipeInput (the recipe API contract) and the recipes table constraints.",
    licenseVerification: { allRecipesHaveSource: true, thirdPartyContent: 0, images: 0 },
    dietaryVerification: "Vegetarian/Vegan/Gluten-free/Dairy-free tags are machine-checked against every ingredient line (script/build-recipe-catalog.ts DIET_CHECKS); packaged items must be named gluten-free/plant-based explicitly. Not a substitute for allergen labelling on purchased products.",
    plannerCompatibility: "Planner meal slot computed with the app's own toPlannerRecipe() for every recipe: Breakfast→Breakfast, Lunch/Soup→Lunch, Snack→Lunch box, Dinner/Dessert→Dinner.",
    ...report, missingFields: [], restoreVerification,
  }));
  console.log(`Built ${recipes.length} recipes; content sha256 ${hash}. No database was touched.`);
}

if (process.argv[1]?.endsWith("build-recipe-catalog.ts")) main();
