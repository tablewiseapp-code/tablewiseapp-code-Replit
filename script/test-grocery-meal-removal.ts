import assert from "node:assert/strict";
import { buildRecipeGroceryRows, groceryMeasure, remainingGroceryText,
  removeGroceryMeals, restoreGroceryMeals } from "../client/src/lib/grocery-meal-removal";
import type { PlanState } from "../client/src/lib/meal-plan";

const curry = { id: "curry", title: "Easy chicken curry", servings: "4", ingredients: [
  "6 chicken thighs", "500 g onions", "2 tbsp curry paste", "100 g Greek yogurt",
  "1 egg, optional", "1 cup rice, to serve",
] };
const roast = { id: "roast", title: "Roast chicken", servings: "4", ingredients: ["4 chicken thighs", "1 kg onions"] };
const plan: PlanState = {
  selectedIds: [curry.id, roast.id],
  planAssignments: [
    { recipeId: curry.id, mealType: "Dinner", startDay: 2, spanDays: 1 },
    { recipeId: roast.id, mealType: "Dinner", startDay: 5, spanDays: 1 },
  ],
};
const catalog = [curry, roast];
const rowFor = (rows: ReturnType<typeof buildRecipeGroceryRows>, text: string) => rows.get(groceryMeasure(text).identity);
const before = buildRecipeGroceryRows(plan, catalog);
assert.equal(rowFor(before, "6 chicken thighs")?.ingredient, "10 chicken thighs");
assert.deepEqual([...rowFor(before, "6 chicken thighs")!.proteinRecipes], [curry.id, roast.id]);
assert.equal(rowFor(before, "1 egg, optional")?.proteinRecipes.size, 0);
assert.equal(rowFor(before, "500 g onions")?.ingredient, "1500 g onions");

const removed = [plan.planAssignments[0]];
const next = removeGroceryMeals(plan, removed);
const after = buildRecipeGroceryRows(next, catalog);
assert.equal(rowFor(after, "6 chicken thighs")?.ingredient, "4 chicken thighs");
assert.equal(rowFor(after, "2 tbsp curry paste"), undefined);
assert.equal(remainingGroceryText(rowFor(after, "500 g onions")!.ingredient, ["300 g onions"]), "700 g onions");
assert.equal(remainingGroceryText("200 g onions", ["300 g onions"]), null);
assert.equal(remainingGroceryText("500 g ground beef", ["300 g ground beef"]), "200 g ground beef");
assert.equal(remainingGroceryText("1 cup rice", ["200 g rice"]), "1 cup rice");
assert.equal(remainingGroceryText("Salt, to taste", ["salt, to taste"]), null);

const restored = restoreGroceryMeals(next, removed, plan)!;
assert.equal(restored.planAssignments.length, 2);
assert.equal(restoreGroceryMeals({
  ...next, planAssignments: [...next.planAssignments, { ...removed[0], recipeId: roast.id }],
}, removed, plan), null);
const ambiguous = { ...curry, ingredients: ["6 chicken thighs", "2 eggs"] };
assert.equal(rowFor(buildRecipeGroceryRows(plan, [ambiguous]), "6 chicken thighs")?.proteinRecipes.size, 0);
console.log("Grocery meal removal, purchase quantities, and Undo tests passed.");
