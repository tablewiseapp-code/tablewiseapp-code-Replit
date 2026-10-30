import assert from "node:assert/strict";
import {
  defaultMealFilters, ingredientMatches, matchesMealFilters, mealFilterPreferenceKey,
  parseMealFilterPreference, readMealFilterPreference, recipeClassification,
  saveMealFilterPreference, type MealFilters,
} from "../client/src/lib/meal-filters";
import { assignDinner, canConfirm, confirmPlan, emptyPlan, plannerRecipeURL, recipePlannerURL, toggleDinner, weekPlanSchema } from "../client/src/lib/week-plan";
import { buildGroceries } from "../client/src/lib/grocery-engine";
import type { Recipe } from "../client/src/lib/storage";
import { readFileSync } from "node:fs";

const base: Recipe = {
  id: "breakfast", title: "A regression fixture, not a sourced recipe",
  ingredients: ["2 eggs", "1 tbsp COCONUT   milk", "1 red bell pepper", "מלח", "лук репчатый"],
  tags: ["meal:breakfast", "Lunch", "suitability:school-lunchbox"],
  prepTime: 0, cookTime: 20, steps: [], createdAt: "", updatedAt: "",
};
const match = (patch: Partial<MealFilters>, recipe = base, mode: "preparation" | "total" = "total") =>
  matchesMealFilters(recipe, { ...defaultMealFilters(), ...patch }, mode);
assert.deepEqual(recipeClassification(base.tags), { mealTypes: ["breakfast", "lunch"], lunchbox: ["school-lunchbox", "lunchbox"] });
assert.deepEqual(recipeClassification(["omelette", "breakfast-friendly", "toString", "kidFriendly"]), { mealTypes: [], lunchbox: [] });
assert.equal(match({ mealTypes: ["dinner", "lunch"] }), true);
assert.equal(match({ mealTypes: ["dinner"] }), false);
assert.equal(match({ lunchbox: "lunchbox" }), true);
assert.equal(match({ lunchbox: "school-lunchbox" }, { ...base, tags: ["lunchbox"] }), false);
assert.equal(match({}, { ...base, tags: null }), true);
assert.equal(match({ mealTypes: ["dinner"] }, { ...base, title: "Dinner salad omelette", tags: [] }), false);
assert.equal(match({ mealTypes: ["lunch"] }, { ...base, tags: ["suitability:lunchbox"] }), false);
assert.equal(match({ maxMinutes: 15 }), false);
assert.equal(match({ maxMinutes: 15 }, base, "preparation"), true);
assert.equal(match({ maxMinutes: 20 }), true);
for (const bad of [null, undefined, -1, NaN, Infinity, 1.5]) {
  const recipe = { ...base, prepTime: bad };
  assert.equal(match({}, recipe), true);
  assert.equal(match({ maxMinutes: 60 }, recipe), false);
}
assert.equal(match({ maxMinutes: 15 }, { ...base, prepTime: 0, cookTime: 0 }), true);
assert.equal(match({ maxMinutes: 15 }, { ...base, prepTime: 0, cookTime: null }), false);
assert.equal(match({ maxMinutes: 15 }, { ...base, prepTime: 0, cookTime: null }, "preparation"), true);
for (const [line, term, expected] of [
  ["coconut", "nut", false], ["nut oil", "nut", true], ["walnuts", "nut", false],
  ["RED \n bell  pepper, diced", " red bell pepper ", true],
  ["red bell peppers", "red bell pepper", false], ["peppercorn", "pepper", false],
  ["лук репчатый", "ЛУК", true], ["чеснок", "снок", false], ["מלח דק", "מלח", true],
  ["חלב", "לב", false], ["a+b (powder)", "a+b", true], ["aXb", "a+b", false],
  ["ＮＵＴ oil", "nut", true],
] as const) assert.equal(ingredientMatches(line, term), expected, `${line} / ${term}`);
assert.equal(match({ mustInclude: ["eggs", "red bell pepper"] }), true);
assert.equal(match({ mustInclude: ["eggs", "tomato"] }), false);
assert.equal(match({ mustInclude: ["eggs"], mustExclude: ["EGGS"] }), false);
assert.equal(match({ mustExclude: ["nut"] }), true);
assert.equal(match({ mustExclude: ["coconut milk"] }), false);
assert.equal(match({ mustInclude: ["milk"], mealTypes: ["lunch"], lunchbox: "lunchbox", maxMinutes: 20 }), true);
assert.equal(match({ mustInclude: ["milk"], mealTypes: ["dinner"], lunchbox: "lunchbox", maxMinutes: 20 }), false);
assert.equal(match({ mustInclude: ["eggs red"] }), false, "phrases must not bridge ingredient lines");

const serialize = (filters: MealFilters) => JSON.stringify({ version: 1, filters });
for (const raw of [null, "", "{", "null", "[]", "x".repeat(30_001),
  JSON.stringify({ version: 2, filters: defaultMealFilters() }),
  serialize({ ...defaultMealFilters(), maxMinutes: 17 } as unknown as MealFilters),
  serialize({ ...defaultMealFilters(), mustInclude: [42] } as unknown as MealFilters),
  serialize({ ...defaultMealFilters(), mealTypes: ["snack"] } as unknown as MealFilters),
]) assert.deepEqual(parseMealFilterPreference(raw), defaultMealFilters());
assert.deepEqual(parseMealFilterPreference(serialize({ ...defaultMealFilters(), mustInclude: [" Eggs ", "EGGS", " "], mealTypes: ["lunch", "lunch"] })),
  { ...defaultMealFilters(), mustInclude: ["eggs"], mealTypes: ["lunch"] });
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
} });
assert.equal(saveMealFilterPreference({ ...defaultMealFilters(), lunchbox: "lunchbox" }), true);
assert.equal(readMealFilterPreference().lunchbox, "lunchbox");
assert.deepEqual([...memory.keys()], [mealFilterPreferenceKey]);
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
assert.deepEqual(readMealFilterPreference(), defaultMealFilters());
assert.equal(saveMealFilterPreference(defaultMealFilters()), false);

const week = "2026-10-19";
const recipes = [base, { ...base, id: "lunch", tags: ["Lunch"] }, { ...base, id: "unknown", tags: [] }];
let plan = emptyPlan(week);
for (const [index, recipe] of recipes.entries()) {
  plan = assignDinner(toggleDinner(plan, recipe.id), recipe.id, `2026-10-${19 + index}`);
}
assert.equal(canConfirm(plan), true, "breakfast, lunch and unclassified meals can be confirmed");
plan = confirmPlan(plan);
const saved = JSON.stringify(plan);
assert.equal(recipes.filter(r => match({ mealTypes: ["dinner"] }, r)).length, 0);
assert.equal(JSON.stringify(plan), saved);
assert.equal(canConfirm(plan), true);
assert.deepEqual(weekPlanSchema.parse(JSON.parse(saved)), plan);
assert.equal(buildGroceries(plan, recipes).recipeTitles.length, 3);
assert.ok(buildGroceries(plan, recipes).items.length > 0);
assert.equal(recipePlannerURL(new URL(plannerRecipeURL(base.id, week), "https://test.invalid").search), `/plan?week=${week}`);
const researched = JSON.parse(readFileSync("imports/researched-dinners.json", "utf8")) as Recipe[];
assert.equal(researched.length, 12);
assert.equal(researched.filter(r => match({}, r)).length, 12);
assert.equal(researched.filter(r => match({ mealTypes: ["dinner"] }, r)).length, 12);
assert.equal(researched.filter(r => match({ mealTypes: ["breakfast"] }, r)).length, 0);
assert.equal(researched.filter(r => match({ lunchbox: "school-lunchbox" }, r)).length, 0);
console.log("Meal filter logic, category mapping, boundaries, timing, preference recovery and plan/grocery compatibility passed. No database access.");
