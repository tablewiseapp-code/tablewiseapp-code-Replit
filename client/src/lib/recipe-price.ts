import { nutritionBasis } from "@shared/recipe-nutrition";

export const mockPriceCurrency = "CAD" as const;
export type RecipePrice = {
  currency: typeof mockPriceCurrency;
  total: number;
  source: "mock" | "ai-estimate" | "verified";
  perUnit: { min: number; max: number; unit: string } | null;
};

export function dishPriceTier(total: number): "$" | "$$" | "$$$" | null {
  if (!Number.isFinite(total) || total < 0) return null;
  return total <= 10 ? "$" : total <= 20 ? "$$" : "$$$";
}

export function isEstimatedPrice(price: Pick<RecipePrice, "source">) {
  return price.source !== "verified";
}
// Illustrative whole-recipe costs in cents; not quotes or live shop prices.
const mockDishCents: Record<string, number> = {
  "tablewise:real:v1:chicken-curry": 1840,
  "tablewise:real:v1:salmon-egg-fried-rice": 1980,
  "tablewise:real:v1:lentil-leek-soup": 980,
  "tablewise:real:v1:baked-salmon": 2240,
  "tablewise:real:v1:coconut-chickpea-curry": 1120,
  "tablewise:real:v1:sundried-tomato-pasta": 1440,
  "tablewise:real:v1:black-bean-quesadillas": 1560,
  "tablewise:real:v1:spanish-omelette": 1240,
  "tablewise:real:v1:tuna-pasta-bake": 1720,
  "tablewise:real:v1:garlic-butter-chicken": 1860,
  "tablewise:real:v1:sichuan-beef-stir-fry": 2150,
  "tablewise:real:v1:spaghetti-meatballs": 2080,
  "tablewise:synthetic:v1:017": 1280,
  "tablewise:synthetic:v1:002": 640,
  "tablewise:synthetic:v1:036": 1460,
  "tablewise:synthetic:v1:039": 1640,
  "tablewise:synthetic:v1:048": 980,
  "tablewise:synthetic:v1:049": 1040,
  "tablewise:synthetic:v1:050": 1180,
  "tablewise:synthetic:v1:053": 1020,
};

export function mockRecipePrice(recipe: { id: string; servings?: string | null }): RecipePrice | null {
  const cents = Object.prototype.hasOwnProperty.call(mockDishCents, recipe.id)
    ? mockDishCents[recipe.id] : undefined;
  if (cents === undefined) return null;
  const basis = nutritionBasis(recipe.servings);
  const total = cents / 100;
  return {
    currency: mockPriceCurrency, total, source: "mock",
    perUnit: basis ? { min: total / basis.max, max: total / basis.min, unit: basis.unit } : null,
  };
}
