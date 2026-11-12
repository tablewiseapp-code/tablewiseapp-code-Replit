// Data-quality and app-integration checks for built-in catalog v1. No database, no network.
// Run: npx tsx script/test-recipe-catalog.ts   (DB/restore/browser checks: bash script/recipe-catalog-db.sh)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog, checkRecipe, dbRow, contentHash, DISTRIBUTION, EXPECTED_SLOT, ID_PREFIX, type CatalogRecipe, type SourceRecipe } from "./build-recipe-catalog";
import { toPlannerRecipes } from "../client/src/lib/planner-recipes";
import { matchesPlannerFilters, type PlannerFilters } from "../client/src/lib/planner-filters";
import { buildGroceries } from "../client/src/lib/grocery-engine";
import { weekPlanSchema, weekDays } from "../client/src/lib/week-plan";
import { scaleIngredient, baseServings } from "../client/src/lib/ingredient-scale";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";
import { methodChoices } from "../client/src/lib/basic-settings";
import { satisfiesDevices, selectableDevices } from "../client/src/lib/device-requirements";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`PASS ${name}`); };
const file = JSON.parse(readFileSync("data/catalog/tablewise-recipes-v1.json", "utf8"));
const recipes: CatalogRecipe[] = file.recipes;

test("canonical JSON is reproducible from the authored sources", () => {
  const { recipes: rebuilt, report } = buildCatalog();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(rebuilt, recipes);
  assert.equal(contentHash(recipes.map(dbRow)), file.contentSha256);
});
test("exactly 200 recipes in the required distribution", () => {
  assert.equal(recipes.length, 200);
  for (const [category, count] of Object.entries(DISTRIBUTION)) assert.equal(recipes.filter(r => r.category === category).length, count, category);
});
test("unique stable namespaced IDs, unique titles, no collision with existing seeds", () => {
  assert.equal(new Set(recipes.map(r => r.id)).size, 200);
  assert.ok(recipes.every(r => r.id === ID_PREFIX + r.slug && /^[a-z0-9-]+$/.test(r.slug)));
  assert.equal(new Set(recipes.map(r => r.title.toLowerCase())).size, 200);
  assert.ok(!dinnerCatalog.some(d => recipes.some(r => r.id === d.id)));
});
test("every recipe has titles, quantified ingredients, steps, times, servings, tags, null image/source", () => {
  for (const r of recipes) {
    assert.ok(r.title.trim() && r.ingredients.length >= 2 && r.steps.length >= 4, r.slug);
    assert.ok(Number.isInteger(r.prepTime) && r.prepTime > 0 && Number.isInteger(r.cookTime) && r.cookTime >= 0, r.slug);
    assert.ok(baseServings(r.servings)! > 0, r.slug);
    assert.ok(r.ingredients.every(line => /^\d+(\.\d+)? /.test(line) && scaleIngredient(line, 2) !== line), r.slug);
    assert.equal(r.tags[0], r.category);
    assert.equal(r.image, null); assert.equal(r.sourceUrl, null);
  }
});
test("source and licence manifest covers every recipe", () => {
  const manifest = JSON.parse(readFileSync("data/catalog/tablewise-recipes-v1-sources.json", "utf8"));
  const sources = new Set(manifest.sources.map((s: { sourceId: string }) => s.sourceId));
  assert.deepEqual(manifest.recipes.map((m: { id: string }) => m.id).sort(), recipes.map(r => r.id).sort());
  assert.ok(manifest.recipes.every((m: { sourceId: string; license: string; sourceFile: string }) => sources.has(m.sourceId) && m.license && m.sourceFile));
});
test("validator rejects false dietary tags, vague/unscalable lines, °F and missing doneness checks", () => {
  const base: SourceRecipe = { slug: "probe", title: "Probe", category: "Dinner", cuisine: "British", tags: [], prepTime: 5, cookTime: 20, servings: "4",
    ingredients: [{ quantity: 500, unit: "g", name: "chicken thighs" }, { quantity: 1, unit: "tbsp", name: "olive oil" }, { quantity: 200, unit: "g", name: "plain flour" }],
    steps: ["Heat the oven to 200°C and oil a baking tray.", "Roast the chicken for 25 minutes until it reaches 74°C.", "Serve hot with the flatbreads made from the flour."] };
  assert.deepEqual(checkRecipe({ ...base, tags: ["Chicken"] }), []);
  const fails = (patch: Partial<SourceRecipe>, pattern: RegExp) => assert.ok(checkRecipe({ ...base, tags: ["Chicken"], ...patch }).some(e => pattern.test(e)), String(pattern));
  fails({ tags: ["Chicken", "Vegetarian"] }, /Vegetarian tag contradicted/);
  fails({ tags: ["Chicken", "Gluten-free"] }, /Gluten-free tag contradicted/);
  fails({ tags: [] }, /lacks the Chicken tag/);
  fails({ steps: base.steps.map(s => s.replace("74°C", "cooked")) }, /74°C/);
  fails({ steps: base.steps.map(s => s.replace("200°C", "400°F")) }, /°C/);
  fails({ ingredients: [...base.ingredients, { quantity: 1, unit: "", name: "onion", note: "cut into 2 cm dice" }] }, /digits/);
  fails({ ingredients: [...base.ingredients, { quantity: 1, unit: "", name: "parsley", note: "to taste" }] }, /vague/);
});
test("planner places every recipe in the expected meal slot and filters by meal type and diet", () => {
  const stored = recipes.map(r => ({ ...dbRow(r), sourceUrl: null, prepTime: r.prepTime, cookTime: r.cookTime, createdAt: new Date(), updatedAt: new Date() }));
  const planner = toPlannerRecipes(stored as never);
  const none: PlannerFilters = { maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false,
    modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [] };
  const meta = { isMyPick: false, rating: null };
  planner.forEach((p, i) => assert.equal(p.mealType, EXPECTED_SLOT[recipes[i].category], recipes[i].slug));
  const breakfast = planner.filter(p => matchesPlannerFilters(p, { ...none, mealType: ["Breakfast"] }, "total", meta));
  assert.equal(breakfast.length, DISTRIBUTION.Breakfast);
  const glutenFree = planner.filter(p => matchesPlannerFilters(p, { ...none, dietary: ["Gluten-free"] }, "total", meta));
  assert.deepEqual(glutenFree.map(p => p.id), recipes.filter(r => r.tags.includes("Gluten-free")).map(r => r.id));
  const quick = planner.filter(p => matchesPlannerFilters(p, { ...none, maxMinutes: 30 }, "total", meta));
  assert.ok(quick.length >= recipes.filter(r => r.tags.includes("Quick")).length);
});
test("My Basic Settings: only owned devices are offered and recipes needing other devices are hidden", () => {
  const stored = recipes.map(r => ({ ...dbRow(r), sourceUrl: null, prepTime: r.prepTime, cookTime: r.cookTime, createdAt: new Date(), updatedAt: new Date() }));
  const planner = toPlannerRecipes(stored as never);
  assert.deepEqual(methodChoices(["Stovetop", "Microwave"]), ["Stovetop", "Microwave", "No-cook"]);
  assert.ok(planner.every(p => satisfiesDevices(p.deviceRequirements, selectableDevices)), "all devices hides nothing");
  const visible = planner.filter(p => satisfiesDevices(p.deviceRequirements, ["Stovetop", "Microwave"]));
  assert.ok(visible.length > 0 && visible.length < planner.length);
  assert.ok(visible.every(p => !p.deviceRequirements.some(g => g.every(d => d === "Oven" || d === "Air fryer"))));
  assert.ok(planner.filter(p => satisfiesDevices(p.deviceRequirements, [])).every(p => p.deviceRequirements.length === 0));
});
test("grocery list builds from a confirmed plan of catalog dinners and merges measured lines", () => {
  const week = "2026-11-09";
  const chosen = recipes.filter(r => r.category === "Dinner").slice(0, 3);
  const plan = weekPlanSchema.parse({ version: 1, weekStart: week, selectedRecipeIds: chosen.map(r => r.id),
    assignments: Object.fromEntries(chosen.map((r, i) => [r.id, weekDays(week)[i]])), confirmed: true });
  const result = buildGroceries(plan, recipes);
  assert.deepEqual(result.missingRecipeIds, []);
  assert.deepEqual(result.recipeTitles, chosen.map(r => r.title));
  const lines = result.items.flatMap(i => i.sources).length;
  assert.equal(lines, chosen.reduce((n, r) => n + r.ingredients.length, 0));
  assert.ok(result.items.every(i => i.category && i.text));
});
test("SQL import is additive only", () => {
  const raw = readFileSync("data/catalog/tablewise-recipes-v1.sql", "utf8");
  const sql = raw.replace(/^--.*$/gm, "");
  assert.ok(!/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER)\b/i.test(sql));
  assert.ok(sql.includes("ON CONFLICT (id) DO NOTHING"));
  assert.ok(raw.includes(file.contentSha256));
});
console.log(`All ${passed} catalog tests passed.`);
