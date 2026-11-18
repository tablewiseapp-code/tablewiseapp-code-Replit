import assert from "node:assert/strict";
import { mealsOnDay, type PlanState } from "../client/src/lib/meal-plan";
import { buildGroceryItems } from "../client/src/lib/grocery-items";

const plan: PlanState = { selectedIds: ["a", "b", "c"], planAssignments: [
  { recipeId: "b", mealType: "Dinner", startDay: 2, spanDays: 1 },
  { recipeId: "a", mealType: "Breakfast", startDay: 1, spanDays: 2 }, // leftovers cover Tuesday too
  { recipeId: "c", mealType: "Lunch", startDay: 3, spanDays: 1 },
] };
assert.deepEqual(mealsOnDay(plan, 2).map(a => a.recipeId), ["a", "b"], "today's meals in Breakfast, Lunch, Dinner order");
assert.deepEqual(mealsOnDay(plan, 0), [], "nothing on Sunday");

const recipes = [{ id: "a", title: "A", ingredients: ["2 eggs", "Salt"] }, { id: "b", title: "B", ingredients: ["salt"] }];
const { items } = buildGroceryItems(recipes, ["a", "b"], [], [{ id: "x", text: "SALT" }, { id: "y", text: "Milk" }]);
assert.deepEqual([...items.keys()].sort(), ["2 eggs", "milk", "salt"], "a hand-added product on the recipe list counts once");
assert.equal(items.get("salt")?.extraId, "x");
console.log("home: ok");
