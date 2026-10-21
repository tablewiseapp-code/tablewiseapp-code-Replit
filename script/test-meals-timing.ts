import assert from "node:assert/strict";
import { toPlannerRecipe } from "../client/src/lib/planner-recipes";
import { recipeStageMinutes } from "../client/src/lib/recipe-time";
import { recipeToolKeys } from "../client/src/lib/recipe-tools";
import type { Recipe } from "../client/src/lib/storage";

const stored: Recipe = {
  id: "timing-example", title: "Chicken", ingredients: ["1 chicken"], steps: ["Prepare.", "Bake."],
  createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z",
  prepTime: 10, cookTime: 50, servings: "4",
};
const mapped = toPlannerRecipe(stored);
assert.equal(mapped.prepTime, 10);
assert.equal(mapped.cookTime, 50);
assert.equal(mapped.servings, "4");
assert.equal(recipeStageMinutes(mapped, "preparation"), 10);
assert.equal(recipeStageMinutes(mapped, "cooking"), 50);
assert.equal(recipeStageMinutes(mapped, "total"), 60);
assert.equal(recipeStageMinutes({ prepTime: 0, cookTime: 0 }, "total"), 0);
assert.equal(recipeStageMinutes({ prepTime: null, cookTime: 50 }, "total"), null);
assert.equal(recipeStageMinutes({ prepTime: 10, cookTime: null }, "total"), null);
assert.ok(recipeStageMinutes(mapped, "preparation")! <= 20);
assert.ok(recipeStageMinutes(mapped, "cooking")! > 20);
const unknown = toPlannerRecipe({ ...stored, prepTime: null, cookTime: null, servings: null });
assert.ok(unknown.minutes > 0, "Legacy suggestion ranking remains unchanged.");
assert.equal(recipeStageMinutes(unknown, "preparation"), null);
assert.equal(recipeStageMinutes(unknown, "cooking"), null, "Legacy step-count estimates must not become displayed cooking times.");
assert.equal(unknown.servings, null, "Do not display the inferred servings filter range as a real portion count.");
for (const invalid of [undefined, null, NaN, Infinity, -1, 0.5, 10081]) {
  assert.equal(recipeStageMinutes({ prepTime: invalid }, "preparation"), null);
  assert.equal(recipeStageMinutes({ cookTime: invalid }, "cooking"), null);
}
assert.equal(recipeStageMinutes({ prepTime: 0 }, "preparation"), 0);
assert.equal(recipeStageMinutes({ cookTime: 0 }, "cooking"), 0);
assert.equal(toPlannerRecipe({ ...stored, servings: "3–4" }).servings, "3–4");
assert.deepEqual(recipeToolKeys(["Preheat the oven.", "Mix in a bowl.", "Use a baking dish."]), ["toolOven", "toolBowl", "toolTray"]);
assert.deepEqual(recipeToolKeys(["Serve potatoes, pancakes and potage."]), []);
assert.deepEqual(recipeToolKeys(["Mix and serve."]), []);
assert.deepEqual(toPlannerRecipe({ ...stored, steps: ["Heat a skillet."] }).equipment, ["toolPan"]);
console.log("PASS meals timing/tools: raw durations retained, preparation 10 / total 60, missing/zero handling, actual portion strings, explicit equipment extraction without default or substring guesses.");
