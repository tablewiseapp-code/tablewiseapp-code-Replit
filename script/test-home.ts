import assert from "node:assert/strict";
import { addToPlan, mealsOnDay, occupant, removeAt, undoAdd, type PlanState } from "../client/src/lib/meal-plan";
import { generateMeals, searchTerms, type GeneratorInput } from "../client/src/lib/meal-generator";
import { defaultSettings } from "../client/src/lib/basic-settings";
import type { EngineRecipe } from "../client/src/lib/preference-engine";
import { buildRecipeGroceryRows, groceryMeasure } from "../client/src/lib/grocery-meal-removal";
import { buildShoppingList } from "../client/src/lib/grocery-items";

const plan: PlanState = { selectedIds: ["a", "b", "c"], planAssignments: [
  { recipeId: "b", mealType: "Dinner", startDay: 2, spanDays: 1 },
  { recipeId: "a", mealType: "Breakfast", startDay: 1, spanDays: 2 }, // leftovers cover Tuesday too
  { recipeId: "c", mealType: "Lunch", startDay: 3, spanDays: 1 },
] };
assert.deepEqual(mealsOnDay(plan, 2).map(a => a.recipeId), ["a", "b"], "today's meals in Breakfast, Lunch, Dinner order");
assert.deepEqual(mealsOnDay(plan, 0), [], "nothing on Sunday");

const recipes = [{ id: "a", title: "A", ingredients: ["2 eggs", "Salt"] }, { id: "b", title: "B", ingredients: ["salt"] }];
const rows = buildRecipeGroceryRows(plan, recipes);
const { activeRows, purchasedRows } = buildShoppingList(rows, [{ id: "x", text: "SALT" }, { id: "y", text: "Milk" }],
  new Set(["1 eggs", "extra:y"]), new Set([groceryMeasure("Salt").identity]));
assert.deepEqual(activeRows.map(row => row.ingredient).sort(), ["1 eggs", "SALT"], "count partial purchases, skip hidden ingredients, and keep manual items independent");
assert.equal(purchasedRows.length, 2);

// + Add breakfast: the generated recipe goes to exactly that weekday and meal; Undo reverses only that assignment.
const empty: PlanState = { selectedIds: [], planAssignments: [] };
const request = { recipeId: "eggs", day: 4, meal: "Breakfast" as const, servings: 5 };
const added = addToPlan(empty, request);
assert.deepEqual(added.planAssignments, [{ recipeId: "eggs", mealType: "Breakfast", startDay: 4, spanDays: 1, servings: 5 }], "Thursday breakfast, 5 servings");
assert.deepEqual(mealsOnDay(added, 4).map(a => a.recipeId), ["eggs"], "Home (today = Thursday) and the Week read the same assignment");
assert.equal(addToPlan(added, request), added, "a second tap adds nothing");
assert.deepEqual(undoAdd(added, empty, request), empty, "Undo removes the assignment and the shortlist entry");
assert.equal(undoAdd(removeAt(addToPlan(added, { recipeId: "toast", day: 4, meal: "Breakfast" }, true), "Breakfast", 9), empty, request), null, "a later edit is never undone");
const withLunch = addToPlan(added, { recipeId: "soup", day: 4, meal: "Lunch" });
assert.deepEqual(undoAdd(withLunch, empty, request)!.planAssignments.map(a => a.recipeId), ["soup"], "other meals are kept");
const replaced = addToPlan(withLunch, { recipeId: "toast", day: 4, meal: "Breakfast" }, true);
assert.equal(occupant(undoAdd(replaced, withLunch, { recipeId: "toast", day: 4, meal: "Breakfast" })!, "Breakfast", 4)?.recipeId, "eggs", "Undo of a replace restores the replaced meal");

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
console.log("home: ok");
