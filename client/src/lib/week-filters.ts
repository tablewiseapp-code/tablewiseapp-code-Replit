// Week → Plan filters: one value shared by the Week page (/meals) and Your household (/household).
// Kept where the Week page always kept them: `filters` inside the `weeklyMealsState` browser copy (planner filter state,
// see ARCHITECTURE.md). writePlan() spreads the stored object, so saving the plan never drops them.
import { cookingLevels, WEEK_DEFAULT_MAX_MINUTES, weekTimeOptions, type PlannerFilters } from "./planner-filters";
import { foodDealById } from "./food-deals";
import { planStorageKey } from "./meal-plan";

export type WeekFilters = Required<PlannerFilters>;
export const sourceOptions = ["My recipes", "Imported", "Trusted authors", "Personal"] as const;
export const defaultWeekFilters: WeekFilters = {
  maxMinutes: WEEK_DEFAULT_MAX_MINUTES, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [],
  withNotes: false, modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [],
  cuisine: [], cookingLevel: null, deal: null,
};

const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** Unknown or outdated values fall back to their default. Servings has no control on Week → Plan, so it is always reset. */
export function sanitizeWeekFilters(raw: unknown): WeekFilters {
  const f = { ...defaultWeekFilters, ...(raw && typeof raw === "object" ? raw as Partial<WeekFilters> : {}) };
  return {
    ...f, servings: null,
    dietary: list(f.dietary), mealType: list(f.mealType), cookingMethod: list(f.cookingMethod), source: list(f.source), proteinType: list(f.proteinType),
    mustInclude: list(f.mustInclude), mustExclude: list(f.mustExclude), cuisine: list(f.cuisine),
    withNotes: f.withNotes === true, modifiedByMe: f.modifiedByMe === true, myPicks: f.myPicks === true,
    minRating: typeof f.minRating === "number" ? f.minRating : null,
    maxMinutes: f.maxMinutes === null || (weekTimeOptions as readonly unknown[]).includes(f.maxMinutes) ? f.maxMinutes : WEEK_DEFAULT_MAX_MINUTES,
    cookingLevel: (cookingLevels as readonly unknown[]).includes(f.cookingLevel) ? f.cookingLevel : null,
    deal: f.deal && foodDealById(f.deal) ? f.deal : null,
  };
}

const readState = (): Record<string, unknown> => {
  try { const parsed = JSON.parse(localStorage.getItem(planStorageKey) ?? "null"); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
};
export const loadWeekFilters = () => sanitizeWeekFilters(readState().filters);
/** Changes only the filters; the plan in the same browser copy is kept. */
export function saveWeekFilters(filters: WeekFilters) {
  try { localStorage.setItem(planStorageKey, JSON.stringify({ selectedIds: [], planAssignments: [], ...readState(), filters })); } catch { /* filters are a convenience */ }
}

/** Filters that differ from the defaults (the time limit counts only when changed). */
export function countWeekFilters(f: WeekFilters): number {
  return (f.maxMinutes !== WEEK_DEFAULT_MAX_MINUTES ? 1 : 0) + (f.cookingLevel ? 1 : 0) + (f.deal ? 1 : 0) +
    f.dietary.length + f.mealType.length + f.cookingMethod.length + f.proteinType.length + f.mustInclude.length + f.mustExclude.length +
    f.source.length + f.cuisine.length + (f.myPicks ? 1 : 0) + (f.myPicks && f.minRating !== null ? 1 : 0) + (f.withNotes ? 1 : 0) + (f.modifiedByMe ? 1 : 0);
}
