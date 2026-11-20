// The Week as a cooking plan (docs/cooking-plan.md): dated dishes, each cooked once and serving one or more dates.
// Postgres (week_plans, one row per calendar week) is the source of truth; localStorage "weeklyMealsState" is the
// synchronous copy of the current calendar week that every page reads. Other weeks are read and written on the server
// only (fetchWeek, saveWeek). The same key also holds the recipe browser's filters, which these writes keep.
import { defaultServe, fromLegacy, isLegacyPlan, planStatus, shiftDate, type Batch, type HouseholdCounts, type Serve } from "@shared/cooking-plan";
import { currentWeek } from "./week-plan";

export type { Batch, Serve } from "@shared/cooking-plan";
/** A recipe's meal type (catalog data, Settings meal rules). The plan itself has no meal slots. */
export const mealSlots = ["Breakfast", "Lunch", "Dinner"] as const;
export type MealSlot = typeof mealSlots[number];
/** selectedIds: the recipe browser's picks. approved: the dishes as last approved (Groceries use them); null = never.
 * proposed: the week's draft was made once, so it is not made again. */
export type PlanState = { selectedIds: string[]; batches: Batch[]; approved: Batch[] | null; weekStart?: string; proposed?: boolean } & Record<string, unknown>;
export const planStorageKey = "weeklyMealsState";
/** Before cooking days the approval was a separate browser flag; read once for conversion, cleared on sign-out. */
export const lockStorageKey = "week_locked_v1";
export const maxPlannedRecipes = 12; // the recipe browser's picks
export const maxDishes = 42;
export const emptyPlan = (weekStart?: string): PlanState => ({ selectedIds: [], batches: [], approved: null, ...(weekStart ? { weekStart, proposed: false } : {}) });
export const newBatchId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 36);

/** A stored plan in any earlier shape → today's shape. Breakfast/Lunch/Dinner slots become dated dishes. */
function normalize(parsed: Record<string, unknown>, week: string): PlanState {
  const { planAssignments, ...rest } = parsed;
  const selectedIds = Array.isArray(parsed.selectedIds) ? parsed.selectedIds as string[] : [];
  if (!Array.isArray(parsed.batches) && isLegacyPlan(planAssignments)) {
    const batches = fromLegacy(typeof parsed.weekStart === "string" ? parsed.weekStart : week, planAssignments);
    let locked = false;
    try { locked = JSON.parse(localStorage.getItem(lockStorageKey) ?? "false") === true; } catch { /* draft */ }
    return { ...rest, selectedIds, batches, approved: locked ? batches : null };
  }
  return { ...rest, selectedIds, batches: Array.isArray(parsed.batches) ? parsed.batches as Batch[] : [], approved: Array.isArray(parsed.approved) ? parsed.approved as Batch[] : null };
}
export function readPlan(): PlanState {
  try {
    const parsed = JSON.parse(localStorage.getItem(planStorageKey) ?? "null");
    if (parsed && typeof parsed === "object") return normalize(parsed, currentWeek());
  } catch { /* fall through to an empty plan */ }
  return emptyPlan();
}
/** Throws when the browser refuses the write, so the caller can show an error. */
export function writePlan(plan: PlanState) { localStorage.setItem(planStorageKey, JSON.stringify(plan)); pushWeekPlan(); }

// ---- Server copy ----
type ServerWeek = { weekStart: string; proposed: boolean; selectedIds: string[]; batches: Batch[]; approved: Batch[] | null };
const body = (week: string, plan: PlanState) =>
  JSON.stringify({ weekStart: week, proposed: plan.proposed === true, selectedIds: plan.selectedIds, batches: plan.batches, approved: plan.approved } satisfies ServerWeek);
const copyWeek = () => readPlan().weekStart ?? currentWeek(); // a tab left open past Sunday still saves the week it shows
const synced = () => body(copyWeek(), readPlan());
const lastQueued = new Map<string, string>();
let queue = Promise.resolve();
function put(week: string, text: string) {
  if (lastQueued.get(week) === text) return;
  lastQueued.set(week, text);
  queue = queue.then(() => fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: text, keepalive: true }))
    .then(r => { if (!r.ok) throw new Error(); })
    .catch(() => { if (lastQueued.get(week) === text) lastQueued.delete(week); }); // retried on the next change
}
/** Sends the browser copy (the current week) to the server when it changed. Requests go one at a time, in order. */
export function pushWeekPlan() { put(copyWeek(), synced()); }

/** Run once before pages read the plan. The server copy of the current week wins; a browser plan with no server copy is
 * uploaded once if it belongs to this week (or predates dated weeks); a plan left from an earlier week is cleared. */
export async function syncWeekPlan() {
  const week = currentWeek();
  const response = await fetch(`/api/week-plan?week=${week}`);
  if (!response.ok) return;
  const server: ServerWeek | null = await response.json();
  const local = readPlan();
  localStorage.removeItem(lockStorageKey); // folded into `approved` by readPlan
  if (!server) {
    const fresh = local.weekStart === undefined || local.weekStart === week;
    localStorage.setItem(planStorageKey, JSON.stringify(fresh ? { ...local, weekStart: week } : { ...local, ...emptyPlan(week) }));
    if (readPlan().selectedIds.length || readPlan().batches.length) pushWeekPlan();
    return;
  }
  localStorage.setItem(planStorageKey, JSON.stringify({ ...local, weekStart: week, proposed: server.proposed, selectedIds: server.selectedIds, batches: server.batches, approved: server.approved }));
  lastQueued.set(week, synced());
}

/** Any week's plan. The current week comes from the browser copy; others from the server (empty if never saved). */
export async function fetchWeek(week: string): Promise<PlanState> {
  if (week === currentWeek()) return readPlan();
  const response = await fetch(`/api/week-plan?week=${week}`);
  if (!response.ok) throw new Error("week");
  const server: ServerWeek | null = await response.json();
  if (!server) return emptyPlan(week);
  lastQueued.set(week, body(week, { ...emptyPlan(), ...server }));
  return { selectedIds: server.selectedIds, batches: server.batches, approved: server.approved, weekStart: week, proposed: server.proposed };
}
/** Saves any week. The current week goes through the browser copy (Home and Groceries read it); throws when the browser refuses. */
export function saveWeek(week: string, plan: PlanState) {
  if (week !== currentWeek()) return put(week, body(week, plan));
  localStorage.setItem(planStorageKey, JSON.stringify({ ...readPlan(), ...plan, weekStart: week }));
  pushWeekPlan();
}
export const statusOf = (plan: PlanState) => planStatus(plan.batches, plan.approved);
/** Approve cooking plan / Save changes: Groceries now use exactly these dishes. */
export const approvePlan = (plan: PlanState): PlanState => ({ ...plan, approved: structuredClone(plan.batches) });

// ---- Edits (pure; each returns a new plan, or the same object when nothing changed) ----
export const cookedOn = (plan: PlanState, date: string) => plan.batches.filter(b => b.cookDate === date);
/** Dishes cooked earlier that are eaten on this date (Home: "Cooked Sun"). */
export const servedFrom = (plan: PlanState, date: string) => plan.batches.filter(b => b.cookDate !== date && b.serves.some(s => s.date === date));

/** + Add a dish: a new dish on that date, beside any already there; its first serving date is the cooking date. */
export function addBatch(plan: PlanState, recipeId: string, cookDate: string, household: HouseholdCounts | null, id = newBatchId()): PlanState {
  if (plan.batches.length >= maxDishes) return plan;
  return { ...plan, batches: [...plan.batches, { id, recipeId, cookDate, serves: [defaultServe(cookDate, household)] }] };
}
/** Swap dish: another recipe in the same place; dates and portions stay, the yield comes from the new recipe. */
export function swapBatch(plan: PlanState, id: string, recipeId: string): PlanState {
  const found = plan.batches.find(b => b.id === id);
  if (!found || found.recipeId === recipeId) return plan;
  const { yield: _old, ...rest } = found;
  return { ...plan, batches: plan.batches.map(b => (b === found ? { ...rest, recipeId } : b)) };
}
/** Edit servings: the dish's serving dates and amounts (and a yield the recipe lacks). */
export function setServes(plan: PlanState, id: string, serves: Serve[], recipeYield?: number): PlanState {
  const sorted = [...serves].sort((a, b) => a.date.localeCompare(b.date));
  return { ...plan, batches: plan.batches.map(b => {
    if (b.id !== id) return b;
    const { yield: _old, ...rest } = b;
    return { ...rest, serves: sorted, ...(recipeYield ? { yield: recipeYield } : b.yield ? { yield: b.yield } : {}) };
  }) };
}
export const removeBatch = (plan: PlanState, id: string): PlanState => ({ ...plan, batches: plan.batches.filter(b => b.id !== id) });
/** Undo of Remove dish: back in its place, unless it is there again already. */
export function restoreBatch(plan: PlanState, batch: Batch, index: number): PlanState {
  if (plan.batches.some(b => b.id === batch.id)) return plan;
  const batches = [...plan.batches];
  batches.splice(Math.min(index, batches.length), 0, batch);
  return { ...plan, batches };
}

/** Serving dates that would fall before the new cooking date when every dish of `from` moves to `to`. */
export type MoveConflict = { batchId: string; date: string };
export const moveConflicts = (plan: PlanState, from: string, to: string): MoveConflict[] =>
  cookedOn(plan, from).flatMap(b => b.serves.filter(s => s.date < to).map(s => ({ batchId: b.id, date: s.date })));
/** Move cooking day: every dish of `from` moves to `to`, beside what is there. A conflicting serving date is moved to `to`
 * ("move", added to that date's amount if it already has one) or dropped ("remove"); `amount` gives a date's servings.
 * Returns null when a conflict is unresolved or a dish would be left with no serving date; nothing is applied then. */
export function moveCookingDay(plan: PlanState, from: string, to: string, resolve: Record<string, "move" | "remove">,
  amount: (batch: Batch, serve: Serve) => number): PlanState | null {
  if (from === to) return plan;
  const moved: Batch[] = [];
  for (const b of cookedOn(plan, from)) {
    const keep = b.serves.filter(s => s.date >= to);
    const late = b.serves.filter(s => s.date < to);
    if (late.some(s => !resolve[`${b.id}:${s.date}`])) return null;
    const carried = late.filter(s => resolve[`${b.id}:${s.date}`] === "move").reduce((sum, s) => sum + amount(b, s), 0);
    let serves = keep;
    if (carried > 0) {
      const there = keep.find(s => s.date === to);
      serves = there ? keep.map(s => (s === there ? { date: to, servings: amount(b, there) + carried } : s)) : [{ date: to, servings: carried }, ...keep];
    }
    if (!serves.length) return null;
    moved.push({ ...b, cookDate: to, serves: serves.sort((x, y) => x.date.localeCompare(y.date)) });
  }
  const byId = new Map(moved.map(b => [b.id, b]));
  // Moved dishes go after the dishes already on the destination.
  return { ...plan, batches: [...plan.batches.filter(b => !byId.has(b.id)), ...moved] };
}
/** The serving dates the editor offers: the cooking date through the end of the following week. */
export const servingDateChoices = (cookDate: string, weekStart: string) => {
  const last = shiftDate(weekStart, 13);
  const out: string[] = [];
  for (let d = cookDate; d <= last; d = shiftDate(d, 1)) out.push(d);
  return out;
};
