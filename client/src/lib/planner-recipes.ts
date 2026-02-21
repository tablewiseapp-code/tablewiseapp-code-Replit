import type { Recipe as StoredRecipe } from "@/lib/storage";

export type PlannerRecipe = {
  id: string;
  title: string;
  minutes: number;
  mealType: string;
  tags: string[];
  tools: string[];
  sourceType: string;
  proteinType: string;
  servingsRange: string;
  hasNotes: boolean;
  modifiedByMe: boolean;
  ingredients: string[];
  sourceUrl?: string | null;
  image?: string | null;
};

function normalizeTag(tag: string): string {
  const normalized = tag.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "kidfriendly") return "kidFriendly";
  if (normalized === "vegetarian") return "vegetarian";
  if (normalized === "glutenfree") return "glutenFree";
  return tag.trim();
}

function inferMealType(recipe: StoredRecipe): string {
  const tags = (recipe.tags ?? []).map((tag) => tag.toLowerCase());
  const title = recipe.title.toLowerCase();

  if (tags.some((tag) => tag.includes("breakfast")) || /\bbreakfast|omelet|omelette|oat|toast\b/.test(title)) {
    return "Breakfast";
  }
  if (tags.some((tag) => tag.includes("lunch box") || tag.includes("lunchbox")) || /\blunch box|bento\b/.test(title)) {
    return "Lunch box";
  }
  if (tags.some((tag) => tag.includes("lunch")) || /\blunch|sandwich|wrap|salad\b/.test(title)) {
    return "Lunch";
  }
  return "Dinner";
}

function inferTools(steps: string[]): string[] {
  const text = steps.join(" ").toLowerCase();
  const tools: string[] = [];

  if (/\bair ?fry|airfryer\b/.test(text)) tools.push("Air fryer");
  if (/\boven|bake|roast\b/.test(text)) tools.push("Oven");
  if (/\bstove|stovetop|boil|simmer|fry|saute|sautee|skillet|pan\b/.test(text)) tools.push("Stovetop");
  if (/\bno cook|no-cook|assemble|chill|mix and serve\b/.test(text)) tools.push("No-cook");

  if (tools.length === 0) {
    tools.push("No-cook");
  }

  return Array.from(new Set(tools));
}

function inferProteinType(ingredients: string[]): string {
  const text = ingredients.join(" ").toLowerCase();
  if (/\bchicken|turkey\b/.test(text)) return "Chicken";
  if (/\bbeef|pork|lamb\b/.test(text)) return "Beef";
  if (/\bfish|salmon|shrimp|tuna|cod|tilapia|trout|seafood|crab|prawn\b/.test(text)) return "Seafood";
  return "Plant-based";
}

function inferServingsRange(servings?: string | null): string {
  if (!servings) return "1-2";

  const trimmed = servings.trim();
  if (trimmed.includes("-") || trimmed.includes("+")) {
    return trimmed;
  }

  const numeric = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(numeric)) {
    if (numeric <= 2) return "1-2";
    if (numeric <= 4) return "3-4";
    return "5+";
  }

  return "1-2";
}

function inferMinutes(recipe: StoredRecipe): number {
  if (typeof recipe.cookTime === "number" && recipe.cookTime > 0) {
    return recipe.cookTime;
  }
  return Math.max(10, recipe.steps.length * 10);
}

function inferSourceType(recipe: StoredRecipe): string {
  return recipe.sourceUrl ? "Imported" : "My recipes";
}

export function toPlannerRecipe(recipe: StoredRecipe): PlannerRecipe {
  return {
    id: recipe.id,
    title: recipe.title,
    minutes: inferMinutes(recipe),
    mealType: inferMealType(recipe),
    tags: (recipe.tags ?? []).map(normalizeTag),
    tools: inferTools(recipe.steps),
    sourceType: inferSourceType(recipe),
    proteinType: inferProteinType(recipe.ingredients),
    servingsRange: inferServingsRange(recipe.servings),
    hasNotes: false,
    modifiedByMe: false,
    ingredients: recipe.ingredients,
    sourceUrl: recipe.sourceUrl ?? null,
    image: recipe.image ?? null,
  };
}

export function toPlannerRecipes(recipes: StoredRecipe[]): PlannerRecipe[] {
  return recipes.map(toPlannerRecipe);
}

