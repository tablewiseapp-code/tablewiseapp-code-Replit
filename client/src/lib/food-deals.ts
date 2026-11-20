// Food deals on Week → Plan. Hardcoded sample offers, labelled "Sample deals" in the UI; there is no deals source yet.
// `terms` are ingredient wordings matched against recipe ingredient lines (meal-filters.ts ingredientMatches).
import { ingredientMatches } from "./meal-filters";
export const builtInDealCategories = ["protein", "produce"] as const;
export const suggestedDealCategories = ["baking", "dairyEggs", "grainsPasta", "pantry", "frozen"] as const;

/** `expires`: last day of the offer ("YYYY-MM-DD"); the sample offers have none and count for every week. */
export type FoodDeal = { id: string; category: string; store: string; price: string; unit: "lb"; terms: string[]; expires?: string };
export const foodDeals: readonly FoodDeal[] = [
  { id: "chicken-thighs", category: "protein", store: "Walmart", price: "$3.49", unit: "lb", terms: ["chicken thigh", "chicken thighs"] },
  { id: "ground-beef", category: "protein", store: "Real Canadian Superstore", price: "$4.99", unit: "lb",
    terms: ["ground beef", "beef mince", "minced beef"] },
];
export const foodDealById = (id: string) => foodDeals.find(deal => deal.id === id);

/** Weekly deals on the cooking plan: offers still running on the week's Monday, those for a planned dish's ingredient
 * first, each with the first dish it is for. ponytail: no store filter, there is no household store setting yet. */
export function weekDeals(deals: readonly FoodDeal[], weekStart: string, dishes: readonly { title: string; ingredients: readonly string[] }[]) {
  return deals.filter(deal => !deal.expires || deal.expires >= weekStart)
    .map(deal => ({ deal, dish: dishes.find(d => d.ingredients.some(line => deal.terms.some(term => ingredientMatches(line, term))))?.title ?? null }))
    .sort((a, b) => Number(b.dish !== null) - Number(a.dish !== null));
}
