import type { MealFilters } from "./meal-filters";
import type { RecipeTimeMode } from "./recipe-time";
import type { Recipe } from "./storage";
import { mealsGenerationFilters, type PlannerFilters } from "./planner-filters";

export type NewRecipe = Omit<Recipe, "id" | "createdAt" | "updatedAt">;
export type GeneratedRecipe = { recipe: NewRecipe; description: string; tip?: string;
  meta?: { generationRequestId: string; model: string; promptVersion: string; style?: string; budget?: string } };

// Only canonical filter fields are sent; nothing else from the page leaves the browser.
export function generationBody(filters: MealFilters, timeMode: RecipeTimeMode) {
  return {
    filters: {
      maxMinutes: filters.maxMinutes, mustInclude: filters.mustInclude, mustExclude: filters.mustExclude,
      mealTypes: filters.mealTypes, lunchbox: filters.lunchbox,
    },
    timeMode,
  };
}

/** The Meals page (/meals) request: its own canonical filter names; personal filters are reported, not sent. */
export function mealsGenerationBody(filters: PlannerFilters, timeMode: RecipeTimeMode) {
  const { filters: generation, notApplied } = mealsGenerationFilters(filters);
  return { body: { filterSet: "meals" as const, filters: generation, timeMode }, notApplied };
}

export async function requestGeneratedRecipe(body: unknown, signal?: AbortSignal): Promise<GeneratedRecipe> {
  const res = await fetch("/api/recipes/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Generation failed");
  if (!data?.recipe || typeof data.recipe.title !== "string" || !Array.isArray(data.recipe.ingredients) ||
      !Array.isArray(data.recipe.steps) || !data.recipe.ingredients.length || !data.recipe.steps.length) {
    throw new Error("The generated recipe was incomplete.");
  }
  return data;
}

export type GenerationEventName = "generated_recipe_accepted" | "generated_recipe_rejected" | "generated_recipe_added_to_plan";
/** Fire-and-forget learning signal: the event name only. Never blocks or breaks the UI. */
export function reportGenerationEvent(name: GenerationEventName) {
  try {
    void fetch("/api/recipes/generate/events", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify({ name }),
    }).catch(() => undefined);
  } catch { /* optional signal */ }
}
export const isGeneratedRecipe = (recipe: { tags?: string[] | null }) => Boolean(recipe.tags?.includes("ai-generated"));

// One style per request; budget is a standing preference (default Everyday), never part of the form.
export const generationStyles = ["surprise_me", "quick_easy", "chefs_touch", "family_favorite", "try_something_new"] as const;
export type GenerationStyle = typeof generationStyles[number];
export const budgetPreferences = ["everyday", "save_more", "flexible"] as const;
export type BudgetPreference = typeof budgetPreferences[number];
export type IdeaFilters = { maxMinutes: number | null; dietary: string[]; mealType: string[]; cookingMethod: string[] };
export const noIdeaFilters: IdeaFilters = { maxMinutes: null, dietary: [], mealType: [], cookingMethod: [] };

/** My Ideas request: the Meals filter set, time measured as preparation, plus style and budget. */
export function ideaGenerationBody(filters: IdeaFilters, style: GenerationStyle, budget: BudgetPreference) {
  return {
    filterSet: "meals" as const, timeMode: "preparation" as const, style, budget,
    filters: { ...filters, proteinType: [], servings: null, mustInclude: [], mustExclude: [] },
  };
}
