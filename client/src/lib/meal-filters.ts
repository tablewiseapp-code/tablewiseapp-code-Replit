import { z } from "zod";
import { recipeStageMinutes, type RecipeTimeMode } from "./recipe-time";
import type { Recipe } from "./storage";

export const mealTypes = ["breakfast", "lunch", "dinner"] as const;
export const timeCaps = [15, 20, 30, 45, 60] as const;
export type MealType = typeof mealTypes[number];
export type MealFilters = {
  maxMinutes: typeof timeCaps[number] | null;
  mustInclude: string[];
  mustExclude: string[];
  mealTypes: MealType[];
  lunchbox: "any" | "lunchbox" | "school-lunchbox";
};
export const defaultMealFilters = (): MealFilters => ({
  maxMinutes: null, mustInclude: [], mustExclude: [], mealTypes: [], lunchbox: "any",
});

// Exact explicit tag aliases only. No title inference or default meal category.
const categoryTags: Readonly<Record<string, MealType>> = {
  breakfast: "breakfast", "meal:breakfast": "breakfast",
  lunch: "lunch", "meal:lunch": "lunch",
  dinner: "dinner", "meal:dinner": "dinner",
};
const lunchboxTags: Readonly<Record<string, "lunchbox" | "school-lunchbox">> = {
  lunchbox: "lunchbox", "lunch box": "lunchbox", "suitability:lunchbox": "lunchbox",
  "school-lunchbox": "school-lunchbox", "school lunchbox": "school-lunchbox",
  "suitability:school-lunchbox": "school-lunchbox",
};
export function normalizeIngredientTerm(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");
}
export function recipeClassification(tags: Recipe["tags"]) {
  const meals = new Set<MealType>();
  const suitability = new Set<"lunchbox" | "school-lunchbox">();
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== "string") continue;
    const key = normalizeIngredientTerm(tag);
    if (Object.hasOwn(categoryTags, key)) meals.add(categoryTags[key]);
    if (Object.hasOwn(lunchboxTags, key)) suitability.add(lunchboxTags[key]);
  }
  if (suitability.has("school-lunchbox")) suitability.add("lunchbox");
  return { mealTypes: [...meals], lunchbox: [...suitability] };
}

export function ingredientMatches(line: string, term: string): boolean {
  const normalized = normalizeIngredientTerm(term);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Unicode boundaries work for English, Russian and Hebrew, unlike \b.
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, "u")
    .test(normalizeIngredientTerm(line));
}
export function matchesMealFilters(
  recipe: Pick<Recipe, "ingredients" | "tags" | "prepTime" | "cookTime">,
  filters: MealFilters,
  mode: RecipeTimeMode,
): boolean {
  if (filters.maxMinutes !== null) {
    const minutes = recipeStageMinutes(recipe, mode);
    if (minutes === null || minutes > filters.maxMinutes) return false;
  }
  const contains = (term: string) => recipe.ingredients.some(line => ingredientMatches(line, term));
  if (filters.mustExclude.some(contains) || !filters.mustInclude.every(contains)) return false;
  const classification = recipeClassification(recipe.tags);
  if (filters.mealTypes.length && !filters.mealTypes.some(type => classification.mealTypes.includes(type))) return false;
  return filters.lunchbox === "any" || classification.lunchbox.includes(filters.lunchbox);
}

export const mealFilterPreferenceKey = "tablewise:meal-filters:v1";
const terms = z.array(z.string().min(1).max(200)).max(50);
const preferenceSchema = z.object({
  version: z.literal(1),
  filters: z.object({
    maxMinutes: z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60), z.null()]),
    mustInclude: terms, mustExclude: terms,
    mealTypes: z.array(z.enum(mealTypes)).max(3),
    lunchbox: z.enum(["any", "lunchbox", "school-lunchbox"]),
  }).strict(),
}).strict();
export function parseMealFilterPreference(raw: string | null): MealFilters {
  if (!raw || raw.length > 30_000) return defaultMealFilters();
  try {
    const result = preferenceSchema.safeParse(JSON.parse(raw));
    if (!result.success) return defaultMealFilters();
    const unique = (values: string[]) => [...new Set(values.map(normalizeIngredientTerm).filter(Boolean))];
    return {
      ...result.data.filters,
      mustInclude: unique(result.data.filters.mustInclude),
      mustExclude: unique(result.data.filters.mustExclude),
      mealTypes: [...new Set(result.data.filters.mealTypes)],
    };
  } catch { return defaultMealFilters(); }
}
export function readMealFilterPreference(): MealFilters {
  try { return parseMealFilterPreference(localStorage.getItem(mealFilterPreferenceKey)); }
  catch { return defaultMealFilters(); }
}
export function saveMealFilterPreference(filters: MealFilters): boolean {
  try {
    const value = preferenceSchema.parse({ version: 1, filters });
    localStorage.setItem(mealFilterPreferenceKey, JSON.stringify(value));
    return true;
  } catch { return false; }
}
