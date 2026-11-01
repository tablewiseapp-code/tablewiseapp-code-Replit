export const recipeFactOrderKey = "tablewise:recipe-fact-order:v1";
export const defaultFactOrder = [
  "portions", "time", "tools", "preparation", "credit",
  "nutrition-heading", "caloriesKcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG",
  "nutrition-details", "nutrition-status",
] as const;
export type RecipeFactId = typeof defaultFactOrder[number];

export function normalizeFactOrder(value: unknown): RecipeFactId[] {
  const known = new Set<string>(defaultFactOrder);
  const saved = Array.isArray(value) ? value.filter((id): id is RecipeFactId => typeof id === "string" && known.has(id)) : [];
  return [...new Set([...saved, ...defaultFactOrder])];
}

export function moveRecipeFact(order: readonly RecipeFactId[], active: string, over: string): RecipeFactId[] {
  const result = normalizeFactOrder(order);
  const from = result.indexOf(active as RecipeFactId), to = result.indexOf(over as RecipeFactId);
  if (from < 0 || to < 0 || from === to) return result;
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}

export function readFactOrder(): RecipeFactId[] {
  try {
    const raw = localStorage.getItem(recipeFactOrderKey);
    return normalizeFactOrder(raw && raw.length < 4096 ? JSON.parse(raw) : null);
  } catch { return normalizeFactOrder(null); }
}
