import assert from "node:assert/strict";
import { mealsOnDay, type PlanState } from "../client/src/lib/meal-plan";
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
console.log("home: ok");
