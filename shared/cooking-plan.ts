// The Week as a cooking plan: dishes (batches) cooked on a date, each serving one or more dates. Pure; used by the
// client (planner, Home, groceries, recipe page) and the server (legacy conversion of saved weeks).
// Dates are local calendar dates "YYYY-MM-DD"; arithmetic is done in UTC on the date alone, so no timezone can shift a day.

/** One serving date of a dish. `servings` (direct, in half servings) replaces adults + kids × 0.5. With neither, the
 * date eats the recipe's original yield (a household without counts, or a plan saved before cooking days). */
export type Serve = { date: string; adults?: number; kids?: number; servings?: number };
/** One planned dish: cooked once on `cookDate`. `yield` is asked for when the recipe states none. */
export type Batch = { id: string; recipeId: string; cookDate: string; serves: Serve[]; yield?: number };
export type HouseholdCounts = { adults: number; kids: number };

export const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
/** 0 = Sunday … 6 = Saturday, as Date.getDay(). */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** The date of a weekday (0 = Sunday) in the week that starts on Monday `weekStart`. */
export const dateInWeek = (weekStart: string, day: number) => shiftDate(weekStart, (day + 6) % 7);
export const isCalendarDate = (value: string) => /^20\d\d-\d\d-\d\d$/.test(value) && shiftDate(value, 0) === value;

export const halfServings = (n: number) => Math.round(n * 2) / 2;
/** Servings for one date. `recipeYield` is used only for a date with no counts and no direct amount. */
export function serveAmount(serve: Serve, recipeYield: number | null): number {
  if (serve.servings !== undefined) return serve.servings;
  if (serve.adults !== undefined || serve.kids !== undefined) return (serve.adults ?? 0) + (serve.kids ?? 0) * 0.5;
  return recipeYield ?? 0;
}
export const batchYield = (batch: Batch, recipeYield: number | null) => batch.yield ?? (recipeYield && recipeYield > 0 ? recipeYield : null);
/** "Make X servings": the sum across the serving dates. */
export const batchTotal = (batch: Batch, recipeYield: number | null) =>
  batch.serves.reduce((sum, serve) => sum + serveAmount(serve, batchYield(batch, recipeYield)), 0);
/** Ingredient scale from the original quantities; null when the yield is unknown (the editor asks for it). */
export function batchFactor(batch: Batch, recipeYield: number | null): number | null {
  const base = batchYield(batch, recipeYield);
  return base ? batchTotal(batch, recipeYield) / base : null;
}
/** A new dish's first serving date: the household's counts, else the recipe's yield. */
export const defaultServe = (date: string, household: HouseholdCounts | null): Serve =>
  household ? { date, adults: household.adults, kids: household.kids } : { date };

/** What the editor and the server both refuse. Positive totals are checked by the editor, which knows the recipe's yield. */
export function batchProblem(batch: Batch): "noDates" | "duplicate" | "beforeCooking" | null {
  if (!batch.serves.length) return "noDates";
  if (new Set(batch.serves.map(s => s.date)).size !== batch.serves.length) return "duplicate";
  return batch.serves.some(s => s.date < batch.cookDate) ? "beforeCooking" : null;
}

/** Same dishes, dates and amounts, whatever the key order (jsonb reorders keys). */
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  : value;
export const sameBatches = (a: readonly Batch[] | null, b: readonly Batch[] | null) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export type PlanStatus = "draft" | "approved" | "changed";
export const planStatus = (batches: readonly Batch[], approved: readonly Batch[] | null): PlanStatus =>
  approved === null ? "draft" : sameBatches(batches, approved) ? "approved" : "changed";

/** Plans saved before cooking days: Breakfast/Lunch/Dinner slots by weekday (0 = Sunday) with an optional span.
 * Each becomes a dish cooked on that date of the week, serving the following spanned days; servings are split evenly. */
export type LegacyAssignment = { recipeId: string; mealType: string; startDay: number; spanDays: number; servings?: number };
export const isLegacyPlan = (items: unknown): items is LegacyAssignment[] =>
  Array.isArray(items) && items.some(item => item && typeof item === "object" && "mealType" in item);
export function fromLegacy(weekStart: string, items: LegacyAssignment[]): Batch[] {
  return items.map((a, index) => {
    const cookDate = dateInWeek(weekStart, a.startDay);
    const span = Math.max(1, a.spanDays);
    const each = a.servings ? Math.max(0.5, halfServings(a.servings / span)) : undefined;
    return { id: `legacy-${index}`, recipeId: a.recipeId, cookDate,
      serves: Array.from({ length: span }, (_, i) => ({ date: shiftDate(cookDate, i), ...(each ? { servings: each } : {}) })) };
  });
}
