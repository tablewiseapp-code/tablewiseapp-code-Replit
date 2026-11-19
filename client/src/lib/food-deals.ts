// Food deals on Week → Plan. Hardcoded sample offers, labelled "Sample deals" in the UI; there is no deals source yet.
// `terms` are ingredient wordings matched against recipe ingredient lines (meal-filters.ts ingredientMatches).
export const builtInDealCategories = ["protein", "produce"] as const;
export const suggestedDealCategories = ["baking", "dairyEggs", "grainsPasta", "pantry", "frozen"] as const;

export type FoodDeal = { id: string; category: string; store: string; price: string; unit: "lb"; terms: string[] };
export const foodDeals: readonly FoodDeal[] = [
  { id: "chicken-thighs", category: "protein", store: "Walmart", price: "$3.49", unit: "lb", terms: ["chicken thigh", "chicken thighs"] },
  { id: "ground-beef", category: "protein", store: "Real Canadian Superstore", price: "$4.99", unit: "lb",
    terms: ["ground beef", "beef mince", "minced beef"] },
];
export const foodDealById = (id: string) => foodDeals.find(deal => deal.id === id);
