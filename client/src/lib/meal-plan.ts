// Writes to the same "weeklyMealsState" the /meals planner and the grocery list already read.
export const mealSlots = ["Breakfast", "Lunch", "Dinner"] as const;
export type MealSlot = typeof mealSlots[number];
export type PlanAssignment = { recipeId: string; mealType: MealSlot; startDay: number; spanDays: number; servings?: number };
export type PlanState = { selectedIds: string[]; planAssignments: PlanAssignment[] } & Record<string, unknown>;
export const planStorageKey = "weeklyMealsState";
export const lockStorageKey = "week_locked_v1";
export const maxPlannedRecipes = 12; // same cap as /meals

export type AddRequest = { recipeId: string; day: number; meal: MealSlot; servings?: number | null };
export type AddCheck =
  | { status: "free" }
  | { status: "same" }                                  // this recipe already occupies the slot
  | { status: "conflict"; existing: PlanAssignment }    // another recipe occupies the slot
  | { status: "full" };                                 // plan has no room for a new recipe

export const occupant = (plan: PlanState, meal: MealSlot, day: number) =>
  plan.planAssignments.find(a => a.mealType === meal && day >= a.startDay && day < a.startDay + a.spanDays) ?? null;

export function checkAdd(plan: PlanState, { recipeId, day, meal }: AddRequest): AddCheck {
  const existing = occupant(plan, meal, day);
  if (existing) return existing.recipeId === recipeId ? { status: "same" } : { status: "conflict", existing };
  return !plan.selectedIds.includes(recipeId) && plan.selectedIds.length >= maxPlannedRecipes ? { status: "full" } : { status: "free" };
}

/** Pure: returns a new plan. A conflicting assignment is only removed when `replace` is true. */
export function addToPlan(plan: PlanState, request: AddRequest, replace = false): PlanState {
  const check = checkAdd(plan, request);
  if (check.status === "same" || check.status === "full" || (check.status === "conflict" && !replace)) return plan;
  const kept = check.status === "conflict" ? plan.planAssignments.filter(a => a !== check.existing) : plan.planAssignments;
  const servings = request.servings && request.servings > 0 ? { servings: request.servings } : {};
  const selected = plan.selectedIds.includes(request.recipeId) ? plan.selectedIds : [...plan.selectedIds, request.recipeId];
  const stillUsed = new Set(kept.map(a => a.recipeId));
  // Drop the replaced recipe from the shortlist only if nothing else uses it.
  const selectedIds = check.status === "conflict" && !stillUsed.has(check.existing.recipeId) && check.existing.recipeId !== request.recipeId
    ? selected.filter(id => id !== check.existing.recipeId) : selected;
  return { ...plan, selectedIds, planAssignments: [...kept, { recipeId: request.recipeId, mealType: request.meal, startDay: request.day, spanDays: 1, ...servings }] };
}

export function readPlan(): PlanState {
  try {
    const parsed = JSON.parse(localStorage.getItem(planStorageKey) ?? "null");
    if (parsed && typeof parsed === "object") return { ...parsed, selectedIds: Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [], planAssignments: Array.isArray(parsed.planAssignments) ? parsed.planAssignments : [] };
  } catch { /* fall through to an empty plan */ }
  return { selectedIds: [], planAssignments: [] };
}
export const isWeekLocked = () => { try { return JSON.parse(localStorage.getItem(lockStorageKey) ?? "false") === true; } catch { return false; } };
/** Throws when the browser refuses the write, so the caller can show an error. */
export function writePlan(plan: PlanState) { localStorage.setItem(planStorageKey, JSON.stringify(plan)); }

/** Grocery scale for a recipe: planned servings / original servings. Several assignments: the largest wins. */
export function plannedServingsFactor(assignments: PlanAssignment[], recipeId: string, original: number | null): number {
  const planned = Math.max(0, ...assignments.filter(a => a.recipeId === recipeId).map(a => a.servings ?? 0));
  return original && planned ? planned / original : 1;
}

// ---- Planner edits (pure; each returns a new plan, or the same object when nothing changed) ----
export type Slot = { day: number; meal: MealSlot };
export const totalSlots = 21;
/** Occupied slots (a linked multi-day assignment fills one slot per day). */
export const plannedSlotCount = (plan: PlanState) => plan.planAssignments.reduce((sum, a) => sum + a.spanDays, 0);

/** Removes the whole assignment occupying the slot (a multi-day assignment is one linked entry). The recipe stays shortlisted. */
export function removeAt(plan: PlanState, meal: MealSlot, day: number): PlanState {
  const found = occupant(plan, meal, day);
  return found ? { ...plan, planAssignments: plan.planAssignments.filter(a => a !== found) } : plan;
}

/** Moves an assignment to a free slot, keeping its span; refuses when any target day is taken or off the week. */
export function moveTo(plan: PlanState, from: Slot, to: Slot): PlanState {
  const found = occupant(plan, from.meal, from.day);
  if (!found || (from.meal === to.meal && found.startDay === to.day)) return plan;
  if (to.day + found.spanDays > 7) return plan;
  const rest = plan.planAssignments.filter(a => a !== found);
  const blocked = Array.from({ length: found.spanDays }, (_, i) => occupant({ ...plan, planAssignments: rest }, to.meal, to.day + i)).some(Boolean);
  return blocked ? plan : { ...plan, planAssignments: [...rest, { ...found, mealType: to.meal, startDay: to.day }] };
}

/** Adds one single-day assignment of the recipe per free slot; occupied slots are skipped, never replaced. */
export function repeatOn(plan: PlanState, recipeId: string, slots: Slot[], servings?: number | null): { plan: PlanState; added: number; skipped: number } {
  let next = plan, added = 0;
  for (const { day, meal } of slots) {
    if (checkAdd(next, { recipeId, day, meal }).status !== "free") continue;
    next = addToPlan(next, { recipeId, day, meal, servings });
    added++;
  }
  return { plan: next, added, skipped: slots.length - added };
}

export function setServingsAt(plan: PlanState, meal: MealSlot, day: number, servings: number): PlanState {
  const found = occupant(plan, meal, day);
  if (!found || !(servings > 0)) return plan;
  return { ...plan, planAssignments: plan.planAssignments.map(a => a === found ? { ...a, servings } : a) };
}
