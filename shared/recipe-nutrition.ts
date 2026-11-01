import { z } from "zod";

export const nutrientKeys = ["caloriesKcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG"] as const;
export type NutrientKey = typeof nutrientKeys[number];
const amount = z.number().finite().min(0).max(100000);
export const nutrientTotalsSchema = z.object({
  caloriesKcal: z.number().finite().min(0).max(1000000),
  proteinG: amount, carbsG: amount, fatG: amount, fiberG: amount, sugarG: amount,
}).strict().superRefine((value, ctx) => {
  if (value.sugarG > value.carbsG + 0.1 || value.fiberG > value.carbsG + 0.1) {
    ctx.addIssue({ code: "custom", message: "Sugar and fiber cannot exceed total carbohydrates." });
  }
});
export const nutritionModelOutputSchema = z.object({
  totals: nutrientTotalsSchema,
  assumptions: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
}).strict();
export const recipeNutritionSchema = nutritionModelOutputSchema.extend({
  version: z.literal(1),
  source: z.literal("ai-estimate"),
  model: z.string().min(1).max(100),
  analyzedAt: z.string().datetime(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type RecipeNutrition = z.infer<typeof recipeNutritionSchema>;
export type NutritionFields = {
  nutrition?: RecipeNutrition | null;
  nutritionStatus?: "ready" | "not-analyzed" | "unavailable";
};
export type NutritionInput = {
  id: string; title: string; ingredients: string[]; steps?: string[]; servings?: string | null;
};

export function servingRange(servings?: string | null): { min: number; max: number } | null {
  const match = servings?.trim().match(/^(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?(?:\s*(?:servings?|portions?|people|persons?))?$/i);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  return min > 0 && max >= min && max <= 999 ? { min, max } : null;
}

export function nutritionAmounts(nutrition: RecipeNutrition, servings?: string | null) {
  const portions = nutritionBasis(servings);
  return nutrientKeys.map(key => ({
    key,
    min: nutrition.totals[key] / (portions?.max ?? 1),
    max: nutrition.totals[key] / (portions?.min ?? 1),
  }));
}

export function nutritionBasis(servings?: string | null) {
  const portions = servingRange(servings);
  if (portions) return { ...portions, unit: "portion" };
  // A recipe yield is not a number of people: label it explicitly per item.
  const match = servings?.trim().match(/^(\d{1,3}(?:\s*(?:-|–|—|to)\s*\d{1,3})?)\s+(muffins?|quesadillas?|tacos?|pancakes?|slices?|cookies?|biscuits?|pieces?)$/i);
  const count = match ? servingRange(match[1]) : null;
  return match && count ? { ...count, unit: match[2].toLowerCase().replace(/s$/, "") } : null;
}
