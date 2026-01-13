export type Recipe = {
  id: string;
  title: string;
  ingredients: string[];
  steps: string[];
  createdAt: number;
  updatedAt: number;
  image?: string;
  sourceUrl?: string;
};

const STORAGE_KEY = "tw_current_recipe";

export function loadCurrentRecipe(): Recipe | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as Recipe;
    }
  } catch (e) {
    console.error("Failed to load recipe:", e);
  }
  return null;
}

export function saveCurrentRecipe(recipe: Recipe): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
  } catch (e) {
    console.error("Failed to save recipe:", e);
  }
}

export function generateId(): string {
  return `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
