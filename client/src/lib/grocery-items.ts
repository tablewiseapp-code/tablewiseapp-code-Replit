import { plannedServingsFactor, type PlanAssignment } from "./meal-plan";
import { baseServings, scaleIngredient } from "./ingredient-scale";

export type GroceryRecipe = { id: string; title: string; ingredients: string[]; servings?: string | null };
export type GroceryExtra = { id: string; text: string; image?: string | null };
export type GroceryItem = { ingredient: string; recipes: string[]; image?: string | null; extraId?: string };

/** One row per lower-cased ingredient: planned recipes first, then hand-added products merged onto a matching row. */
export function buildGroceryItems<R extends GroceryRecipe>(recipes: R[], selectedIds: string[], planAssignments: PlanAssignment[], extras: GroceryExtra[]) {
  const used = new Set([...selectedIds, ...planAssignments.map(a => a.recipeId)]); // shortlisted dishes count even before they get a slot
  const usedRecipes = recipes.filter(r => used.has(r.id));
  const items = new Map<string, GroceryItem>();
  usedRecipes.forEach(recipe => {
    // Planned servings (chosen in the recipe view) scale quantities; unparseable lines stay as written.
    const factor = plannedServingsFactor(planAssignments, recipe.id, baseServings(recipe.servings));
    recipe.ingredients.map(text => scaleIngredient(text, factor)).forEach(ingredient => {
      const key = ingredient.toLowerCase();
      const item = items.get(key);
      if (!item) items.set(key, { ingredient, recipes: [recipe.title] });
      else if (!item.recipes.includes(recipe.title)) item.recipes.push(recipe.title);
    });
  });
  extras.forEach(extra => {
    const key = extra.text.toLowerCase();
    const item = items.get(key);
    if (item) { item.extraId = extra.id; item.image = extra.image; } else items.set(key, { ingredient: extra.text, recipes: [], image: extra.image, extraId: extra.id });
  });
  return { items, usedRecipes };
}
