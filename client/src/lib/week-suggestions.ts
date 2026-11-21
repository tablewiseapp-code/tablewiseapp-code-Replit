// Your household → a suggested cooking plan, from the catalog only (works with AI off). Pure and deterministic.
// Hard restrictions come from checkEligibility (preference-engine.ts), the one rule every suggestion uses; this file only
// picks evenings and ranks the eligible recipes. Plan days: 0 = Sunday … 6 = Saturday, as in meal-plan.ts.
import { householdCounts, type BasicSettings } from "./basic-settings";
import { addBatch, cookedOn, mealSlots, type MealSlot, type PlanState } from "./meal-plan";
import { dateInWeek } from "@shared/cooking-plan";
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

/** Restrictions apply to the dish's own meal type (a breakfast recipe follows the breakfast rules). */
type Slot = { day: number; meal: MealSlot };
const dedupe = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter(r => !seen.has(r.id) && !!seen.add(r.id)); };
const isChallenge = (settings: BasicSettings, day: number) => challengeDays(settings, cookingEvenings(settings)).includes(day);

/** + Add a dish / Swap dish / the draft: eligible recipes for that weekday, best first: dinners, then lunches, then
 * breakfasts. The Week filters narrow them; when no recipe passes the filters, `fallback` (the filters without the Deal)
 * is tried, then every recipe that passes the restrictions. Restrictions are never relaxed. */
export function dishOptions<T extends EngineRecipe>(catalog: readonly T[], settings: BasicSettings, day: number,
  { exclude, chosen, seed = "", fits = any, fallback, meal: first }: { exclude?: Set<string>; chosen?: readonly EngineRecipe[]; seed?: string; fits?: Fits<T>; fallback?: Fits<T>; meal?: MealSlot } = {}): T[] {
  const challenge = isChallenge(settings, day);
  // That meal's recipes first (+ Add breakfast), then dinners, lunches, breakfasts.
  const order = [...mealSlots].reverse().sort((a, b) => Number(b === first) - Number(a === first));
  const ranked = (f: Fits<T>) => dedupe(order.flatMap(meal =>
    rankedForDay(catalog, settings, day, { meal, exclude, chosen, challenge: challenge && meal === DINNER, seed, fits: f })));
  const filtered = ranked(fits);
  if (filtered.length) return filtered;
  const loose = fallback ? ranked(fallback) : [];
  return loose.length ? loose : ranked(any);
}
export type { Slot };

/** The draft cooking plan (made once per week; docs/cooking-plan.md). Every preferred weekday is a cooking day, more are
 * added until the weekly count is met (cookingEvenings). A cooking day that already has a dish keeps it; an empty one
 * gets one dish not yet in the week (a recipe repeats only when the eligible ones run out). Deterministic for a seed. */
export function proposeCookingPlan<T extends EngineRecipe>(plan: PlanState, catalog: readonly T[], settings: BasicSettings, weekStart: string,
  { fits = any, fallback, newId }: { fits?: Fits<T>; fallback?: Fits<T>; newId?: () => string } = {}) {
  const household = householdCounts(settings);
  const days = cookingEvenings(settings);
  const challenges = challengeDays(settings, days);
  let next: PlanState = plan;
  const used = new Set(plan.batches.map(b => b.recipeId));
  const suggested: string[] = [];
  for (const day of [...challenges, ...days.filter(d => !challenges.includes(d))]) { // the challenge evening picks first
    const date = dateInWeek(weekStart, day);
    if (cookedOn(next, date).length) continue;
    const chosen = catalog.filter(r => used.has(r.id));
    const pick = dishOptions(catalog, settings, day, { exclude: used, chosen, seed: weekStart, fits, fallback })[0]
      ?? dishOptions(catalog, settings, day, { chosen, seed: weekStart, fits, fallback })[0];
    if (!pick) continue;
    next = addBatch(next, pick.id, date, household, newId?.());
    used.add(pick.id); suggested.push(pick.id);
  }
  return { plan: { ...next, proposed: true }, suggested, days };
}

/** First visit: no household answers, no saved settings and an empty Week. Returning people and anyone with a plan skip it. */
export const needsHouseholdSetup = (settings: BasicSettings, plan: PlanState) =>
  settings.setup.status === "new" && settings.rev === 0 && plan.selectedIds.length === 0 && plan.batches.length === 0;
