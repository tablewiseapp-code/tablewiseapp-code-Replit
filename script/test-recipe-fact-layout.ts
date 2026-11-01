import assert from "node:assert/strict";
import { defaultFactOrder, normalizeFactOrder, moveRecipeFact } from "../client/src/lib/recipe-fact-layout";
for (const invalid of [null, {}, "bad", 42]) assert.deepEqual(normalizeFactOrder(invalid), [...defaultFactOrder]);
const repaired = normalizeFactOrder(["sugarG", "sugarG", "unknown", null]);
assert.equal(repaired[0], "sugarG");
assert.equal(normalizeFactOrder(["price", "sugarG"])[0], "sugarG", "Retired price position migrates without resetting other fields.");
assert.equal(new Set(repaired).size, defaultFactOrder.length);
const moved = moveRecipeFact(defaultFactOrder, "caloriesKcal", "portions");
assert.equal(moved[0], "caloriesKcal");
assert.equal(moved[1], "portions");
assert.deepEqual([...defaultFactOrder], normalizeFactOrder(null), "Original order must not mutate.");
assert.deepEqual(moveRecipeFact(moved, "missing", "tools"), moved);
assert.deepEqual(moveRecipeFact(moved, "tools", "missing"), moved);
assert.deepEqual(moveRecipeFact(moved, "tools", "tools"), moved);
assert.equal(moveRecipeFact(defaultFactOrder, "portions", "sugarG").indexOf("portions"),
  defaultFactOrder.indexOf("sugarG"));
assert.equal(moved.filter(id => id === "nutrition-details").length, 1, "Hidden fields retain their saved position.");
console.log("PASS recipe field layout: cross-section moves, validated preferences, duplicate/unknown recovery, complete hidden fields and immutable defaults.");
