import assert from "node:assert/strict";
import { addBatch, cookedOn, emptyPlan, removeBatch, servedFrom, setServes, type PlanState } from "../client/src/lib/meal-plan";
import { generateMeals, searchTerms, type GeneratorInput } from "../client/src/lib/meal-generator";
import { defaultSettings } from "../client/src/lib/basic-settings";
import type { EngineRecipe } from "../client/src/lib/preference-engine";
import { buildRecipeGroceryRows, groceryMeasure } from "../client/src/lib/grocery-meal-removal";
import { buildShoppingList } from "../client/src/lib/grocery-items";

// Today: dishes cooked today, then dishes cooked earlier that are eaten today.
let plan: PlanState = emptyPlan("2026-11-16");
plan = addBatch(plan, "b", "2026-11-17", null, "b1");
plan = setServes(addBatch(plan, "a", "2026-11-16", null, "a1"), "a1", [{ date: "2026-11-16" }, { date: "2026-11-17" }]); // leftovers cover Tuesday too
plan = addBatch(plan, "c", "2026-11-18", null, "c1");
assert.deepEqual(cookedOn(plan, "2026-11-17").map(b => b.recipeId), ["b"], "cooked today");
assert.deepEqual(servedFrom(plan, "2026-11-17").map(b => b.recipeId), ["a"], "cooked Monday, eaten today");
assert.deepEqual([...cookedOn(plan, "2026-11-22"), ...servedFrom(plan, "2026-11-22")], [], "nothing on Sunday");

const recipes = [{ id: "a", title: "A", ingredients: ["2 eggs", "Salt"] }, { id: "b", title: "B", ingredients: ["salt"] }];
const rows = buildRecipeGroceryRows(plan.batches, recipes);
const { activeRows, purchasedRows } = buildShoppingList(rows, [{ id: "x", text: "SALT" }, { id: "y", text: "Milk" }],
  new Set(["1 eggs", "extra:y"]), new Set([groceryMeasure("Salt").identity]));
assert.deepEqual(activeRows.map(row => row.ingredient).sort(), ["1 eggs", "SALT"], "count partial purchases, skip hidden ingredients, and keep manual items independent");
assert.equal(purchasedRows.length, 2);

// + Add a dish (generator): a new dish cooked today, beside any already there; Undo removes only that dish.
const empty = emptyPlan("2026-11-16");
const added = addBatch(empty, "eggs", "2026-11-19", { adults: 2, kids: 1 }, "g1");
assert.deepEqual(added.batches, [{ id: "g1", recipeId: "eggs", cookDate: "2026-11-19", serves: [{ date: "2026-11-19", adults: 2, kids: 1 }] }]);
const second = addBatch(added, "soup", "2026-11-19", null, "g2");
assert.deepEqual(cookedOn(second, "2026-11-19").map(b => b.recipeId), ["eggs", "soup"], "two dishes on one day");
assert.deepEqual(removeBatch(second, "g1").batches.map(b => b.id), ["g2"], "Undo removes only the added dish");

// Catalog generator: restrictions are never relaxed; time and search words narrow; style orders.
assert.deepEqual(searchTerms("Something savory with eggs and potatoes"), ["egg", "potato"]);
const r = (id: string, mealType: string, minutes: number | null, ingredients: string[], tags: string[] = [], stepCount = 3): EngineRecipe =>
  ({ id, title: id, mealType, ingredients, tags, prepTime: minutes, cookTime: minutes === null ? null : 0, deviceRequirements: [], stepCount });
const catalog = [
  r("hash", "Breakfast", 15, ["4 eggs", "500 g potatoes"], ["Gluten-free"]),
  r("toast", "Breakfast", 10, ["2 eggs", "4 slices bread"]),
  r("frittata", "Breakfast", 40, ["8 eggs", "2 potatoes", "1 onion", "cheese", "herbs"], ["Gluten-free"], 9),
  r("congee", "Breakfast", null, ["1 cup rice", "water"], ["Gluten-free"]),
  r("stew", "Dinner", 15, ["potatoes", "eggs"], ["Gluten-free"]),
];
const input: GeneratorInput = { meal: "Breakfast", day: 4, query: "", maxMinutes: null, style: "quick", servings: 5, diets: ["glutenFree"] };
const ids = (patch: Partial<GeneratorInput>) => generateMeals(catalog, defaultSettings(), { ...input, ...patch });
assert.deepEqual(ids({}).recipes.map(x => x.id).sort(), ["congee", "frittata", "hash"], "breakfast only; gluten-free needs the tag");
assert.deepEqual(ids({ query: "eggs and potatoes", maxMinutes: 15 }).recipes.map(x => x.id), ["hash"], "exactly 15 minutes passes; unknown time never does");
assert.equal(ids({ query: "eggs and potatoes", style: "chef" }).recipes[0].id, "frittata", "Chef challenge favours the most involved");
assert.equal(ids({ query: "pancakes" }).noMatch, "search");
assert.equal(ids({ maxMinutes: 15, query: "rice" }).noMatch, "search");
assert.equal(ids({ meal: "Lunch" }).noMatch, "restrictions");
assert.equal(generateMeals([catalog[2]], defaultSettings(), { ...input, maxMinutes: 30 }).noMatch, "time");
{ // Devices edited for this meal replace the household's, only here.
  const { generatorSettings } = await import("../client/src/lib/meal-generator");
  const s = { ...defaultSettings(), kitchen: { devices: ["Oven" as const] } };
  assert.deepEqual(generatorSettings(s, input).kitchen.devices, ["Oven"], "no edit keeps the household's devices");
  assert.deepEqual(generatorSettings(s, { ...input, devices: ["Stovetop"] }).kitchen.devices, ["Stovetop"], "edited devices apply");
  assert.deepEqual(s.kitchen.devices, ["Oven"], "Basic Settings unchanged");
}
console.log("home: ok");
