// What My Basic Settings currently does to Weekly Meals, as short chips. Pure: only configured values appear.
import { cookingPrefKeys, defaultSettings, householdServings, type BasicSettings } from "./basic-settings";
import type { Eligibility } from "./preference-engine";
import { restrictionText, settingsText } from "./settings-copy";

export type PreferenceChip = { group: "hard" | "planning" | "soft"; text: string; id: string };

export function activePreferenceChips(s: BasicSettings, lang: string, mealLabel: (meal: string) => string): PreferenceChip[] {
  const t = (key: string, values?: Record<string, string | number>) => settingsText(lang, key, values);
  const lower = (key: string) => t(key).toLowerCase();
  const list = (items: string[]) => items.join(", ");
  const choice = (c: string) => (c.startsWith("custom:") ? c.slice(7) : lower(`ing_${c}`));
  const chips: PreferenceChip[] = [];
  const add = (group: PreferenceChip["group"], id: string, text: string) => chips.push({ group, id, text });
  const d = defaultSettings();

  // Always applied: household-wide, then per member (named).
  s.dietary.diets.forEach(x => add("hard", `diet-${x}`, t(`diet_${x}`)));
  s.dietary.allergies.forEach(x => add("hard", `allergy-${x}`, t("chipAllergy", { allergen: lower(`allergen_${x}`) })));
  s.dietary.customAllergies.forEach(x => add("hard", `allergy-${x}`, t("chipAllergy", { allergen: x })));
  for (const m of s.household.members) {
    m.diets.forEach(x => add("hard", `diet-${x}-${m.id}`, `${t(`diet_${x}`)} (${m.name})`));
    m.allergies.forEach(x => add("hard", `allergy-${x}-${m.id}`, `${t("chipAllergy", { allergen: lower(`allergen_${x}`) })} (${m.name})`));
    m.customAllergies.forEach(x => add("hard", `allergy-${x}-${m.id}`, `${t("chipAllergy", { allergen: x })} (${m.name})`));
  }
  if (s.kitchen.devices) add("hard", "devices", s.kitchen.devices.length ? t("chipDevices", { list: s.kitchen.devices.map(x => t(`device_${x}`)).join(" · ") }) : t("chipNoDevices"));
  const longest = Math.max(s.cooking.weekdayMax ?? 0, s.cooking.weekendMax ?? 0);
  if (s.cooking.hardMax && longest) add("hard", "max-time", t("chipMaxTime", { n: longest }));

  // Planning defaults (used by Fill my week and recipe servings; never filter recipes).
  const servings = householdServings(s);
  if (s.household.members.length) {
    const adults = s.household.members.filter(m => m.kind === "adult").length;
    add("planning", "household", t("householdSummary", { adults, children: s.household.members.length - adults }));
  }
  if (servings) add("planning", "servings", servings === 1 ? t("chipServingsOne") : t("chipServings", { n: servings }));
  if (s.planning.meals.length && s.planning.meals.length < d.planning.meals.length) add("planning", "meals", t("chipMeals", { list: list(s.planning.meals.map(mealLabel)) }));
  if (s.planning.cookingDays !== d.planning.cookingDays) add("planning", "days", t("chipDays", { n: s.planning.cookingDays }));
  if (s.planning.leftovers !== d.planning.leftovers) add("planning", "leftovers", t("chipLeftovers", { value: lower(`leftovers_${s.planning.leftovers}`) }));

  // Preferences: change the order only.
  if (s.cooking.weekdayMax && !s.cooking.hardMax) add("soft", "weekday-time", t("chipWeekdayTime", { n: s.cooking.weekdayMax }));
  if (s.cooking.weekendMax && !s.cooking.hardMax) add("soft", "weekend-time", t("chipWeekendTime", { n: s.cooking.weekendMax }));
  for (const day of ["weekday", "weekend"] as const) {
    const on = cookingPrefKeys.filter(k => s.cooking[day][k]).map(k => t(`short_${k}`));
    if (on.length) add("soft", `${day}-prefs`, t(day === "weekday" ? "chipWeekdayPrefs" : "chipWeekendPrefs", { list: list(on) }));
  }
  if (s.dietary.preferredCuisines.length) add("soft", "likes", t("chipLikes", { list: list(s.dietary.preferredCuisines.map(c => t(`cuisine_${c}`))) }));
  if (s.dietary.avoidCuisines.length) add("soft", "avoids", t("chipAvoids", { list: list(s.dietary.avoidCuisines.map(c => t(`cuisine_${c}`))) }));
  const favorites = [...new Set([...s.dietary.favorites, ...s.household.members.flatMap(m => m.favorites)])];
  const dislikes = [...new Set([...s.dietary.dislikes, ...s.household.members.flatMap(m => m.dislikes)])];
  if (favorites.length) add("soft", "favorites", t("chipFavorites", { list: list(favorites.map(choice)) }));
  if (dislikes.length) add("soft", "dislikes", t("chipDislikes", { list: list(dislikes.map(choice)) }));
  if (s.shopping.budgetFriendly) add("soft", "budget", t("chipBudget"));
  if (s.shopping.reuseIngredients) add("soft", "reuse", t("chipReuse"));
  if (s.planning.repeatFavorites) add("soft", "repeat", t("chipRepeat"));
  if (s.planning.variety !== d.planning.variety) add("soft", "variety", t("chipVariety", { value: lower(`variety_${s.planning.variety}`) }));
  if (s.planning.novelty !== d.planning.novelty) add("soft", "novelty", t("chipNovelty", { value: t(`novelty_${s.planning.novelty}`) }));
  return chips;
}

/** The restrictions that excluded the most recipes, for "No recipes match your current settings". */
export function limitingReasons(excluded: { eligibility: Eligibility }[], lang: string, nameOf: (id: string) => string | null, top = 3) {
  const counts = new Map<string, number>();
  for (const { eligibility } of excluded) {
    for (const text of new Set(eligibility.reasons.map(r => restrictionText(lang, r, nameOf)))) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, top).map(([reason, count]) => settingsText(lang, "reasonCount", { reason, count }));
}

export const breakdownKeys = ["dietary", "allergies", "devices", "uncertain", "time"] as const;
export type MatchCounts = {
  total: number; matching: number; bySettings: number; byFilters: number;
  /** Per reason; a recipe failing several rules appears under each, but `bySettings` counts it once. */
  breakdown: Record<typeof breakdownKeys[number], number>;
};
/** Counts for Weekly Meals from the same lists it renders: all → hard restrictions → page filters/search. Unique ids only. */
export function matchCounts(
  personalized: { eligible: { recipe: { id: string } }[]; excluded: { recipe: { id: string }; eligibility: Eligibility }[] },
  shown: readonly { id: string }[],
): MatchCounts {
  const eligible = new Set(personalized.eligible.map(e => e.recipe.id));
  const excluded = new Map(personalized.excluded.map(e => [e.recipe.id, e.eligibility]));
  const matching = new Set(shown.map(r => r.id).filter(id => eligible.has(id)));
  const breakdown = { dietary: 0, allergies: 0, devices: 0, uncertain: 0, time: 0 };
  for (const eligibility of excluded.values()) {
    const kinds = new Set(eligibility.reasons.map(r =>
      "status" in r && r.status === "uncertain" ? "uncertain"
        : r.kind === "diet" ? "dietary" : r.kind === "allergy" || r.kind === "customAllergy" ? "allergies" : r.kind === "device" ? "devices" : "time"));
    kinds.forEach(kind => breakdown[kind]++);
  }
  return { total: eligible.size + excluded.size, matching: matching.size, bySettings: excluded.size, byFilters: eligible.size - matching.size, breakdown };
}
