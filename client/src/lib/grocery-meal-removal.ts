import { parseIngredientLine } from "@shared/ingredient-parse";
import { ingredientGroup } from "./ingredient-groups";
import { baseServings, scaleIngredient } from "./ingredient-scale";
import { maxPlannedRecipes, occupant, type PlanAssignment, type PlanState } from "./meal-plan";
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

/** Groceries come from scheduled meals only, scaled to each meal's servings. Shortlisted-only, declined and replaced recipes add nothing. */
export function buildRecipeGroceryRows(plan: PlanState, catalog: GroceryRecipe[]) {
  const selected = new Set(plan.planAssignments.map(a => a.recipeId));
  const rows = new Map<string, RecipeGroceryRow & { quantity: number | null }>();
  for (const recipe of catalog) {
    if (!selected.has(recipe.id)) continue;
    const base = baseServings(recipe.servings);
    const assignments = plan.planAssignments.filter(a => a.recipeId === recipe.id);
    const factor = base ? assignments.reduce((sum, a) => sum + (a.servings || base), 0) / base : assignments.length;
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

/** Meals that use a recipe: its day slots (only scheduled meals are on the grocery list). */
export function groceryMealsFor(plan: PlanState, recipeIds: Set<string>): PlanAssignment[] {
  return plan.planAssignments.filter(a => recipeIds.has(a.recipeId));
}

export function removeGroceryMeals(plan: PlanState, remove: PlanAssignment[]) {
  const keys = new Set(remove.map(assignmentKey));
  const recipeIds = new Set(remove.map(a => a.recipeId));
  const planAssignments = plan.planAssignments.filter(a => !keys.has(assignmentKey(a)));
  const remainingIds = new Set(planAssignments.map(a => a.recipeId));
  return {
    ...plan,
    planAssignments,
    selectedIds: plan.selectedIds.filter(id => !recipeIds.has(id) || remainingIds.has(id)),
  };
}

export function assignmentKey(a: PlanAssignment) {
  return JSON.stringify([a.recipeId, a.mealType, a.startDay, a.spanDays, a.servings]);
}

export function groceryPlanVersion(plan: PlanState) {
  return JSON.stringify([plan.selectedIds, plan.planAssignments.map(assignmentKey)]);
}

export function restoreGroceryMeals(current: PlanState, removed: PlanAssignment[], before: PlanState): PlanState | null {
  const selectedIds = [...current.selectedIds];
  const removedIds = new Set(removed.map(a => a.recipeId));
  for (const [index, id] of before.selectedIds.entries()) {
    if (removedIds.has(id) && !selectedIds.includes(id)) selectedIds.splice(index, 0, id);
  }
  if (selectedIds.length > maxPlannedRecipes || removed.some(a =>
    Array.from({ length: a.spanDays }, (_, day) => occupant(current, a.mealType, a.startDay + day)).some(Boolean),
  )) return null;
  return { ...current, selectedIds, planAssignments: [...current.planAssignments, ...removed.filter(a => a.spanDays > 0)] };
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
