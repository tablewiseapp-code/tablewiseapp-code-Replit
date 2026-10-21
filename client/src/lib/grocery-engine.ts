import type { WeekPlan } from "./week-plan";
import type { Recipe } from "./storage";

export const groceryCategories = ["Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs", "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other"] as const;
export type GroceryCategory = typeof groceryCategories[number];
const categoryWords: Record<GroceryCategory, string[]> = {
  "Produce": ["broccoli", "pepper", "ginger", "lemon", "dill", "cucumber", "tomato", "lettuce", "spinach", "carrot", "celery", "onion", "garlic", "mushroom", "rosemary", "thyme", "parsley", "potato", "cabbage", "lime", "avocado", "berries", "peas"],
  "Meat & Poultry": ["chicken", "beef", "bacon", "pork", "turkey"],
  "Seafood": ["salmon", "shrimp", "fish"],
  "Dairy & Eggs": ["egg", "cheese", "feta", "parmesan", "butter", "milk", "yogurt", "cream"],
  "Grains & Pasta": ["rice", "pasta", "bread", "oat", "quinoa", "tortilla", "flour"],
  "Canned & Jarred": ["sauce", "oil", "broth", "hummus", "chickpea", "lentil", "dressing", "wine", "canned"],
  "Spices & Seasonings": ["salt", "cumin", "paprika", "oregano", "black pepper", "pepper flakes"],
  "Other": [],
};
export function categorizeGrocery(text: string): GroceryCategory {
  const lower = text.toLowerCase();
  // Specific spice/canned matches before broad produce words such as "pepper".
  for (const category of ["Spices & Seasonings", "Canned & Jarred", ...groceryCategories.filter(v => !["Spices & Seasonings", "Canned & Jarred"].includes(v))] as GroceryCategory[]) {
    if (categoryWords[category].some(word => lower.includes(word))) return category;
  }
  return "Other";
}
type Rational = { n: number; d: number };
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function rational(n: number, d: number): Rational | null {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n <= 0 || d <= 0) return null;
  const factor = gcd(n, d);
  return { n: n / factor, d: d / factor };
}
function quantity(value: string): Rational | null {
  if (/^\d+(?:\.\d{1,3})?$/.test(value)) {
    const decimals = value.split(".")[1]?.length || 0;
    const d = 10 ** decimals;
    return rational(Math.round(Number(value) * d), d);
  }
  const fraction = /^(\d+)\s+(\d+)\/(\d+)$/.exec(value) || /^()(\d+)\/(\d+)$/.exec(value);
  return fraction ? rational(Number(fraction[1] || 0) * Number(fraction[3]) + Number(fraction[2]), Number(fraction[3])) : null;
}
const units: Record<string, string> = {
  g: "g", kg: "kg", ml: "ml", l: "l", tsp: "tsp", tbsp: "tbsp", cup: "cup", cups: "cup",
  teaspoon: "tsp", teaspoons: "tsp", tablespoon: "tbsp", tablespoons: "tbsp",
};
function parseMeasured(text: string) {
  const match = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d{1,3})?)\s+(g|kg|ml|l|tsp|tbsp|cups?|teaspoons?|tablespoons?)\s+(.+)$/i.exec(text.trim());
  if (!match) return null;
  const amount = quantity(match[1]);
  if (!amount) return null;
  const unit = units[match[2].toLowerCase()];
  const identity = match[3].trim().replace(/\s+/g, " ").toLowerCase();
  return { amount, unit, identity, display: match[3].trim() };
}
function displayAmount({ n, d }: Rational) {
  if (n % d === 0) return String(n / d);
  let reduced = d;
  while (reduced % 2 === 0) reduced /= 2;
  while (reduced % 5 === 0) reduced /= 5;
  if (reduced === 1 && d <= 1000) return String(n / d);
  const whole = Math.floor(n / d), remainder = n % d;
  return whole ? `${whole} ${remainder}/${d}` : `${n}/${d}`;
}
export type GrocerySource = { recipeId: string; recipeTitle: string; ingredientIndex: number; text: string };
export type GroceryItem = {
  id: string; text: string; category: GroceryCategory; sources: GrocerySource[];
};
type BuildingItem = GroceryItem & { measured: ReturnType<typeof parseMeasured> };
export type GroceryResult = { items: GroceryItem[]; missingRecipeIds: string[]; recipeTitles: string[] };

export function buildGroceries(plan: WeekPlan, recipes: Pick<Recipe, "id" | "title" | "ingredients">[]): GroceryResult {
  if (!plan.confirmed) return { items: [], missingRecipeIds: [], recipeTitles: [] };
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const items: BuildingItem[] = [];
  const mergeable = new Map<string, BuildingItem>();
  const missingRecipeIds: string[] = [], recipeTitles: string[] = [];
  for (const recipeId of plan.selectedRecipeIds) {
    const recipe = byId.get(recipeId);
    if (!recipe) { missingRecipeIds.push(recipeId); continue; }
    recipeTitles.push(recipe.title);
    recipe.ingredients.forEach((text, ingredientIndex) => {
      const source = { recipeId, recipeTitle: recipe.title, ingredientIndex, text };
      const measured = parseMeasured(text);
      const key = measured ? JSON.stringify([measured.unit, measured.identity]) : null;
      const previous = key ? mergeable.get(key) : undefined;
      const amount = previous?.measured && measured ? rational(
        previous.measured.amount.n * measured.amount.d + measured.amount.n * previous.measured.amount.d,
        previous.measured.amount.d * measured.amount.d,
      ) : null;
      if (previous?.measured && amount) {
        previous.measured.amount = amount;
        previous.sources.push(source);
      } else {
        const item: BuildingItem = { id: "", text, category: categorizeGrocery(text), sources: [source], measured };
        items.push(item);
        if (key) mergeable.set(key, item);
      }
    });
  }
  return {
    items: items.map(({ measured, ...item }) => ({
      ...item,
      // Full provenance is an unambiguous identity, not a collision-prone short hash.
      id: JSON.stringify(item.sources.map(source => [source.recipeId, source.ingredientIndex, source.text]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))),
      text: measured && item.sources.length > 1 ? `${displayAmount(measured.amount)} ${measured.unit} ${measured.display}` : item.text,
    })),
    missingRecipeIds, recipeTitles,
  };
}
