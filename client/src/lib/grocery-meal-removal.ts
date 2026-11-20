import { parseIngredientLine } from "@shared/ingredient-parse";
import { ingredientGroup } from "./ingredient-groups";
import { baseServings, scaleIngredient } from "./ingredient-scale";
import { restoreBatch, type Batch, type PlanState } from "./meal-plan";
import { batchFactor } from "@shared/cooking-plan";
import type { PlannerRecipe } from "./planner-recipes";

export type GroceryRecipe = Pick<PlannerRecipe, "id" | "title" | "ingredients" | "servings">;
const optional = /\b(optional|to serve|for serving|to garnish|for garnish|if desired)\b/i;
const quantityFormatter = new Intl.NumberFormat("en", { useGrouping: false, maximumFractionDigits: 6 });

export function groceryMeasure(text: string) {
  const parsed = parseIngredientLine(text);
  const unit = parsed.unit === "kg" ? "g" : parsed.unit === "l" ? "ml" : parsed.unit;
  const amount = parsed.quantity === null ? null : parsed.quantity * (unit !== parsed.unit ? 1000 : 1);
  const measurable = amount !== null && Number.isFinite(amount) && !!parsed.ingredient;
  return {
    name: parsed.ingredient,
    unit,
    quantity: measurable ? amount : null,
    identity: JSON.stringify(measurable ? [unit, parsed.ingredient.toLowerCase()] : [text.toLowerCase()]),
  };
}

export function groceryQuantityText(measure: ReturnType<typeof groceryMeasure>, quantity: number) {
  return [quantityFormatter.format(quantity), measure.unit, measure.name].filter(Boolean).join(" ");
}

export type RecipeGroceryRow = {
  ingredient: string;
  recipes: string[];
  proteinRecipes: Set<string>;
};

/** Groceries come from the approved dishes only (Approve cooking plan / Save changes). Each dish counts once, scaled from
 * the recipe's original quantities by its own total: servings to make / original yield. A recipe with no known yield
 * adds its quantities once per dish. Dishes served in another week still count in the week they are cooked. */
export function buildRecipeGroceryRows(batches: readonly Batch[], catalog: GroceryRecipe[]) {
  const byId = new Map(catalog.map(recipe => [recipe.id, recipe]));
  const rows = new Map<string, RecipeGroceryRow & { quantity: number | null }>();
  for (const batch of batches) {
    const recipe = byId.get(batch.recipeId);
    if (!recipe) continue;
    const factor = batchFactor(batch, baseServings(recipe.servings)) ?? 1;
    const proteins = recipe.ingredients.flatMap((line, index) =>
      ingredientGroup(line) === "protein" && !optional.test(line) ? [index] : []);
    recipe.ingredients.forEach((line, index) => {
      const ingredient = scaleIngredient(line, factor);
      const measure = groceryMeasure(ingredient);
      const previous = rows.get(measure.identity);
      const row = previous ?? { ingredient, quantity: measure.quantity, recipes: [], proteinRecipes: new Set<string>() };
      if (!row.recipes.includes(recipe.title)) row.recipes.push(recipe.title);
      if (proteins.length === 1 && proteins[0] === index) row.proteinRecipes.add(recipe.id);
      if (previous && previous.quantity !== null && measure.quantity !== null) {
        row.quantity = previous.quantity + measure.quantity;
        row.ingredient = groceryQuantityText(measure, row.quantity);
      }
      rows.set(measure.identity, row);
    });
  }
  return rows;
}

/** The approved dishes that use a recipe (only those are on the grocery list). */
export function groceryMealsFor(plan: PlanState, recipeIds: Set<string>): Batch[] {
  return (plan.approved ?? []).filter(b => recipeIds.has(b.recipeId));
}

/** Removing a main protein with its dishes: they leave both the plan and its approved copy, so Groceries change at once
 * and an approved week stays approved. Other dishes, including another batch of the same recipe, stay. */
export function removeGroceryMeals(plan: PlanState, remove: Batch[]): PlanState {
  const ids = new Set(remove.map(b => b.id));
  return { ...plan, batches: plan.batches.filter(b => !ids.has(b.id)), approved: plan.approved && plan.approved.filter(b => !ids.has(b.id)) };
}

export const assignmentKey = (b: Batch) => b.id;

export function groceryPlanVersion(plan: PlanState) {
  return JSON.stringify([plan.batches.map(b => b.id), (plan.approved ?? []).map(b => b.id)]);
}

/** Undo: the dishes return to the plan and, where they were approved, to the approved copy. null when one is back already. */
export function restoreGroceryMeals(current: PlanState, removed: Batch[], before: PlanState): PlanState | null {
  if (removed.some(b => current.batches.some(x => x.id === b.id) || current.approved?.some(x => x.id === b.id))) return null;
  let next = current;
  for (const batch of removed) {
    const planned = before.batches.find(b => b.id === batch.id);
    if (planned) next = restoreBatch(next, planned, before.batches.indexOf(planned));
    const index = before.approved?.findIndex(b => b.id === batch.id) ?? -1;
    if (index >= 0 && next.approved) { const approved = [...next.approved]; approved.splice(index, 0, before.approved![index]); next = { ...next, approved }; }
  }
  return next;
}

export function remainingGroceryText(ingredient: string, purchases: Iterable<string>) {
  const measure = groceryMeasure(ingredient);
  if (measure.quantity === null) {
    return Array.from(purchases).some(text => text.toLowerCase() === ingredient.toLowerCase()) ? null : ingredient;
  }
  let remaining = measure.quantity;
  for (const text of purchases) {
    const purchase = groceryMeasure(text);
    if (purchase.identity === measure.identity && purchase.quantity !== null) remaining -= purchase.quantity;
  }
  if (remaining < 1e-7) return null;
  return Math.abs(remaining - measure.quantity) < 1e-7 ? ingredient : groceryQuantityText(measure, remaining);
}
