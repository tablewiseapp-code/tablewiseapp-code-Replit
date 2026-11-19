import { recipeStageMinutes, type RecipeTimeMode } from "./recipe-time";
import type { PlannerRecipe } from "./planner-recipes";
import { evaluateDiet, recipeCuisine } from "../../../shared/food-rules";
import { nutritionAmounts, nutritionBasis, usableNutrition, type NutrientKey, type NutritionFields } from "../../../shared/recipe-nutrition";
import { ingredientMatches } from "./meal-filters";
import { foodDealById } from "./food-deals";

// The Meals page (/meals) filters. One implementation shared by the page and the AI generator's compliance check.
export const plannerTimeOptions = [20, 30, 40, 60] as const;
export const plannerDietary = ["Vegetarian", "Kid friendly", "Gluten-free"] as const;
export const plannerMealTypes = ["Breakfast", "Lunch", "Dinner", "Lunch box"] as const;
export const plannerCookingMethods = ["Oven", "Air fryer", "Stovetop", "Microwave", "No-cook"] as const;
export const plannerProteinTypes = ["Chicken", "Beef", "Seafood", "Plant-based"] as const;
export const plannerServings = ["1-2", "3-4", "5+"] as const;
export const dietaryTag = { Vegetarian: "vegetarian", "Kid friendly": "kidFriendly", "Gluten-free": "glutenFree" } as const;

// Week → Plan filters. Each option is a reusable definition, so kitchen tools and standing dietary preferences can
// move into Basic Settings later. A positive match needs an explicit tag or a supported calculation; missing data never matches.
/** Total-time limits on Week → Plan; the page also offers "Any" (no limit). */
export const weekTimeOptions = [15, 20, 30, 40, 45, 60] as const;
export const WEEK_DEFAULT_MAX_MINUTES = 30;
export const KID_FAVOURITES = "Kid friendly"; // stored in `dietary`, matches the explicit kidFriendly tag
export const cookingLevels = ["easy", "confident", "challenge"] as const;
export type CookingLevel = typeof cookingLevels[number];
const cookingLevelTags: Record<CookingLevel, string[]> = { easy: ["level:easy"], confident: ["level:intermediate"], challenge: ["level:advanced"] };

type DietRecipe = Pick<PlannerRecipe, "tags" | "ingredients"> & NutritionFields & { servings?: string | null };
const tagKey = (tag: string) => tag.toLowerCase().replace(/[\s_-]+/g, "");
const tagged = (...names: string[]) => (r: DietRecipe) => r.tags.some(tag => names.includes(tagKey(tag)));
// Per-serving thresholds, documented in docs/week-plan-filters.md. Only recipes with a numeric serving count and
// real (not mock) nutrition qualify; ranges use the least favourable end.
const perServing = (key: NutrientKey, test: (min: number, max: number) => boolean) => (r: DietRecipe) => {
  const nutrition = usableNutrition(r.nutrition);
  if (!nutrition || nutritionBasis(r.servings)?.unit !== "portion") return false;
  const amount = nutritionAmounts(nutrition, r.servings).find(a => a.key === key)!;
  return test(amount.min, amount.max);
};
const either = (...tests: ((r: DietRecipe) => boolean)[]) => (r: DietRecipe) => tests.some(test => test(r));

export const dietaryGroups = ["quick", "eatingStyles", "nutritionGoals", "exclusions", "religious"] as const;
export const dietaryOptions: { value: string; group: typeof dietaryGroups[number]; matches: (r: DietRecipe) => boolean }[] = [
  { value: "Gluten-free", group: "quick", matches: tagged("glutenfree") },
  { value: "Dairy-free", group: "quick", matches: tagged("dairyfree") },
  { value: "Vegetarian", group: "quick", matches: tagged("vegetarian", "vegan") },
  { value: "High-protein", group: "quick", matches: either(tagged("highprotein"), perServing("proteinG", min => min >= 20)) },
  { value: "Low-carb", group: "quick", matches: either(tagged("lowcarb"), perServing("carbsG", (_, max) => max <= 20)) },
  { value: "Vegan", group: "eatingStyles", matches: tagged("vegan") },
  { value: "Pescatarian", group: "eatingStyles", matches: either(tagged("pescatarian", "vegetarian", "vegan"), r => evaluateDiet("pescatarian", r.ingredients).status === "ok") },
  { value: "Mediterranean-style", group: "eatingStyles", matches: tagged("mediterraneanstyle", "mediterranean") },
  { value: "Keto", group: "eatingStyles", matches: tagged("keto") },
  { value: "Paleo", group: "eatingStyles", matches: tagged("paleo") },
  { value: "Lower-calorie", group: "nutritionGoals", matches: either(tagged("lowercalorie", "lowcalorie"), perServing("caloriesKcal", (_, max) => max <= 500)) },
  { value: "High-fibre", group: "nutritionGoals", matches: either(tagged("highfibre", "highfiber"), perServing("fiberG", min => min >= 6)) },
  { value: "Low-sodium", group: "nutritionGoals", matches: tagged("lowsodium") }, // no sodium data in the catalog
  { value: "Low added sugar", group: "nutritionGoals", matches: tagged("lowaddedsugar") }, // nutrition has total sugar only
  { value: "Egg-free", group: "exclusions", matches: tagged("eggfree") },
  { value: "Peanut-free", group: "exclusions", matches: tagged("peanutfree") },
  { value: "Tree-nut-free", group: "exclusions", matches: tagged("treenutfree") },
  { value: "Soy-free", group: "exclusions", matches: tagged("soyfree") },
  { value: "Kosher", group: "religious", matches: tagged("kosher") },
  { value: "Halal", group: "religious", matches: tagged("halal") },
  { value: KID_FAVOURITES, group: "quick", matches: tagged("kidfriendly") },
];
const dietaryMatch = new Map(dietaryOptions.map(o => [o.value, o.matches]));

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
  /** Week → Plan only. One of cookingLevels; matched by explicit level tags. */
  cookingLevel?: CookingLevel | null;
  /** Week → Plan only. A Food deals offer id; matches recipes that use that ingredient. */
  deal?: string | null;
};
export type PlannerMeta = { isMyPick: boolean; rating: number | null };
type Filterable = Pick<PlannerRecipe, "tags" | "mealType" | "tools" | "sourceType" | "proteinType" | "hasNotes" |
  "modifiedByMe" | "servingsRange" | "ingredients" | "prepTime" | "cookTime" | "nutrition" | "servings">;

export function matchesPlannerFilters(recipe: Filterable, filters: PlannerFilters, timeMode: RecipeTimeMode, meta: PlannerMeta): boolean {
  if (filters.maxMinutes !== null) {
    const minutes = recipeStageMinutes(recipe, timeMode);
    if (minutes === null || minutes > filters.maxMinutes) return false;
  }
  if (filters.dietary.length > 0) {
    if (!filters.dietary.every(d => dietaryMatch.get(d)?.(recipe) ?? true)) return false;
  }
  if (filters.cookingLevel && !tagged(...cookingLevelTags[filters.cookingLevel])(recipe)) return false;
  const deal = filters.deal ? foodDealById(filters.deal) : undefined;
  if (deal && !recipe.ingredients.some(line => deal.terms.some(term => ingredientMatches(line, term)))) return false;
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
export type NotAppliedFilter = "source" | "withNotes" | "modifiedByMe" | "myPicks" | "minRating" | "cuisine" | "dietary" | "cookingLevel" | "deal";

export function mealsGenerationFilters(filters: PlannerFilters): { filters: MealsGenerationFilters; notApplied: NotAppliedFilter[] } {
  const notApplied: NotAppliedFilter[] = [];
  if (filters.source.length) notApplied.push("source");
  if (filters.withNotes) notApplied.push("withNotes");
  if (filters.modifiedByMe) notApplied.push("modifiedByMe");
  if (filters.myPicks) notApplied.push("myPicks");
  if (filters.minRating !== null) notApplied.push("minRating");
  if (filters.cuisine?.length) notApplied.push("cuisine");
  // Generation understands the original dietary set only; the newer options are listed as not applied.
  const dietary = filters.dietary.filter(d => (plannerDietary as readonly string[]).includes(d));
  if (dietary.length < filters.dietary.length) notApplied.push("dietary");
  if (filters.cookingLevel) notApplied.push("cookingLevel");
  if (filters.deal) notApplied.push("deal");
  return {
    filters: {
      maxMinutes: filters.maxMinutes, dietary, mealType: [...filters.mealType],
      cookingMethod: [...filters.cookingMethod], proteinType: [...filters.proteinType], servings: filters.servings,
      mustInclude: [...filters.mustInclude], mustExclude: [...filters.mustExclude],
    },
    notApplied,
  };
}

/** The same check without personal filters: what a generated recipe must satisfy. */
export const noPersonalFilters = (filters: MealsGenerationFilters): PlannerFilters =>
  ({ ...filters, source: [], withNotes: false, modifiedByMe: false, myPicks: false, minRating: null });

export const RECIPES_PER_PAGE = 12;

// Runs after filtering and sorting. The page is clamped, so a shrinking result list never leaves you on an empty page.
export function paginate<T>(items: T[], page: number, size = RECIPES_PER_PAGE) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pageCount, from: items.length ? start + 1 : 0, to: Math.min(start + size, items.length), total: items.length };
}

// 1 … 4 5 6 … 9 — first, last and the neighbours of the current page; null marks a gap.
export function pageNumbers(page: number, pageCount: number): (number | null)[] {
  const keep = [...new Set([1, page - 1, page, page + 1, pageCount])].filter(n => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1] > 1 ? [null, n] : [n]));
}
