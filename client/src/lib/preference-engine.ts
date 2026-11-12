// Household preference engine. Pure and deterministic: no network, no AI, no storage.
// Eligibility (hard restrictions) is separate from ranking (soft preferences).
import { evaluateAllergen, evaluateDiet, evaluateMeat, mentionsIngredientPref, mentionsTerm, recipeCuisine,
  type Allergen, type DietPattern, type IngredientPref, type RuleStatus } from "@shared/food-rules";
import { satisfiesDevices, unmetGroups, type DeviceId, type DeviceRequirements } from "./device-requirements";
import { availableDevices, householdServings, type BasicSettings, type IngredientChoice, type Member } from "./basic-settings";
import { mealSlots, occupant, type MealSlot, type PlanAssignment, type PlanState } from "./meal-plan";
import type { RecipeToolKey } from "./recipe-tools";

export type EngineRecipe = {
  id: string; title: string; ingredients: string[]; tags: string[]; mealType: string;
  prepTime?: number | null; cookTime?: number | null; minutes?: number;
  deviceRequirements: DeviceRequirements; equipment?: RecipeToolKey[]; proteinType?: string;
};
export type Restriction =
  | { kind: "device"; missing: DeviceId[][] }
  | { kind: "diet"; diet: DietPattern; status: Exclude<RuleStatus, "ok">; members: string[]; lines: string[] }
  | { kind: "allergy"; allergen: Allergen; status: Exclude<RuleStatus, "ok">; members: string[]; lines: string[] }
  | { kind: "customAllergy"; term: string; members: string[] }
  | { kind: "time"; minutes: number; max: number }
  /** Meal-specific rules (My Basic Settings → Weekly Meal Planning); only when a meal is being evaluated. */
  | { kind: "mealType"; meal: MealSlot; type: "meatless" | "meat"; status: Exclude<RuleStatus, "ok"> }
  | { kind: "mealTime"; meal: MealSlot; minutes: number | null; max: number };
export type Eligibility = {
  eligible: boolean;
  /** Hard restrictions that failed. Status "uncertain" means the wording could not be verified: still ineligible. */
  reasons: Restriction[];
  /** Household member ids the evaluation covered ("household" = the household-wide rules). */
  members: string[];
};
export type Ranking = { score: number; matches: string[]; concerns: string[] };

const total = (r: EngineRecipe) => (r.prepTime != null || r.cookTime != null ? (r.prepTime ?? 0) + (r.cookTime ?? 0) : r.minutes ?? null);
const HOUSEHOLD = "household";

/** The people a shared meal is for: everyone by default, or a chosen subset (future per-meal selection). */
export function diners(settings: BasicSettings, memberIds?: readonly string[]): Member[] {
  const all = settings.household.members;
  return memberIds ? all.filter(m => memberIds.includes(m.id)) : all;
}

const isMealSlot = (meal: string): meal is MealSlot => (mealSlots as readonly string[]).includes(meal);

/** A meal's own recipe-type and time rules. Unknown time or unverifiable ingredients never pass a rule (not treated as 0 / meatless). */
export function mealReasons(recipe: EngineRecipe, settings: BasicSettings, meal: MealSlot): Restriction[] {
  const rule = settings.planning.mealRules[meal];
  const reasons: Restriction[] = [];
  if (rule.type !== "both") {
    const meat = evaluateMeat(recipe.ingredients);
    const status = meat === "uncertain" ? "uncertain" : (meat === "violates") === (rule.type === "meatless") ? "violates" : null;
    if (status) reasons.push({ kind: "mealType", meal, type: rule.type, status });
  }
  const minutes = total(recipe);
  if (typeof rule.max === "number" && (minutes == null || minutes > rule.max)) reasons.push({ kind: "mealTime", meal, minutes, max: rule.max });
  return reasons;
}

/** Hard restrictions: devices, every diner's dietary patterns, allergies and custom allergies, and an explicit hard time limit.
 * With `meal`, that meal's recipe-type and time rules too (global restrictions always apply first and are never relaxed). */
export function checkEligibility(recipe: EngineRecipe, settings: BasicSettings, memberIds?: readonly string[], meal?: MealSlot): Eligibility {
  const reasons: Restriction[] = [];
  const people = diners(settings, memberIds);
  const missing = unmetGroups(recipe.deviceRequirements, availableDevices(settings));
  if (missing.length) reasons.push({ kind: "device", missing });

  // Who holds each restriction: household-wide rules apply to everyone.
  const holders = <T extends string>(household: T[], own: (m: Member) => T[]) => {
    const map = new Map<T, string[]>(household.map(x => [x, [HOUSEHOLD]]));
    for (const m of people) for (const x of own(m)) map.set(x, [...(map.get(x) ?? []), m.id]);
    return map;
  };
  for (const [diet, members] of holders(settings.dietary.diets, m => m.diets)) {
    const { status, lines } = evaluateDiet(diet, recipe.ingredients);
    if (status !== "ok") reasons.push({ kind: "diet", diet, status, members, lines });
  }
  for (const [allergen, members] of holders(settings.dietary.allergies, m => m.allergies)) {
    const { status, lines } = evaluateAllergen(allergen, recipe.ingredients);
    if (status !== "ok") reasons.push({ kind: "allergy", allergen, status, members, lines });
  }
  for (const [term, members] of holders(settings.dietary.customAllergies, m => m.customAllergies)) {
    if (mentionsTerm(term, recipe.ingredients)) reasons.push({ kind: "customAllergy", term, members });
  }
  const { hardMax, weekdayMax, weekendMax } = settings.cooking;
  const limit = Math.max(weekdayMax ?? 0, weekendMax ?? 0);
  const minutes = total(recipe);
  if (hardMax && limit > 0 && minutes != null && minutes > limit) reasons.push({ kind: "time", minutes, max: limit });
  if (meal) reasons.push(...mealReasons(recipe, settings, meal));
  return { eligible: reasons.length === 0, reasons, members: [HOUSEHOLD, ...people.map(m => m.id)] };
}

const choiceMatches = (choice: IngredientChoice, ingredients: string[]) => choice.startsWith("custom:")
  ? mentionsTerm(choice.slice(7), ingredients) : mentionsIngredientPref(choice as IngredientPref, ingredients);
const keyIngredients = (r: EngineRecipe) => new Set(r.ingredients.map(line =>
  line.toLowerCase().replace(/^[\d.\/\s]+(g|kg|ml|l|tsp|tbsp|pinch|cloves?|slices?|sprigs?|sheets?)?\s+/, "").split(",")[0].trim())
  .filter(name => name && !/\b(salt|pepper|oil|water|sugar)\b/.test(name)));

export type RankContext = {
  memberIds?: readonly string[];
  /** Recipes already chosen this week (variety, ingredient reuse). */
  selected?: readonly EngineRecipe[];
  meta?: (id: string) => { isMyPick: boolean; rating: number | null };
  day?: "weekday" | "weekend";
  /** Meals being evaluated: a recipe whose meal type is listed must also pass that meal's own rules. Others are unaffected,
   * so a recipe that fails the Breakfast rule is not hidden when Dinner (or no meal) is being looked at. */
  meals?: readonly MealSlot[];
};
const mealFor = (recipe: EngineRecipe, ctx: RankContext) => (isMealSlot(recipe.mealType) && ctx.meals?.includes(recipe.mealType) ? recipe.mealType : undefined);

/** Soft preferences only. Never hides a recipe; returns a score and the reasons behind it. */
export function rankRecipe(recipe: EngineRecipe, settings: BasicSettings, ctx: RankContext = {}): Ranking {
  let score = 0;
  const matches: string[] = [], concerns: string[] = [];
  const people = diners(settings, ctx.memberIds);
  const ing = recipe.ingredients;
  const favorites = [...new Set([...settings.dietary.favorites, ...people.flatMap(m => m.favorites)])].filter(c => choiceMatches(c, ing));
  if (favorites.length) { score += 2 * Math.min(2, favorites.length); matches.push(...favorites.map(f => `favorite:${f}`)); }
  const dislikedBy = [settings.dietary.dislikes, ...people.map(m => m.dislikes)].filter(list => list.some(c => choiceMatches(c, ing))).length;
  if (dislikedBy) { score -= 3 * dislikedBy; concerns.push(`disliked:${dislikedBy}`); }
  const cuisine = recipeCuisine(recipe.tags);
  if (cuisine && settings.dietary.preferredCuisines.includes(cuisine)) { score += 2; matches.push(`cuisine:${cuisine}`); }
  if (cuisine && settings.dietary.avoidCuisines.includes(cuisine)) { score -= 3; concerns.push(`avoidCuisine:${cuisine}`); }

  const minutes = total(recipe);
  const { weekdayMax, weekendMax } = settings.cooking;
  // No day given (the Weekly Meals list): weekday preferences, like the weekday time limit.
  const { quick, minimalCleanup, onePot, batch } = settings.cooking[ctx.day === "weekend" ? "weekend" : "weekday"];
  const max = ctx.day === "weekend" ? weekendMax ?? weekdayMax : weekdayMax ?? weekendMax;
  if (minutes != null && max != null && minutes > max) { score -= 2; concerns.push("overTime"); }
  if (quick && minutes != null && minutes <= 30) { score += 1.5; matches.push("quick"); }
  const equipment = recipe.equipment ?? [];
  const vessels = equipment.filter(e => ["toolPot", "toolPan", "toolTray"].includes(e)).length;
  if (minimalCleanup && equipment.length > 0 && equipment.length <= 2) { score += 1; matches.push("minimalCleanup"); }
  if (onePot && vessels === 1 && recipe.deviceRequirements.length <= 1) { score += 1.5; matches.push("onePot"); }
  if (batch && recipe.tags.includes("Batch cooking")) { score += 1.5; matches.push("batch"); }

  const planned = settings.planning.meals;
  // Only once the person has narrowed the meals they plan; the default (all meals) changes nothing.
  if (planned.length && planned.length < mealSlots.length && (mealSlots as readonly string[]).includes(recipe.mealType)) {
    if (planned.includes(recipe.mealType as MealSlot)) score += 1; else { score -= 1; concerns.push("mealNotPlanned"); }
  }
  const meta = ctx.meta?.(recipe.id);
  const liked = !!meta && (meta.isMyPick || (meta.rating ?? 0) >= 4);
  if (settings.planning.repeatFavorites && liked) { score += 2; matches.push("favoriteRecipe"); }
  if (settings.planning.novelty === "familiar" && meta && (meta.isMyPick || meta.rating != null)) score += 1;
  if (settings.planning.novelty === "new" && meta && !meta.isMyPick && meta.rating == null) score += 1;

  const others = (ctx.selected ?? []).filter(r => r.id !== recipe.id);
  const weight = { low: 0, balanced: 0.75, high: 1.5 }[settings.planning.variety];
  const similar = others.filter(r => (r.proteinType && r.proteinType === recipe.proteinType) || (cuisine && recipeCuisine(r.tags) === cuisine)).length;
  if (weight && similar) { score -= weight * similar; concerns.push("similarToSelected"); }
  if (settings.shopping.reuseIngredients && others.length) {
    const mine = keyIngredients(recipe);
    const shared = new Set(others.flatMap(r => [...keyIngredients(r)].filter(x => mine.has(x)))).size;
    if (shared) { score += 0.5 * Math.min(4, shared); matches.push("reusesIngredients"); }
  }
  if (settings.shopping.budgetFriendly && recipe.tags.includes("Budget")) { score += 1.5; matches.push("budget"); }
  return { score: Math.round(score * 100) / 100, matches, concerns };
}

/** Eligible recipes, best match first (stable for ties, so the original order is kept when nothing is set). */
export function personalize<T extends EngineRecipe>(recipes: readonly T[], settings: BasicSettings, ctx: RankContext = {}) {
  const evaluated = recipes.map((recipe, index) => ({ recipe, index, eligibility: checkEligibility(recipe, settings, ctx.memberIds, mealFor(recipe, ctx)) }));
  const eligible = evaluated.filter(e => e.eligibility.eligible).map(e => ({ ...e, ranking: rankRecipe(e.recipe, settings, ctx) }))
    .sort((a, b) => b.ranking.score - a.ranking.score || a.index - b.index);
  return { eligible, excluded: evaluated.filter(e => !e.eligibility.eligible) };
}

/** Best eligible replacement for an incompatible selected recipe: same meal type and that meal's rules, not already selected. */
export function suggestReplacement<T extends EngineRecipe>(target: T, recipes: readonly T[], selectedIds: readonly string[], settings: BasicSettings, ctx: RankContext = {}): T | null {
  const candidates = recipes.filter(r => r.id !== target.id && !selectedIds.includes(r.id) && r.mealType === target.mealType);
  return personalize(candidates, settings, { ...ctx, meals: mealSlots }).eligible[0]?.recipe ?? null;
}

// ---- Automatic week filling from the selected recipes (never removes or moves anything already planned) ----
// Which days to cook on (plan days: Sun=0 … Sat=6). Without leftovers: weekdays first. With leftovers: every other
// day first, so the next day's same meal is free for the leftovers (4 cooking days + leftovers covers the week).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LEFTOVER_DAY_ORDER = [0, 2, 4, 6, 1, 3, 5];
const isWeekend = (day: number) => day === 0 || day === 6;

export function fillWeek<T extends EngineRecipe>(plan: PlanState, selected: readonly T[], settings: BasicSettings, ctx: RankContext = {}):
  { plan: PlanState; added: number; skippedIneligible: string[] } {
  const cookingDays = (settings.planning.leftovers === "none" ? DAY_ORDER : LEFTOVER_DAY_ORDER).slice(0, settings.planning.cookingDays).sort((a, b) => a - b);
  const meals = settings.planning.meals.length ? settings.planning.meals : (["Dinner"] as MealSlot[]);
  const servings = householdServings(settings);
  // Every recipe is checked against its own meal's rules; a recipe only ever fills a slot of its own meal type.
  const { eligible, excluded } = personalize(selected, settings, { ...ctx, meals: mealSlots });
  const planned = new Set(plan.planAssignments.map(a => a.recipeId));
  const pool = eligible.map(e => e.recipe).filter(r => !planned.has(r.id));
  const assignments: PlanAssignment[] = [...plan.planAssignments];
  const free = (meal: MealSlot, day: number) => !occupant({ ...plan, planAssignments: assignments }, meal, day);
  const leftoverSpan = (r: T) => settings.planning.leftovers === "often" || (settings.planning.leftovers === "sometimes" && r.tags.includes("Batch cooking")) ? 2 : 1;
  let added = 0;
  for (const meal of [...meals].sort((a, b) => mealSlots.indexOf(b) - mealSlots.indexOf(a))) { // dinner first
    for (const day of cookingDays) {
      if (!free(meal, day)) continue;
      // A meal's own time limit (already enforced above) replaces the weekday/weekend time for that meal.
      const own = settings.planning.mealRules[meal].max;
      const max = own !== null ? null : isWeekend(day) ? settings.cooking.weekendMax ?? settings.cooking.weekdayMax : settings.cooking.weekdayMax ?? settings.cooking.weekendMax;
      const fits = (r: T) => r.mealType === meal && (max == null || total(r) == null || total(r)! <= max);
      // Prefer recipes within that day's time; with a soft limit, fall back to the best remaining one.
      // Order the remaining recipes by that day's own preferences (weekday or weekend).
      const dayType = isWeekend(day) ? "weekend" as const : "weekday" as const;
      const ranked = pool.map((r, i) => ({ r, i, score: rankRecipe(r, settings, { ...ctx, day: dayType }).score }))
        .sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.r);
      const pick = ranked.find(fits) ?? (settings.cooking.hardMax ? undefined : ranked.find(r => r.mealType === meal));
      if (!pick) continue;
      // Leftovers cover the next day's same meal when it is still empty; servings double to cook enough.
      const span = leftoverSpan(pick) === 2 && day < 6 && free(meal, day + 1) ? 2 : 1;
      assignments.push({ recipeId: pick.id, mealType: meal, startDay: day, spanDays: span, ...(servings ? { servings: servings * span } : {}) });
      pool.splice(pool.indexOf(pick), 1);
      added++;
    }
  }
  return { plan: { ...plan, planAssignments: assignments }, added, skippedIneligible: excluded.map(e => e.recipe.id) };
}
