import type { Recipe } from "./storage";
import type { RecipeTimeMode } from "./recipe-time";
import type { FilterViolation, NewRecipe } from "./recipe-generation";
import { mealsGenerationFilters, type PlannerFilters } from "./planner-filters";
import { RECIPE_GENERATION_SCHEMA_VERSION, type RecipeGenerationRequest, type RecipeGenerationStatus } from "@shared/recipe-generation-request";

export type RecipeDraft = {
  id: string; status: RecipeGenerationStatus; recipeName: string; request: RecipeGenerationRequest;
  recipe: NewRecipe; description: string; tip: string; violations: FilterViolation[]; recipeId: string | null;
};
export type DraftEdit = Partial<Pick<NewRecipe, "title" | "ingredients" | "steps" | "prepTime" | "cookTime" | "servings">> & { description?: string };

export class DraftRequestError extends Error {
  constructor(message: string, readonly status: number, readonly matches: { id: string; title: string }[] = []) { super(message); }
}

/** The versioned generation request for a searched recipe name. Personal filters are reported, never sent. */
export function searchGenerationRequest(recipeName: string, filters: PlannerFilters, timeMode: RecipeTimeMode) {
  const { filters: generation, notApplied } = mealsGenerationFilters(filters);
  const body: RecipeGenerationRequest = {
    schemaVersion: RECIPE_GENERATION_SCHEMA_VERSION, recipeName: recipeName.trim(), source: "recipe_search",
    filters: generation as RecipeGenerationRequest["filters"], timeMode,
  };
  return { body, notApplied };
}

async function call<T>(path: string, method: "POST" | "PATCH", body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new DraftRequestError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.", res.status, data?.matches);
  return data;
}

export const createDraft = (body: RecipeGenerationRequest, signal?: AbortSignal) => call<RecipeDraft>("/api/recipe-generations", "POST", body, signal);
export const editDraft = (id: string, edit: DraftEdit) => call<RecipeDraft>(`/api/recipe-drafts/${encodeURIComponent(id)}`, "PATCH", edit);
export const regenerateDraft = (id: string, signal?: AbortSignal) => call<RecipeDraft>(`/api/recipe-drafts/${encodeURIComponent(id)}/regenerate`, "POST", {}, signal);
export const approveDraft = (id: string) => call<{ recipe: Recipe; created: boolean }>(`/api/recipe-drafts/${encodeURIComponent(id)}/approve`, "POST", {});
