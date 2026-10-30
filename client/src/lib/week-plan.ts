import { z } from "zod";

export function calendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100) return null;
  const date = new Date(year, month - 1, day, 12);
  return calendarDate(date) === value ? date : null;
}
export function addDays(value: string, days: number): string {
  const date = parseCalendarDate(value);
  if (!date) throw new Error("Invalid calendar date");
  date.setDate(date.getDate() + days);
  return calendarDate(date);
}
export function currentWeek(date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  local.setDate(local.getDate() - (local.getDay() + 6) % 7);
  return calendarDate(local);
}
export const isWeek = (value: string) => parseCalendarDate(value)?.getDay() === 1;
export const weekDays = (week: string) => Array.from({ length: 7 }, (_, day) => addDays(week, day));
export function selectedWeek(search: string): string | null {
  const query = new URLSearchParams(search);
  const value = query.get("week");
  return value === null ? currentWeek() : isWeek(value) ? value : null;
}
export const planKey = (week: string) => `tablewise:mvp:plan:v1:${week}`;
export const checkKey = (week: string) => `tablewise:mvp:grocery:v1:${week}`;
export const plannerURL = (week: string) => `/plan?week=${week}`;
export const plannerRecipeURL = (id: string, week: string) =>
  `/recipe/${encodeURIComponent(id)}?week=${week}`;
export function recipePlannerURL(search: string): string {
  const weeks = new URLSearchParams(search).getAll("week");
  return weeks.length === 1 && isWeek(weeks[0]) ? plannerURL(weeks[0]) : "/plan";
}
export const groceryURL = (week: string) => `/grocery-list?source=mvp&week=${week}`;
const id = z.string().min(1).max(150);
export const weekPlanSchema = z.object({
  version: z.literal(1),
  weekStart: z.string().refine(isWeek),
  selectedRecipeIds: z.array(id).max(3),
  assignments: z.record(id, z.string()),
  confirmed: z.boolean(),
}).strict().superRefine((plan, ctx) => {
  const entries = Object.entries(plan.assignments);
  const days = isWeek(plan.weekStart) ? weekDays(plan.weekStart) : [];
  const invalid = new Set(plan.selectedRecipeIds).size !== plan.selectedRecipeIds.length ||
    entries.length > 3 || entries.some(([recipe, day]) => !plan.selectedRecipeIds.includes(recipe) || !days.includes(day)) ||
    new Set(entries.map(([, day]) => day)).size !== entries.length ||
    (plan.confirmed && (plan.selectedRecipeIds.length !== 3 || entries.length !== 3));
  if (invalid) ctx.addIssue({ code: "custom", message: "Invalid dinner assignments" });
});
export type WeekPlan = z.infer<typeof weekPlanSchema>;
export const emptyPlan = (week: string): WeekPlan => ({
  version: 1, weekStart: week, selectedRecipeIds: [], assignments: {}, confirmed: false,
});
export function toggleDinner(plan: WeekPlan, recipeId: string): WeekPlan {
  if (plan.selectedRecipeIds.includes(recipeId)) {
    const assignments = { ...plan.assignments };
    delete assignments[recipeId];
    return { ...plan, selectedRecipeIds: plan.selectedRecipeIds.filter(value => value !== recipeId), assignments, confirmed: false };
  }
  if (plan.selectedRecipeIds.length >= 3) return plan;
  return weekPlanSchema.parse({ ...plan, selectedRecipeIds: [...plan.selectedRecipeIds, recipeId], confirmed: false });
}
export function replaceDinner(plan: WeekPlan, previous: string, replacement: string): WeekPlan {
  if (!plan.selectedRecipeIds.includes(previous) || previous === replacement || plan.selectedRecipeIds.includes(replacement)) return plan;
  const assignments = { ...plan.assignments };
  const previousDay = assignments[previous];
  delete assignments[previous];
  if (previousDay) assignments[replacement] = previousDay;
  return weekPlanSchema.parse({
    ...plan, selectedRecipeIds: plan.selectedRecipeIds.map(value => value === previous ? replacement : value),
    assignments, confirmed: false,
  });
}
export function assignDinner(plan: WeekPlan, recipeId: string, day: string): WeekPlan {
  const assignments = { ...plan.assignments };
  if (day) assignments[recipeId] = day;
  else delete assignments[recipeId];
  return weekPlanSchema.parse({ ...plan, assignments, confirmed: false });
}
export const canConfirm = (plan: WeekPlan) => weekPlanSchema.safeParse({ ...plan, confirmed: true }).success;
export const confirmPlan = (plan: WeekPlan) => weekPlanSchema.parse({ ...plan, confirmed: true });
export const groceryChecksSchema = z.object({
  version: z.literal(1), weekStart: z.string().refine(isWeek),
  checkedIds: z.array(z.string().min(1).max(350000)).max(3000),
}).strict();
export type GroceryChecks = z.infer<typeof groceryChecksSchema>;
