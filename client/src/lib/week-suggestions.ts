// Your household → a suggested week of dinners, from the catalog only (works with AI off). Pure and deterministic.
// Hard restrictions come from checkEligibility (preference-engine.ts), the one rule every suggestion uses; this file only
// picks evenings and ranks the eligible recipes. Plan days: 0 = Sunday … 6 = Saturday, as in meal-plan.ts.
import { householdServings, type BasicSettings } from "./basic-settings";
import { mealSlots, maxPlannedRecipes, occupant, type MealSlot, type PlanAssignment, type PlanState, type Slot } from "./meal-plan";
import { checkEligibility, rankRecipe, total, weeknightLimit, type EngineRecipe, type Eligibility } from "./preference-engine";

export const weekOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon … Sun
const DINNER = "Dinner" as const;
/** Same value on every refresh; the seed (the calendar week) varies suggestions from week to week. */
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

/** Fixed evenings first (and a chosen chef challenge day), then the rest spread out across the week. */
export function cookingEvenings(settings: BasicSettings): number[] {
  const s = settings.setup;
  const fixed = new Set(s.fixedDays);
  if (s.style === "chef" && s.challenge.when === "day" && s.challenge.day !== null) fixed.add(s.challenge.day);
  const count = Math.min(7, Math.max(s.evenings ?? 3, fixed.size));
  const chosen = [...fixed];
  while (chosen.length < count) {
    const gap = (d: number) => chosen.length ? Math.min(...chosen.map(c => Math.min((d - c + 7) % 7, (c - d + 7) % 7))) : 7;
    const free = weekOrder.filter(d => !chosen.includes(d));
    chosen.push(free.reduce((best, d) => (gap(d) > gap(best) ? d : best), free[0]));
  }
  return weekOrder.filter(d => chosen.includes(d));
}

/** Evenings that get the most involved recipe. "Any cooking day": the evening with the most time (weekend first). */
export function challengeDays(settings: BasicSettings, evenings: number[]): number[] {
  const s = settings.setup;
  if (s.style !== "chef") return [];
  if (s.challenge.when === "every") return evenings;
  if (s.challenge.when === "day") return s.challenge.day !== null && evenings.includes(s.challenge.day) ? [s.challenge.day] : [];
  const roomy = [6, 0, 5, 4, 3, 2, 1].filter(d => evenings.includes(d));
  const pick = roomy.find(d => weeknightLimit(settings, d) === null) ?? roomy[0];
  return pick === undefined ? [] : [pick];
}

/** How involved a recipe is, from recorded data only: steps, ingredient lines and total time. Used for ranking, never to hide.
 * ponytail: a proxy; replace with real difficulty tags when the catalog has them. */
export const effort = (r: EngineRecipe) => (r.stepCount ?? 0) + r.ingredients.length / 2 + (total(r) ?? 30) / 15;

export function dinnerEligibility(recipe: EngineRecipe, settings: BasicSettings, day?: number): Eligibility {
  return checkEligibility(recipe, settings, undefined, DINNER, day);
}
const dinners = <T extends EngineRecipe>(catalog: readonly T[]) => catalog.filter(r => r.mealType === DINNER);

/** The Week → Plan filters (same state on /meals and /household), as a yes/no per recipe. Applied after the restrictions. */
export type Fits<T> = (recipe: T) => boolean;
const any = () => true;

/** Eligible recipes of one meal (dinner by default) for one day, best first. `exclude`: recipes not to offer (already planned, declined). */
export function rankedForDay<T extends EngineRecipe>(catalog: readonly T[], settings: BasicSettings, day: number,
  { meal = DINNER, exclude = new Set<string>(), chosen = [], challenge = false, seed = "", fits = any }: { meal?: MealSlot; exclude?: Set<string>; chosen?: readonly EngineRecipe[]; challenge?: boolean; seed?: string; fits?: Fits<T> } = {}): T[] {
  const pool = catalog.filter(r => r.mealType === meal && checkEligibility(r, settings, undefined, meal).eligible);
  const order = [...pool].sort((a, b) => effort(a) - effort(b));
  const pct = (r: EngineRecipe) => (order.length > 1 ? order.indexOf(r as T) / (order.length - 1) : 0.5);
  const target = challenge ? 1 : settings.setup.style === "quick" ? 0 : 0.4;
  const dayType = day === 0 || day === 6 ? "weekend" as const : "weekday" as const;
  return pool.filter(r => !exclude.has(r.id) && fits(r) && checkEligibility(r, settings, undefined, meal, day).eligible)
    .map(r => ({ r, score: rankRecipe(r, settings, { day: dayType, selected: chosen }).score - 4 * Math.abs(pct(r) - target), tie: hash(`${seed}:${r.id}`) }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie).map(x => x.r);
}

export type OpenEvening = { day: number; reason: "noMatch" | "filtered" | "allUsed" | "full"; excluded: { eligibility: Eligibility }[] };
/** Why an evening has no suggestion: nothing passes the restrictions, every match is already in the week, or the week is
 * full. null = there are matches left (the evening was left open on purpose). */
export function openEvening<T extends EngineRecipe>(catalog: readonly T[], settings: BasicSettings, day: number, planned: Set<string>, fits: Fits<T> = any): OpenEvening | null {
  const evaluated = dinners(catalog).map(r => ({ r, eligibility: dinnerEligibility(r, settings, day) }));
  const allowed = evaluated.filter(e => e.eligibility.eligible);
  if (!allowed.length) return { day, reason: "noMatch", excluded: evaluated };
  const eligible = allowed.filter(e => fits(e.r));
  if (!eligible.length) return { day, reason: "filtered", excluded: [] };
  if (eligible.every(e => planned.has(e.r.id))) return { day, reason: "allUsed", excluded: [] };
  return planned.size >= maxPlannedRecipes ? { day, reason: "full", excluded: [] } : null;
}

/** The draft week. Removes the previous unapproved suggestion, keeps every dinner the person placed, fills the cooking
 * evenings that are empty. Leaves other evenings open. Never relaxes a restriction: an evening with no match stays open. */
export function suggestWeek<T extends EngineRecipe>(plan: PlanState, catalog: readonly T[], settings: BasicSettings, seed: string, fits: Fits<T> = any) {
  const prior = new Set(settings.setup.suggested);
  const assignments: PlanAssignment[] = plan.planAssignments.filter(a => !(a.mealType === DINNER && prior.has(a.recipeId)));
  const evenings = cookingEvenings(settings);
  const challenges = challengeDays(settings, evenings);
  const servings = householdServings(settings);
  const used = new Set(assignments.map(a => a.recipeId));
  const chosen: EngineRecipe[] = catalog.filter(r => used.has(r.id));
  const suggested: string[] = [], open: OpenEvening[] = [];
  for (const day of [...challenges, ...evenings.filter(d => !challenges.includes(d))]) {
    if (occupant({ ...plan, planAssignments: assignments }, DINNER, day)) continue;
    const pick = used.size < maxPlannedRecipes ? rankedForDay(catalog, settings, day, { exclude: used, chosen, challenge: challenges.includes(day), seed, fits })[0] : undefined;
    if (!pick) { const why = openEvening(catalog, settings, day, used, fits); if (why) open.push(why); continue; }
    assignments.push({ recipeId: pick.id, mealType: DINNER, startDay: day, spanDays: 1, ...(servings ? { servings } : {}) });
    used.add(pick.id); chosen.push(pick); suggested.push(pick.id);
  }
  // The shortlist keeps scheduled recipes first; replaced suggestions leave it. Unscheduled recipes add nothing to Groceries.
  const scheduled = [...new Set(assignments.map(a => a.recipeId))];
  const selectedIds = [...scheduled, ...plan.selectedIds.filter(id => !used.has(id) && !prior.has(id))].slice(0, maxPlannedRecipes);
  return { plan: { ...plan, selectedIds, planAssignments: assignments }, suggested, open, evenings };
}

/** "Swap dinner": the next eligible recipe for the same evening that is not in the week and was not declined. */
export function swapDinner<T extends EngineRecipe>(plan: PlanState, catalog: readonly T[], settings: BasicSettings, day: number, seed: string, fits: Fits<T> = any) {
  const current = occupant(plan, DINNER, day);
  if (!current) return null;
  const planned = new Set(plan.planAssignments.map(a => a.recipeId));
  const exclude = new Set([...planned, ...settings.setup.declined, current.recipeId]);
  const chosen = catalog.filter(r => planned.has(r.id) && r.id !== current.recipeId);
  const evenings = cookingEvenings(settings);
  const pick = rankedForDay(catalog, settings, day, { exclude, chosen, challenge: challengeDays(settings, evenings).includes(day), seed, fits })[0];
  if (!pick) return null;
  return { recipe: pick, plan: replaceDinner(plan, day, pick.id) };
}

/** Puts another recipe on an evening's dinner, keeping its servings; the old recipe leaves the shortlist if nothing else uses it. */
export function replaceDinner(plan: PlanState, day: number, recipeId: string): PlanState {
  const current = occupant(plan, DINNER, day);
  if (!current || current.recipeId === recipeId) return plan;
  const planAssignments = plan.planAssignments.map(a => (a === current ? { ...a, recipeId } : a));
  const stillUsed = planAssignments.some(a => a.recipeId === current.recipeId);
  const selectedIds = [...new Set([...plan.selectedIds.filter(id => stillUsed || id !== current.recipeId), recipeId])];
  return { ...plan, selectedIds, planAssignments };
}

// ---- The full week: 7 days × Breakfast, Lunch, Dinner ----
/** Alternatives for one slot (Swap, Choose recipe), best first. The Week filters narrow them; when no recipe passes the
 * filters, every recipe that passes the restrictions is offered instead. Restrictions are never relaxed. */
export function slotOptions<T extends EngineRecipe>(catalog: readonly T[], settings: BasicSettings, { day, meal }: Slot,
  { exclude, chosen, seed = "", fits = any }: { exclude?: Set<string>; chosen?: readonly EngineRecipe[]; seed?: string; fits?: Fits<T> } = {}): T[] {
  const challenge = meal === DINNER && challengeDays(settings, cookingEvenings(settings)).includes(day);
  const ranked = (f: Fits<T>) => rankedForDay(catalog, settings, day, { meal, exclude, chosen, challenge, seed, fits: f });
  const filtered = ranked(fits);
  return filtered.length ? filtered : ranked(any);
}

/** The proposed week. Keeps every scheduled meal and fills each empty slot with the best eligible recipe of that meal,
 * preferring one not yet in the week (a recipe repeats only when the eligible ones run out). Deterministic for a seed.
 * Returns the slots with no eligible recipe; they stay empty. */
export function proposeWeek<T extends EngineRecipe>(plan: PlanState, catalog: readonly T[], settings: BasicSettings, seed: string, fits: Fits<T> = any) {
  const servings = householdServings(settings);
  const assignments = [...plan.planAssignments];
  const uses = new Map<string, number>();
  for (const a of assignments) uses.set(a.recipeId, (uses.get(a.recipeId) ?? 0) + 1);
  const open: Slot[] = [];
  for (const meal of [...mealSlots].reverse()) for (const day of weekOrder) { // dinners first: they have the most rules
    if (occupant({ ...plan, planAssignments: assignments }, meal, day)) continue;
    const chosen = catalog.filter(r => uses.has(r.id));
    const options = slotOptions(catalog, settings, { day, meal }, { chosen, seed, fits });
    if (!options.length) { open.push({ day, meal }); continue; }
    const pick = options.reduce((best, r) => ((uses.get(r.id) ?? 0) < (uses.get(best.id) ?? 0) ? r : best)); // least used, then best ranked
    assignments.push({ recipeId: pick.id, mealType: meal, startDay: day, spanDays: 1, ...(servings ? { servings } : {}) });
    uses.set(pick.id, (uses.get(pick.id) ?? 0) + 1);
  }
  return { plan: { ...plan, planAssignments: assignments, proposed: true }, open };
}

/** First visit: no household answers, no saved settings and an empty Week. Returning people and anyone with a plan skip it. */
export const needsHouseholdSetup = (settings: BasicSettings, plan: PlanState) =>
  settings.setup.status === "new" && settings.rev === 0 && plan.selectedIds.length === 0 && plan.planAssignments.length === 0;
