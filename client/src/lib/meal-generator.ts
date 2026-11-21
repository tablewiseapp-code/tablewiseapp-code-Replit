// Home "+ Add breakfast/lunch/dinner" generator. Pure and deterministic: the catalog is the provider (no AI), so it works
// with AI off. Restrictions go through checkEligibility and are never relaxed; the inputs only narrow and order.
import type { DietPattern } from "@shared/food-rules";
import type { BasicSettings, CookingStyle } from "./basic-settings";
import type { DeviceId } from "./device-requirements";
import type { MealSlot } from "./meal-plan";
import { checkEligibility, rankRecipe, total, type EngineRecipe } from "./preference-engine";
import { effort } from "./week-suggestions";

export const generatorTimes = [null, 15, 30] as const;
export type GeneratorInput = {
  meal: MealSlot; day: number; query: string; maxMinutes: typeof generatorTimes[number]; style: CookingStyle;
  /** This meal only: servings, diets and devices start from the household and never change Basic Settings. */
  servings: number | null; diets: DietPattern[]; devices?: DeviceId[] | null;
};
/** Why nothing was found, in the order the inputs narrow: restrictions, then time, then the search words. */
export type NoMatch = "restrictions" | "time" | "search";

const stopWords = new Set("a an and or with without of for to in on the some something anything like want would please me my i we our any no not but very really dish meal recipe recipes food make cook breakfast lunch dinner today quick easy savory savoury sweet tasty nice good light".split(" "));
/** Search words, singular-ish: "eggs and potatoes" → ["egg", "potato"]. ponytail: English only and naive plurals; the catalog is English. */
export function searchTerms(query: string): string[] {
  const words = query.toLowerCase().normalize("NFKC").match(/[\p{L}]+/gu) ?? [];
  return [...new Set(words.filter(w => w.length > 2 && !stopWords.has(w)).map(w => w.replace(/oes$/, "o").replace(/(?<!s)s$/, "")))];
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** How many search words the recipe's title, ingredients or tags contain. */
export const termHits = (r: EngineRecipe, terms: string[]) => {
  const text = [r.title, ...r.ingredients, ...r.tags].join(" \n ").toLowerCase();
  return terms.filter(t => new RegExp(`\\b${escape(t)}(e?s)?\\b`, "u").test(text)).length;
};

/** The settings for this meal: the household's, with this flow's diets and devices. Allergies and meal rules always apply. */
export const generatorSettings = (settings: BasicSettings, input: GeneratorInput): BasicSettings =>
  ({ ...settings, dietary: { ...settings.dietary, diets: input.diets },
    kitchen: input.devices === undefined ? settings.kitchen : { devices: input.devices } });

const styleTarget: Record<CookingStyle, number> = { quick: 0, everyday: 0.4, chef: 1 };

/** Matching recipes, best first. A recipe with unknown time never passes a time limit; with search words, at least one must match. */
export function generateMeals<T extends EngineRecipe>(catalog: readonly T[], settings: BasicSettings, input: GeneratorInput):
  { recipes: T[]; noMatch: NoMatch | null } {
  const s = generatorSettings(settings, input);
  const allowed = catalog.filter(r => r.mealType === input.meal && checkEligibility(r, s, undefined, input.meal, input.day).eligible);
  const timed = allowed.filter(r => input.maxMinutes === null || (total(r) !== null && total(r)! <= input.maxMinutes));
  const terms = searchTerms(input.query);
  const hits = new Map(timed.map(r => [r.id, terms.length ? termHits(r, terms) : 0]));
  const found = timed.filter(r => !terms.length || hits.get(r.id)! > 0);
  // Cooking style: quick favours the least involved recipes, chef the most, everyday the middle (same estimate as the Week).
  const order = [...allowed].sort((a, b) => effort(a) - effort(b));
  const pct = (r: T) => (order.length > 1 ? order.indexOf(r) / (order.length - 1) : 0.5);
  const day = input.day === 0 || input.day === 6 ? "weekend" as const : "weekday" as const;
  const recipes = found.map((r, i) => ({ r, i, score: 3 * hits.get(r.id)! + rankRecipe(r, s, { day }).score - 4 * Math.abs(pct(r) - styleTarget[input.style]) }))
    .sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.r);
  const noMatch = recipes.length ? null : !allowed.length ? "restrictions" : !timed.length ? "time" : "search";
  return { recipes, noMatch };
}
