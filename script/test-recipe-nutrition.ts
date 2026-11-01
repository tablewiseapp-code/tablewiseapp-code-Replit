import assert from "node:assert/strict";
import { nutrientKeys, nutritionAmounts, nutritionBasis, recipeNutritionSchema, servingRange } from "../shared/recipe-nutrition";
import { createNutritionEnricher, nutritionFingerprint } from "../server/recipe-nutrition";

async function main() {
  const recipe = { id: "example", title: "Example", ingredients: ["200 g pasta"], steps: ["Cook"], servings: "4" };
  const totals = { caloriesKcal: 1200, proteinG: 40, carbsG: 200, fatG: 20, fiberG: 12, sugarG: 8 };
  const data = recipeNutritionSchema.parse({ version: 1, source: "ai-estimate", model: "test-only",
    analyzedAt: "2026-11-01T12:00:00.000Z", inputHash: nutritionFingerprint(recipe),
    totals, assumptions: ["Offline test data, not a real analysis."] });
  assert.deepEqual(servingRange("2–3"), { min: 2, max: 3 });
  assert.deepEqual(servingRange("4 portions"), { min: 4, max: 4 });
  for (const text of ["0", "-2", "4-2", "a bowl", "2+", "", "1000"]) assert.equal(servingRange(text), null);
  const amounts = nutritionAmounts(data, "4");
  assert.equal(amounts.find(value => value.key === "sugarG")!.min, 2);
  assert.equal(amounts.find(value => value.key === "caloriesKcal")!.max, 300);
  const range = nutritionAmounts(data, "2-3")[0];
  assert.equal(range.min, 400); assert.equal(range.max, 600);
  assert.equal(nutritionAmounts(data, null)[0].min, 1200);
  assert.equal(nutritionAmounts(data, "12 muffins")[0].min, 100);
  assert.equal(nutritionAmounts(data, "10 quesadillas")[0].min, 120);
  assert.equal(nutritionBasis("12 muffins")!.unit, "muffin");
  assert.equal(nutritionBasis("10 quesadillas")!.unit, "quesadilla");
  assert.equal(nutritionBasis("a bowl"), null);
  for (const key of nutrientKeys) {
    assert.equal(recipeNutritionSchema.safeParse({ ...data, totals: { ...totals, [key]: -1 } }).success, false);
    assert.equal(recipeNutritionSchema.safeParse({ ...data, totals: { ...totals, [key]: NaN } }).success, false);
  }
  assert.equal(recipeNutritionSchema.safeParse({ ...data, totals: { ...totals, sugarG: 201 } }).success, false);
  assert.equal(recipeNutritionSchema.safeParse({ ...data, totals: { ...totals, fiberG: 201 } }).success, false);
  assert.notEqual(nutritionFingerprint(recipe), nutritionFingerprint({ ...recipe, servings: "2" }));
  assert.notEqual(nutritionFingerprint(recipe), nutritionFingerprint({ ...recipe, ingredients: ["100 g pasta"] }));
  assert.notEqual(nutritionFingerprint(recipe), nutritionFingerprint({ ...recipe, steps: ["Discard half"] }));
  const read = createNutritionEnricher(async (sql, params) => {
    assert.ok(sql.includes("ANY($1"));
    assert.deepEqual(params, [[recipe.id]]);
    return { rows: [{ recipe_id: recipe.id, input_hash: data.inputHash, data }] };
  });
  assert.equal((await read([recipe]))[0].nutritionStatus, "ready");
  assert.equal((await read([{ ...recipe, servings: "2" }]))[0].nutrition, null);
  const empty = createNutritionEnricher(async () => ({ rows: [] }));
  assert.equal((await empty([recipe]))[0].nutritionStatus, "not-analyzed");
  const invalid = createNutritionEnricher(async () => ({ rows: [{ recipe_id: recipe.id, input_hash: data.inputHash, data: {} }] }));
  assert.equal((await invalid([recipe]))[0].nutritionStatus, "not-analyzed");
  const oldError = console.error;
  console.error = () => {};
  try {
    const failed = createNutritionEnricher(async () => { throw new Error("offline"); });
    assert.equal((await failed([recipe]))[0].nutritionStatus, "unavailable");
  } finally { console.error = oldError; }
  assert.deepEqual((await empty([])), []);
  console.log("PASS nutrition: per-portion/range/unknown servings, total sugar and fiber bounds, original input hashes, stale/invalid/missing cache and unavailable storage. No network or database writes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
