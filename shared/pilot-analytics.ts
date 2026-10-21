import { z } from "zod";

export const analyticsNames = ["planner_opened", "meal_selected", "plan_completed", "grocery_list_opened", "next_week_plan_created"] as const;
export type AnalyticsName = typeof analyticsNames[number];
export type ClientEventName = Exclude<AnalyticsName, "next_week_plan_created">;
export const analyticsWeek = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return value >= "2000-01-01" && value <= "2100-12-31" &&
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
});
const base = {
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  week: analyticsWeek,
};
export const clientEventSchema = z.discriminatedUnion("name", [
  z.object({ ...base, name: z.literal("planner_opened") }).strict(),
  z.object({ ...base, name: z.literal("meal_selected"), recipeId: z.string().min(1).max(150).regex(/^[a-zA-Z0-9:_-]+$/) }).strict(),
  z.object({ ...base, name: z.literal("plan_completed") }).strict(),
  z.object({ ...base, name: z.literal("grocery_list_opened") }).strict(),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;
export const analyticsBatchSchema = z.object({
  pilotId: z.string().uuid(),
  events: z.array(clientEventSchema).min(1).max(20),
}).strict();
export type AnalyticsBatch = z.infer<typeof analyticsBatchSchema>;
export function analyticsEventKey(event: ClientEvent): string {
  return JSON.stringify([event.name, event.week, event.name === "meal_selected" ? event.recipeId : ""]);
}
export function validEventTimes(batch: AnalyticsBatch, now: number) {
  return batch.events.every(event => {
    const time = Date.parse(event.occurredAt);
    return time >= now - 90 * 86_400_000 && time <= now + 300_000;
  });
}
