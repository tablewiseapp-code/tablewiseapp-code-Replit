export type RecipeTimeMode = "preparation" | "total";
export type RecipeTimeData = {
  prepTime?: number | null;
  cookTime?: number | null;
};

export const recipeTimePreferenceKey = "tablewise:time-display:v1";

function validMinutes(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) &&
    value >= 0 && value <= 10080 ? value : null;
}

export function recipeStageMinutes(recipe: RecipeTimeData, mode: RecipeTimeMode | "cooking"): number | null {
  const preparation = validMinutes(recipe.prepTime);
  const cooking = validMinutes(recipe.cookTime);
  if (mode === "total") return preparation === null || cooking === null ? null : preparation + cooking;
  return mode === "preparation" ? preparation : cooking;
}
