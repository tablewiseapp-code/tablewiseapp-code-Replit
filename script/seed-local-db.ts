// Local development only: (re)fills an empty Docker database with the curated catalog,
// i.e. the 12 sourced dinners + the 20 synthetic development recipes, and labelled nutrition estimates
// for the sourced dinners. Additive: existing rows are never replaced. Then refresh the dump with script/db-dump.sh.
// Usage (in the app container): npx tsx script/seed-local-db.ts
import { recipes, recipeNutrition } from "../shared/schema";
import { researchedDinners } from "../server/seeds/researched-import";
import { developmentFixtures } from "../server/seeds/development-fixtures";
import { nutritionFingerprint } from "../server/recipe-nutrition";
import { recipeNutritionSchema } from "../shared/recipe-nutrition";

// Whole-recipe [kcal, protein, carbs, fat, fiber, sugar], estimated by Claude from each ingredient list (not lab-analysed).
const estimates: Record<string, [number, number, number, number, number, number]> = {
  "chicken-curry": [1595, 141, 46, 92, 12, 22], "salmon-egg-fried-rice": [1030, 55, 96, 46, 9, 12],
  "lentil-leek-soup": [920, 47, 180, 4, 28, 42], "baked-salmon": [1285, 112, 0, 84, 0, 0],
  "coconut-chickpea-curry": [1810, 51, 158, 112, 40, 42], "sundried-tomato-pasta": [1595, 57, 199, 64, 13, 31],
  "black-bean-quesadillas": [2580, 109, 296, 109, 30, 18], "spanish-omelette": [1400, 68, 114, 75, 17, 19],
  "tuna-pasta-bake": [3240, 183, 388, 106, 23, 48], "garlic-butter-chicken": [1135, 114, 10, 70, 2, 2],
  "sichuan-beef-stir-fry": [1520, 80, 135, 71, 13, 22], "spaghetti-meatballs": [4860, 221, 443, 246, 23, 38],
};

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Local development seeding only.");
  const { db, pool } = await import("../server/db");
  const rows = [...researchedDinners, ...developmentFixtures];
  const inserted = await db.insert(recipes).values(rows).onConflictDoNothing().returning({ id: recipes.id });
  let nutrition = 0;
  for (const recipe of researchedDinners) {
    const totals = estimates[recipe.id.replace("tablewise:real:v1:", "")];
    if (!totals) continue;
    const [caloriesKcal, proteinG, carbsG, fatG, fiberG, sugarG] = totals;
    const inputHash = nutritionFingerprint(recipe);
    const data = recipeNutritionSchema.parse({
      version: 1, source: "ai-estimate", model: "claude-sonnet-5-5", analyzedAt: new Date().toISOString(), inputHash,
      totals: { caloriesKcal, proteinG, carbsG, fatG, fiberG, sugarG },
      assumptions: [
        "Estimated by Claude from the ingredient list using typical values for the stated quantities; not lab-analysed.",
        "Totals are for the whole recipe; the app divides by the stated servings.",
        "Optional 'to serve' items and salt/pepper to taste are excluded.",
        "Cooking oil and butter are counted in full, though some may stay in the pan.",
      ],
    });
    const result = await db.insert(recipeNutrition).values({ recipeId: recipe.id, inputHash, data }).onConflictDoNothing().returning();
    nutrition += result.length;
  }
  console.log(`seeded recipes=${inserted.length}/${rows.length} nutrition=${nutrition}/${Object.keys(estimates).length}`);
  await pool.end();
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Seed failed."); process.exit(1); });
