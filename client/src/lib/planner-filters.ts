import { recipeStageMinutes, type RecipeTimeMode } from "./recipe-time";
import type { PlannerRecipe } from "./planner-recipes";
import { recipeCuisine } from "../../../shared/food-rules";

// The Meals page (/meals) filters. One implementation shared by the page and the AI generator's compliance check.
export const plannerTimeOptions = [20, 30, 40, 60] as const;
export const plannerDietary = ["Vegetarian", "Kid friendly", "Gluten-free"] as const;
export const plannerMealTypes = ["Breakfast", "Lunch", "Dinner", "Lunch box"] as const;
export const plannerCookingMethods = ["Oven", "Air fryer", "Stovetop", "Microwave", "No-cook"] as const;
export const plannerProteinTypes = ["Chicken", "Beef", "Seafood", "Plant-based"] as const;
export const plannerServings = ["1-2", "3-4", "5+"] as const;
export const dietaryTag = { Vegetarian: "vegetarian", "Kid friendly": "kidFriendly", "Gluten-free": "glutenFree" } as const;

export type PlannerFilters = {
  maxMinutes: number | null;
  dietary: string[];
  mealType: string[];
  cookingMethod: string[];
  source: string[];
  proteinType: string[];
  withNotes: boolean;
  modifiedByMe: boolean;
  myPicks: boolean;
  minRating: number | null;
  servings: string | null;
  mustInclude: string[];
  mustExclude: string[];
  /** Optional so older saved filters and callers stay valid. Matches the recipe's cuisine tag. */
  cuisine?: string[];
};
export type PlannerMeta = { isMyPick: boolean; rating: number | null };
type Filterable = Pick<PlannerRecipe, "tags" | "mealType" | "tools" | "sourceType" | "proteinType" | "hasNotes" |
  "modifiedByMe" | "servingsRange" | "ingredients" | "prepTime" | "cookTime">;

export function matchesPlannerFilters(recipe: Filterable, filters: PlannerFilters, timeMode: RecipeTimeMode, meta: PlannerMeta): boolean {
  if (filters.maxMinutes !== null) {
    const minutes = recipeStageMinutes(recipe, timeMode);
    if (minutes === null || minutes > filters.maxMinutes) return false;
  }
  if (filters.dietary.length > 0) {
    const hasDietary = filters.dietary.every(d => {
      const tag = dietaryTag[d as keyof typeof dietaryTag];
      return tag ? recipe.tags.includes(tag) : true;
    });
    if (!hasDietary) return false;
  }
  if (filters.mealType.length > 0 && !filters.mealType.includes(recipe.mealType)) return false;
  if (filters.cookingMethod.length > 0 && !filters.cookingMethod.some(m => recipe.tools.includes(m))) return false;
  if (filters.source.length > 0 && !filters.source.includes(recipe.sourceType)) return false;
  if (filters.proteinType.length > 0 && !filters.proteinType.includes(recipe.proteinType)) return false;
  if (filters.withNotes && !recipe.hasNotes) return false;
  if (filters.modifiedByMe && !recipe.modifiedByMe) return false;
  if (filters.myPicks && !meta.isMyPick) return false;
  if (filters.minRating !== null && (!meta.rating || meta.rating < filters.minRating)) return false;
  if (filters.servings && !recipe.servingsRange.includes(filters.servings.replace("+", ""))) return false;
  if (filters.mustInclude.length > 0 &&
      !filters.mustInclude.every(ing => recipe.ingredients.some(i => i.toLowerCase().includes(ing)))) return false;
  if (filters.cuisine?.length && !filters.cuisine.includes(recipeCuisine(recipe.tags) ?? "")) return false;
  if (filters.mustExclude.length > 0 &&
      filters.mustExclude.some(ing => recipe.ingredients.some(i => i.toLowerCase().includes(ing)))) return false;
  return true;
}

// Name search: case/accent-insensitive, any word order, prefix per word ("pump pie"), simple English plurals ("pies").
// Both sides get the same stem, so pie/pies, cookie/cookies and berry/berries meet at "pi", "cooki", "berri".
const singular = (word: string) => (
  word.length > 4 && word.endsWith("ies") ? `${word.slice(0, -3)}i` :
  word.length > 4 && /(?:ch|sh|x|ss|o)es$/.test(word) ? word.slice(0, -2) :
  word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word
).replace(/(?:ie|y)$/, "i");
const nameWords = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(singular);
export function recipeNameMatches(title: string, query: string): boolean {
  const wanted = nameWords(query);
  const words = nameWords(title);
  return wanted.every(word => words.some(candidate => candidate.startsWith(word)));
}

/** What a new recipe can be generated for. Personal filters (picks, ratings, notes, source) describe existing recipes only. */
export type MealsGenerationFilters = Pick<PlannerFilters,
  "maxMinutes" | "dietary" | "mealType" | "cookingMethod" | "proteinType" | "servings" | "mustInclude" | "mustExclude">;
export type NotAppliedFilter = "source" | "withNotes" | "modifiedByMe" | "myPicks" | "minRating" | "cuisine";

export function mealsGenerationFilters(filters: PlannerFilters): { filters: MealsGenerationFilters; notApplied: NotAppliedFilter[] } {
  const notApplied: NotAppliedFilter[] = [];
  if (filters.source.length) notApplied.push("source");
  if (filters.withNotes) notApplied.push("withNotes");
  if (filters.modifiedByMe) notApplied.push("modifiedByMe");
  if (filters.myPicks) notApplied.push("myPicks");
  if (filters.minRating !== null) notApplied.push("minRating");
  if (filters.cuisine?.length) notApplied.push("cuisine");
  return {
    filters: {
      maxMinutes: filters.maxMinutes, dietary: [...filters.dietary], mealType: [...filters.mealType],
      cookingMethod: [...filters.cookingMethod], proteinType: [...filters.proteinType], servings: filters.servings,
      mustInclude: [...filters.mustInclude], mustExclude: [...filters.mustExclude],
    },
    notApplied,
  };
}

/** The same check without personal filters: what a generated recipe must satisfy. */
export const noPersonalFilters = (filters: MealsGenerationFilters): PlannerFilters =>
  ({ ...filters, source: [], withNotes: false, modifiedByMe: false, myPicks: false, minRating: null });
