import { createHash } from "node:crypto";
import { recipeNutritionSchema, type NutritionInput, type NutritionFields } from "../shared/recipe-nutrition";

export function nutritionFingerprint(recipe: NutritionInput): string {
  return createHash("sha256").update(JSON.stringify({
    version: 1, title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps ?? [], servings: recipe.servings ?? null,
  })).digest("hex");
}

type CacheQuery = (text: string, params: unknown[]) => Promise<{
  rows: Array<{ recipe_id: string; input_hash: string; data: unknown }>;
}>;
export type NutritionEnricher = <T extends NutritionInput>(recipes: T[]) => Promise<Array<T & NutritionFields>>;

export function createNutritionEnricher(query: CacheQuery): NutritionEnricher {
  return async recipes => {
    if (!recipes.length) return [];
    try {
      const result = await query(
        "SELECT recipe_id, input_hash, data FROM recipe_nutrition WHERE recipe_id = ANY($1::varchar[])",
        [recipes.map(recipe => recipe.id)],
      );
      const rows = new Map(result.rows.map(row => [row.recipe_id, row]));
      return recipes.map(recipe => {
        const row = rows.get(recipe.id);
        const parsed = recipeNutritionSchema.safeParse(row?.data);
        const currentHash = nutritionFingerprint(recipe);
        const nutrition = parsed.success && row?.input_hash === currentHash && parsed.data.inputHash === currentHash
          ? parsed.data : null;
        return { ...recipe, nutrition, nutritionStatus: nutrition ? "ready" as const : "not-analyzed" as const };
      });
    } catch {
      // Nutrition must fail visibly without taking down recipe browsing.
      console.error("api_failure operation=nutrition_read");
      return recipes.map(recipe => ({ ...recipe, nutrition: null, nutritionStatus: "unavailable" as const }));
    }
  };
}

export async function databaseNutritionEnricher(): Promise<NutritionEnricher> {
  const { pool } = await import("./db");
  return createNutritionEnricher((text, params) => pool.query(text, params));
}
