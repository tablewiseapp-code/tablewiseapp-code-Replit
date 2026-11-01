import assert from "node:assert/strict";
import { dishPriceTier, isEstimatedPrice, mockRecipePrice } from "../client/src/lib/recipe-price";
import { curatedDevelopmentIds } from "../server/seeds/curated-development-catalog";

for (const id of curatedDevelopmentIds) {
  const price = mockRecipePrice({ id, servings: "4" })!;
  assert.ok(price && price.total > 0);
  assert.equal(price.currency, "CAD");
  assert.equal(price.source, "mock");
  assert.equal(price.perUnit!.min, price.total / 4);
  assert.deepEqual(price, mockRecipePrice({ id, servings: "4" }));
}
const salmon = mockRecipePrice({ id: "tablewise:real:v1:salmon-egg-fried-rice", servings: "2–3" })!;
assert.equal(salmon.total, 19.8);
assert.equal(salmon.perUnit!.min.toFixed(2), "6.60");
assert.equal(salmon.perUnit!.max.toFixed(2), "9.90");
const muffins = mockRecipePrice({ id: "tablewise:synthetic:v1:053", servings: "12 muffins" })!;
assert.equal(muffins.perUnit!.unit, "muffin");
assert.equal(muffins.perUnit!.min.toFixed(2), "0.85");
assert.equal(mockRecipePrice({ id: "tablewise:synthetic:v1:053", servings: "unknown" })!.perUnit, null);
for (const id of ["missing", "constructor", "toString", "__proto__"]) assert.equal(mockRecipePrice({ id }), null);
for (const [total, expected] of [[0, "$"], [10, "$"], [10.01, "$$"], [20, "$$"], [20.01, "$$$"]] as const) {
  assert.equal(dishPriceTier(total), expected);
}
for (const bad of [-1, NaN, Infinity]) assert.equal(dishPriceTier(bad), null);
assert.equal(isEstimatedPrice({ source: "mock" }), true);
assert.equal(isEstimatedPrice({ source: "ai-estimate" }), true);
assert.equal(isEstimatedPrice({ source: "verified" }), false);
console.log("PASS mock CAD prices: twenty stable whole-dish costs, per-portion ranges, explicit item yields and honest unknown states. No network or database access.");
