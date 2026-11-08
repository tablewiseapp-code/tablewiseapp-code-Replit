import { useEffect, useState } from "react";
import { toPlannerRecipe } from "./planner-recipes";
import type { GeneratedRecipe, NewRecipe } from "./recipe-generation";
import type { PlanState } from "./meal-plan";

// My Ideas: AI-generated recipes kept per browser (no accounts yet), like the weekly plan.
// Everything goes through these functions, so a server-backed store can replace localStorage later.
export type Idea = {
  id: string;
  origin: "ai_generated";
  createdAt: string;
  generationRequestId: string | null;
  generationModel: string | null;
  filtersSnapshot: unknown;
  recipe: NewRecipe;
  description: string;
  isFavorite: boolean;
  /** Set once the idea was saved as a regular recipe (the planner and grocery list work with saved recipes). */
  recipeId: string | null;
};

export const ideasKey = "tablewise:my-ideas:v1";
export const activityKey = "tablewise:recipe-activity:v1";
export const personalizationKey = "tablewise:personalization:v1";
const changed = "tablewise:ideas-changed";
const maxIdeas = 200; // ponytail: localStorage quota; move to server storage when accounts exist

const store = () => globalThis.localStorage;
const uuid = () => globalThis.crypto.randomUUID();

export function listIdeas(): Idea[] {
  try {
    const parsed = JSON.parse(store().getItem(ideasKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(i => i && typeof i.id === "string" && i.recipe?.title) : [];
  } catch { return []; }
}
/** Throws when the browser refuses the write. */
function writeIdeas(ideas: Idea[]) {
  store().setItem(ideasKey, JSON.stringify(ideas));
  globalThis.dispatchEvent?.(new Event(changed));
}

/** Each generation is a new record; nothing is replaced. Oldest non-favourites are dropped past the cap. */
export function saveIdea(result: GeneratedRecipe, filtersSnapshot: unknown): Idea {
  const idea: Idea = {
    id: uuid(), origin: "ai_generated", createdAt: new Date().toISOString(),
    generationRequestId: result.meta?.generationRequestId ?? null, generationModel: result.meta?.model ?? null,
    filtersSnapshot, recipe: result.recipe, description: result.description, isFavorite: false, recipeId: null,
  };
  const ideas = [idea, ...listIdeas()];
  while (ideas.length > maxIdeas) {
    const drop = ideas.map(i => i.isFavorite).lastIndexOf(false);
    ideas.splice(drop === -1 ? ideas.length - 1 : drop, 1);
  }
  writeIdeas(ideas);
  return idea;
}
export function updateIdea(id: string, patch: Partial<Pick<Idea, "isFavorite" | "recipeId">>) {
  writeIdeas(listIdeas().map(i => i.id === id ? { ...i, ...patch } : i));
}
/** Removes the idea and its activity events. A recipe already saved to My Recipes or the plan is left alone. */
export function removeIdea(id: string) {
  writeIdeas(listIdeas().filter(i => i.id !== id));
  try {
    const log = readActivity();
    if (log) store().setItem(activityKey, JSON.stringify({ ...log, events: log.events.filter(e => e.recipeId !== id) }));
  } catch { /* nothing to clean */ }
}
export function clearIdeas() { writeIdeas([]); }

export function useIdeas(): Idea[] {
  const [ideas, setIdeas] = useState(listIdeas);
  useEffect(() => {
    const refresh = () => setIdeas(listIdeas());
    addEventListener(changed, refresh); addEventListener("storage", refresh);
    return () => { removeEventListener(changed, refresh); removeEventListener("storage", refresh); };
  }, []);
  return ideas;
}

export const cookingMethods = (idea: Idea) =>
  toPlannerRecipe({ ...idea.recipe, id: idea.id, createdAt: idea.createdAt, updatedAt: idea.createdAt }).tools;
export const isInPlan = (idea: Idea, plan: PlanState) => Boolean(idea.recipeId &&
  (plan.selectedIds.includes(idea.recipeId) || plan.planAssignments.some(a => a.recipeId === idea.recipeId)));

// ---- Activity tracking: local only, bounded, no personal details. Off switch = nothing is recorded or sent. ----
export type RecipeEventType = "recipe_generated" | "recipe_viewed" | "recipe_favorited" | "recipe_added_to_plan" | "recipe_regenerated" | "recipe_deleted";
export type RecipeEvent = { id: string; type: RecipeEventType; at: string; recipeId?: string; sessionId: string; meta?: Record<string, string | number | boolean> };
type ActivityLog = { sessionId: string; events: RecipeEvent[] };
const onceOnly = new Set<RecipeEventType>(["recipe_generated"]);
const maxEvents = 500;

export const personalizationEnabled = () => { try { return store().getItem(personalizationKey) !== "off"; } catch { return false; } };
export function setPersonalization(on: boolean) { store().setItem(personalizationKey, on ? "on" : "off"); globalThis.dispatchEvent?.(new Event(changed)); }

function readActivity(): ActivityLog | null {
  const parsed = JSON.parse(store().getItem(activityKey) ?? "null");
  return parsed && typeof parsed.sessionId === "string" && Array.isArray(parsed.events) ? parsed : null;
}
export function listActivity(): RecipeEvent[] { try { return readActivity()?.events ?? []; } catch { return []; } }

/** Returns true when recorded. Never throws; a refused write just skips the event. */
export function trackRecipeEvent(type: RecipeEventType, recipeId?: string, meta?: RecipeEvent["meta"]): boolean {
  if (!personalizationEnabled()) return false;
  try {
    const log = readActivity() ?? { sessionId: uuid(), events: [] }; // anonymous, per browser
    if (onceOnly.has(type) && log.events.some(e => e.type === type && e.recipeId === recipeId)) return false;
    const event: RecipeEvent = { id: uuid(), type, at: new Date().toISOString(), sessionId: log.sessionId, ...(recipeId ? { recipeId } : {}), ...(meta ? { meta } : {}) };
    store().setItem(activityKey, JSON.stringify({ ...log, events: [...log.events, event].slice(-maxEvents) }));
    return true;
  } catch { return false; }
}
/** Deletes all activity and the anonymous session id. */
export function clearActivity() { try { store().removeItem(activityKey); } catch { /* already gone */ } }

/** The only personalization data that leaves the browser: recent titles (for variety) and favourite cooking-method counts. */
export function personalizationSignals(ideas = listIdeas()) {
  if (!personalizationEnabled() || ideas.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const idea of ideas.filter(i => i.isFavorite)) for (const method of cookingMethods(idea)) counts.set(method, (counts.get(method) ?? 0) + 1);
  return {
    recentTitles: ideas.slice(0, 8).map(i => i.recipe.title.trim().slice(0, 200)).filter(Boolean),
    favoriteMethods: [...counts].map(([method, count]) => ({ method, count })),
  };
}
