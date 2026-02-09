export type Recipe = {
  id: string;
  title: string;
  ingredients: string[];
  steps: string[];
  createdAt: string;
  updatedAt: string;
  image?: string | null;
  sourceUrl?: string | null;
  cookTime?: number | null;
  servings?: string | null;
  tags?: string[] | null;
};

export async function fetchRecipes(): Promise<Recipe[]> {
  const res = await fetch("/api/recipes");
  if (!res.ok) throw new Error("Failed to fetch recipes");
  return res.json();
}

export async function fetchRecipe(id: string): Promise<Recipe> {
  const res = await fetch(`/api/recipes/${id}`);
  if (!res.ok) throw new Error("Recipe not found");
  return res.json();
}

export async function createRecipe(data: Omit<Recipe, "id" | "createdAt" | "updatedAt">): Promise<Recipe> {
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to save recipe");
  }
  return res.json();
}

export async function updateRecipe(id: string, data: Partial<Recipe>): Promise<Recipe> {
  const res = await fetch(`/api/recipes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update recipe");
  return res.json();
}

export async function deleteRecipe(id: string): Promise<void> {
  const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete recipe");
}
