import { researchedDinners } from "./researched-import";
import { recipeToolKeys, type RecipeToolKey } from "../../client/src/lib/recipe-tools";

// Presentation-only fixtures. Do not write these illustrative estimates into
// the pinned synthetic batch or disguise them as source-verified recipe facts.
const estimates: Record<string, {
  servings: string; prepTime: number; cookTime: number; equipment: RecipeToolKey[];
}> = {
  "017": { servings: "4", prepTime: 15, cookTime: 30, equipment: ["toolPot", "toolPan", "toolKnife", "toolBoard"] },
  "002": { servings: "4", prepTime: 10, cookTime: 15, equipment: ["toolPot", "toolPan", "toolKnife", "toolBoard"] },
  "036": { servings: "4", prepTime: 15, cookTime: 0, equipment: ["toolBowl", "toolKnife", "toolBoard"] },
  "039": { servings: "4", prepTime: 15, cookTime: 0, equipment: ["toolBowl", "toolKnife", "toolBoard"] },
  "048": { servings: "2", prepTime: 15, cookTime: 15, equipment: ["toolPan", "toolKnife", "toolBoard"] },
  "049": { servings: "2", prepTime: 10, cookTime: 15, equipment: ["toolPan", "toolBowl"] },
  "050": { servings: "2", prepTime: 10, cookTime: 10, equipment: ["toolPan", "toolBowl"] },
  "053": { servings: "12 muffins", prepTime: 15, cookTime: 25, equipment: ["toolOven", "toolBowl", "toolTray"] },
};
const byId = new Map(Object.entries(estimates).map(([number, values]) =>
  [`tablewise:synthetic:v1:${number}`, values]));
export const curatedDevelopmentIds = [
  ...researchedDinners.map(recipe => recipe.id), ...byId.keys(),
];
const visible = new Set(curatedDevelopmentIds);
type Curatable = {
  id: string; steps: string[]; tags?: string[] | null;
  servings?: string | null; prepTime?: number | null; cookTime?: number | null;
};

export function developmentCatalogEnabled() {
  return process.env.NODE_ENV === "development" &&
    process.env.TABLEWISE_DEV_CURATED_CATALOG === "true";
}

export function developmentRecipeReadOnly(id: string) {
  return developmentCatalogEnabled() && visible.has(id);
}

export function curateDevelopmentRecipe<T extends Curatable>(recipe: T) {
  const estimate = byId.get(recipe.id);
  return estimate ? {
    ...recipe, ...estimate, equipment: recipeToolKeys(recipe.steps, estimate.equipment), metadataEstimated: true,
    developmentReadOnly: true,
    tags: [...(recipe.tags ?? []), "Development estimates"],
  } : { ...recipe, equipment: recipeToolKeys(recipe.steps), developmentReadOnly: visible.has(recipe.id) };
}

export function curateDevelopmentCatalog<T extends Curatable>(recipes: T[]) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  if (curatedDevelopmentIds.length !== 20 || visible.size !== 20 ||
    curatedDevelopmentIds.some(id => !byId.has(id))) {
    throw new Error("The curated development catalog requires its twenty selected recipes.");
  }
  const result = curatedDevelopmentIds.map(id => curateDevelopmentRecipe(byId.get(id)!));
  if (result.some(r => !r.servings?.trim() || !Number.isInteger(r.prepTime) || r.prepTime! < 0 ||
    !Number.isInteger(r.cookTime) || r.cookTime! < 0 || r.equipment.length === 0)) {
    throw new Error("Every visible development recipe requires portions, preparation/cooking time and tools.");
  }
  return result;
}
