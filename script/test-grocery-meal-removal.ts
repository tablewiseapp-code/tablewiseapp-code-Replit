import assert from "node:assert/strict";
import { buildRecipeGroceryRows, groceryMealsFor, groceryMeasure, remainingGroceryText,
  removeGroceryMeals, restoreGroceryMeals } from "../client/src/lib/grocery-meal-removal";
import { addBatch, approvePlan, emptyPlan, type PlanState } from "../client/src/lib/meal-plan";

const curry = { id: "curry", title: "Easy chicken curry", servings: "4", ingredients: [
  "6 chicken thighs", "500 g onions", "2 tbsp curry paste", "100 g Greek yogurt",
  "1 egg, optional", "1 cup rice, to serve",
] };
const roast = { id: "roast", title: "Roast chicken", servings: "4", ingredients: ["4 chicken thighs", "1 kg onions"] };
// Approved dishes at the recipes' own yield (no household counts).
const plan: PlanState = approvePlan(addBatch(addBatch(emptyPlan("2026-11-16"), curry.id, "2026-11-17", null, "c1"), roast.id, "2026-11-20", null, "r1"));
const catalog = [curry, roast];
const rowFor = (rows: ReturnType<typeof buildRecipeGroceryRows>, text: string) => rows.get(groceryMeasure(text).identity);
const before = buildRecipeGroceryRows(plan.approved!, catalog);
assert.equal(rowFor(before, "6 chicken thighs")?.ingredient, "10 chicken thighs");
assert.deepEqual([...rowFor(before, "6 chicken thighs")!.proteinRecipes], [curry.id, roast.id]);
assert.equal(rowFor(before, "1 egg, optional")?.proteinRecipes.size, 0);
assert.equal(rowFor(before, "500 g onions")?.ingredient, "1500 g onions");

const removed = groceryMealsFor(plan, new Set([curry.id]));
assert.deepEqual(removed.map(b => b.id), ["c1"]);
const next = removeGroceryMeals(plan, removed);
const after = buildRecipeGroceryRows(next.approved!, catalog);
assert.deepEqual([next.batches.map(b => b.id), next.approved!.map(b => b.id)], [["r1"], ["r1"]], "the dish leaves the plan and its approved copy");
assert.equal(rowFor(after, "6 chicken thighs")?.ingredient, "4 chicken thighs");
assert.equal(rowFor(after, "2 tbsp curry paste"), undefined);
assert.equal(remainingGroceryText(rowFor(after, "500 g onions")!.ingredient, ["300 g onions"]), "700 g onions");
assert.equal(remainingGroceryText("200 g onions", ["300 g onions"]), null);
assert.equal(remainingGroceryText("500 g ground beef", ["300 g ground beef"]), "200 g ground beef");
assert.equal(remainingGroceryText("1 cup rice", ["200 g rice"]), "1 cup rice");
assert.equal(remainingGroceryText("Salt, to taste", ["salt, to taste"]), null);

const restored = restoreGroceryMeals(next, removed, plan)!;
assert.deepEqual(restored, plan, "Undo puts the dish back in place, approved");
assert.equal(restoreGroceryMeals(restored, removed, plan), null, "already back: nothing to undo");
const ambiguous = { ...curry, ingredients: ["6 chicken thighs", "2 eggs"] };
assert.equal(rowFor(buildRecipeGroceryRows(plan.approved!, [ambiguous]), "6 chicken thighs")?.proteinRecipes.size, 0);
console.log("Grocery meal removal, purchase quantities, and Undo tests passed.");

// Groceries come from scheduled meals only: a recipe chosen for the Week but not on a day adds nothing.
const cacciatore = { id: "cacciatore", title: "Chicken cacciatore", servings: "4", ingredients: ["8 boneless skinless chicken thighs", "150 ml gluten-free chicken stock"] };
const unplaced: PlanState = { ...emptyPlan(), selectedIds: [cacciatore.id] };
assert.equal(buildRecipeGroceryRows(unplaced.approved ?? [], [cacciatore]).size, 0);
const draft = addBatch(emptyPlan(), cacciatore.id, "2026-11-17", null);
assert.equal(buildRecipeGroceryRows(draft.approved ?? [], [cacciatore]).size, 0, "a draft dish waits for approval");
assert.deepEqual(groceryMealsFor(unplaced, new Set([cacciatore.id])), []);
console.log("unscheduled recipe adds no groceries ok");
