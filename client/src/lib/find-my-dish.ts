// Find my dish (Home): one protein → one main dish using it as its main ingredient. Pure and deterministic (no AI, no
// storage): the search writes nothing. Restrictions stay with checkEligibility through cookNowOptions.
import { ingredientPrefs, mentionsTerm, termPattern, type Allergen, type DietPattern } from "@shared/food-rules";
import { ingredientGroup } from "./ingredient-groups";
import { optional } from "./grocery-meal-removal";
import { selectableDevices } from "./device-requirements";
import { cookNowOptions } from "./week-suggestions";
import type { BasicSettings } from "./basic-settings";
import type { EngineRecipe } from "./preference-engine";

/** The protein choices, in browsing order (Beef, Chicken first), each with the English ingredient words it matches.
 * A broad choice includes its specific kinds (Fish matches salmon); a specific one only itself (Salmon needs salmon). */
export const proteinChoices = [
  ["beef", /\b(beef|steaks?|brisket|sirloin|veal)\b/],
  ["chicken", /\bchicken\b/],
  ["eggs", /\beggs?\b/],
  ["fish", /\b(fish|salmon|cod|tuna|trout|mackerel|haddock|sardines?|tilapia|halibut|sea bass|bream|pollock|hake|snapper|herring|anchov(y|ies))\b/],
  ["pork", /\b(pork|bacon|ham|sausages?|chorizo|pancetta|prosciutto)\b/],
  ["tofu", /\btofu\b/],
  ["turkey", /\bturkey\b/],
  ["beans", /\b(?<!green )(?<!string )beans?\b/],
  ["lentils", /\blentils?\b/],
  ["chickpeas", /\b(chickpeas?|garbanzos?)\b/],
  ["shellfish", /\b(prawns?|shrimps?|mussels?|clams?|scallops?|crabs?|lobsters?|squid|calamari|oysters?)\b/],
  ["lamb", /\b(lamb|mutton)\b/],
  ["cheese", /\b(cheese|cheddar|feta|mozzarella|halloumi|parmesan|ricotta|paneer)\b/],
  ["yogurt", /\b(yogh?urt|labneh)\b/],
  ["duck", /\bduck\b/],
  ["goat", /\bgoat\b(?! cheese)/],
  ["game", /\b(game|venison|rabbit|pheasant|quail|boar)\b/],
  ["tempeh", /\btempeh\b/],
  ["edamame", /\bedamame\b/],
  ["splitPeas", /\bsplit peas?\b/],
  ["seitan", /\bseitan\b/],
  ["nuts", /\b(nuts?|almonds?|walnuts?|cashews?|peanuts?|pecans?|pistachios?|hazelnuts?)\b/],
  ["seeds", /\b(seeds?)\b/],
  ["plantMeat", /\b(plant[- ]based|meat[- ]free|soy mince|textured vegetable protein|tvp|(vegan|veggie) (mince|sausages?|burgers?))\b/],
] as const satisfies readonly (readonly [string, RegExp])[];
/** Specific kinds offered by autocomplete as typed (Salmon needs salmon). */
export const specificProteins = [
  ["salmon", /\bsalmon\b/], ["cod", /\bcod\b/], ["tuna", /\btuna\b/], ["shrimp", /\b(shrimps?|prawns?)\b/],
  ["chickenBreast", /\bchicken breasts?\b/], ["chickenThighs", /\bchicken thighs?\b/], ["groundBeef", /\b((ground|minced) beef|beef mince)\b/],
  ["steak", /\bsteaks?\b/], ["groundTurkey", /\b((ground|minced) turkey|turkey mince)\b/], ["bacon", /\bbacon\b/],
] as const satisfies readonly (readonly [string, RegExp])[];
export type ProteinKey = typeof proteinChoices[number][0] | typeof specificProteins[number][0];
const patterns = new Map<string, RegExp>([...proteinChoices, ...specificProteins]);
const anyProtein = new RegExp(proteinChoices.map(([, re]) => re.source).join("|"));

/** What the person entered: a choice (by key) or their own text. */
export type Protein = { key: ProteinKey } | { text: string };

/** The lines a recipe needs: not optional, not a stock, sauce or spice ("chicken broth" is not chicken). */
const needed = (r: Pick<EngineRecipe, "ingredients">) =>
  r.ingredients.map((line, i) => ({ line, i })).filter(({ line }) => !optional.test(line) && ingredientGroup(line) !== "seasonings");
/** Index of the recipe's main protein line: the first needed line naming any protein, or -1.
 * ponytail: the first protein named is taken as the main one (true for the whole local catalog); use a reviewed
 * main-ingredient field when the catalog has one. */
export const mainProteinLine = (r: Pick<EngineRecipe, "ingredients">) =>
  needed(r).find(({ line }) => anyProtein.test(line.toLowerCase()))?.i ?? -1;

/** True when the protein is the recipe's main ingredient, at the specificity entered. Own text matches by name words. */
export function usesAsMain(r: Pick<EngineRecipe, "ingredients">, protein: Protein): boolean {
  const at = mainProteinLine(r);
  if (at < 0) return false;
  const line = r.ingredients[at].toLowerCase();
  return "key" in protein ? patterns.get(protein.key)!.test(line) : mentionsTerm(protein.text, [line]);
}

/** A main dish: a lunch or dinner (and a breakfast when the protein is eggs). The catalog marks no main or side. */
const mainDish = (r: EngineRecipe, protein: Protein) =>
  r.mealType === "Lunch" || r.mealType === "Dinner" || (r.mealType === "Breakfast" && "key" in protein && protein.key === "eggs");

/** Leave out: a known ingredient (its Settings id, such as "mushrooms") or the person's own words; any line counts. */
const leavesOut = (r: EngineRecipe, term: string) => {
  const known = ingredientPrefs[term as keyof typeof ingredientPrefs];
  return known ? r.ingredients.some(line => known.test(line.toLowerCase())) : !!termPattern(term) && mentionsTerm(term, r.ingredients);
};

/** The household's settings for this search: its requirements plus the dietary needs added for this search only. An
 * unanswered kitchen (devices null) is unknown and filters nothing here; a saved one (Microwave only, No cooking
 * appliances) applies as saved. */
export function searchSettings(settings: BasicSettings, extra: { diets: DietPattern[]; allergies: Allergen[] } = { diets: [], allergies: [] }): BasicSettings {
  const d = settings.dietary;
  return { ...settings, kitchen: { devices: settings.kitchen.devices ?? [...selectableDevices] },
    dietary: { ...d, diets: [...new Set([...d.diets, ...extra.diets])], allergies: [...new Set([...d.allergies, ...extra.allergies])] } };
}

export type DishSearch = { protein: Protein; leaveOut: string[]; diets: DietPattern[]; allergies: Allergen[] };
/** Eligible main dishes using the protein as their main ingredient and none of the Leave out ingredients, best first
 * (Cook now's order). Empty: "No matching dish yet". */
export function findMyDish<T extends EngineRecipe>(catalog: readonly T[], settings: BasicSettings, search: DishSearch, now = new Date()): T[] {
  return cookNowOptions(catalog, searchSettings(settings, search), now)
    .filter(r => mainDish(r, search.protein) && usesAsMain(r, search.protein) && !search.leaveOut.some(term => leavesOut(r, term)));
}

/** The other ingredients the dish needs (indices into its lines): everything needed except the protein on hand. */
export const otherIngredients = (r: Pick<EngineRecipe, "ingredients">) => {
  const main = mainProteinLine(r);
  return r.ingredients.map((_, i) => i).filter(i => i !== main && !optional.test(r.ingredients[i]));
};

const plant = /\b(lentils?|chickpeas?|garbanzos?|(?<!green )beans?|tofu|tempeh|seitan|edamame|split peas?)\b/;
/** Home's examples when nothing is planned today: an eligible beef, chicken and plant-based main dish with a photo
 * (vegan-tagged, or vegetarian built around a plant protein). A slot the household's requirements rule out is filled by
 * another distinct eligible dish; fewer than three when there are not enough. */
export function exampleDishes<T extends EngineRecipe & { image?: string | null }>(catalog: readonly T[], settings: BasicSettings, now = new Date()): T[] {
  const pool = cookNowOptions(catalog, searchSettings(settings), now).filter(r => !!r.image && (r.mealType === "Lunch" || r.mealType === "Dinner"));
  const tagged = (r: T, tag: string) => r.tags.some(t => t.toLowerCase() === tag);
  const plantMain = (r: T) => (tagged(r, "vegan") || tagged(r, "vegetarian")) && mainProteinLine(r) >= 0 && plant.test(r.ingredients[mainProteinLine(r)].toLowerCase());
  const picks: T[] = [];
  // Plant-based: built around a plant protein first, else any vegan-tagged dish.
  for (const fits of [[(r: T) => usesAsMain(r, { key: "beef" })], [(r: T) => usesAsMain(r, { key: "chicken" })], [plantMain, (r: T) => tagged(r, "vegan")]]) {
    const pick = fits.map(f => pool.find(r => f(r) && !picks.includes(r))).find(Boolean);
    if (pick) picks.push(pick);
  }
  return [...picks, ...pool.filter(r => !picks.includes(r))].slice(0, 3);
}
