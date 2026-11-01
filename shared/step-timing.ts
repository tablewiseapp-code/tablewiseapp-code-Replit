import { z } from "zod";

export const timingContextSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ingredients: z.array(z.string().trim().min(1).max(1000)).min(1).max(100),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(100),
  prepTime: z.number().int().min(0).max(10080).nullable().optional(),
  cookTime: z.number().int().min(0).max(10080).nullable().optional(),
  servings: z.string().trim().min(1).max(40).nullable().optional(),
}).strict().refine(value => JSON.stringify(value).length <= 16000, "Recipe is too long for timing analysis.");
export type TimingContext = z.infer<typeof timingContextSchema>;
export function timingContext(value: TimingContext): string {
  return JSON.stringify({
    title: value.title, ingredients: value.ingredients, steps: value.steps,
    prepTime: value.prepTime ?? null, cookTime: value.cookTime ?? null,
    servings: value.servings ?? null,
  });
}
export const stepDurationSchema = z.object({
  text: z.string().min(1).max(2000),
  min: z.number().int().positive().max(604800),
  max: z.number().int().positive().max(604800),
  unit: z.enum(["seconds", "minutes", "hours"]),
  provenance: z.enum(["source", "estimate"]),
}).strict().refine(v => v.max >= v.min && v.max * ({ seconds: 1, minutes: 60, hours: 3600 }[v.unit]) <= 604800);
export const stepAnalysisSchema = z.object({
  version: z.literal(1),
  context: z.string().max(20000),
  steps: z.array(stepDurationSchema).min(1).max(100),
  warnings: z.array(z.string().trim().min(1).max(500)).max(10),
}).strict();
export type StepAnalysis = z.infer<typeof stepAnalysisSchema>;
export type StepDuration = StepAnalysis["steps"][number];
export function analysisMatches(value: TimingContext, analysis: StepAnalysis): boolean {
  return analysis.context === timingContext(value) && analysis.steps.length === value.steps.length &&
    analysis.steps.every((step, index) => step.text === value.steps[index]);
}

// Preserve simple explicit numeric durations locally, rather than trusting the
// model to turn a stated range into a precise estimate. Other phrasing is handled
// by the model with the original step present for review.
export function statedDuration(text: string): Omit<StepDuration, "text" | "provenance"> | null {
  const pattern = /(\d+(?:\.\d+)?)\s*(?:[-–—]|to|до)?\s*(\d+(?:\.\d+)?)?\s*(seconds?|secs?|секунд\w*|minutes?|mins?|минут\w*|hours?|hrs?|час\w*|שניות|דקות|שעות)(?![a-z])/giu;
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const [, a, b, rawUnit] = matches[0];
  const unit: StepDuration["unit"] = /^(s|сек|שניות)/i.test(rawUnit) ? "seconds" :
    /^(h|час|שעות)/i.test(rawUnit) ? "hours" : "minutes";
  const min = Number(a), max = Number(b ?? a);
  const factor = { seconds: 1, minutes: 60, hours: 3600 }[unit];
  const result = Number.isInteger(min) && Number.isInteger(max)
    ? { min, max, unit }
    : { min: min * factor, max: max * factor, unit: "seconds" as const };
  return stepDurationSchema.safeParse({ ...result, text, provenance: "source" }).success ? result : null;
}
