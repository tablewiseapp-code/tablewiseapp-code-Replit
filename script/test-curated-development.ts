import assert from "node:assert/strict";
import { researchedDinners } from "../server/seeds/researched-import";
import { developmentFixtures } from "../server/seeds/development-fixtures";
import { curateDevelopmentCatalog, curateDevelopmentRecipe, developmentCatalogEnabled } from "../server/seeds/curated-development-catalog";
import { recipeToolKeys } from "../client/src/lib/recipe-tools";

const stored = [...researchedDinners, ...developmentFixtures];
const before = structuredClone(stored);
const visible = curateDevelopmentCatalog(stored);
assert.equal(stored.length, 112);
assert.equal(visible.length, 20);
assert.equal(new Set(visible.map(r => r.id)).size, 20);
assert.equal(visible.filter(r => "metadataEstimated" in r && r.metadataEstimated).length, 8);
for (const r of visible) {
  assert.equal(r.developmentReadOnly, true);
  assert.ok(r.servings?.trim());
  assert.ok(Number.isInteger(r.prepTime) && r.prepTime! >= 0);
  assert.ok(Number.isInteger(r.cookTime) && r.cookTime! >= 0);
  assert.ok(r.equipment.length > 0);
  assert.deepEqual(recipeToolKeys(r.steps, r.equipment), r.equipment);
  assert.deepEqual(curateDevelopmentRecipe(stored.find(raw => raw.id === r.id)!), r);
}
assert.deepEqual(stored, before, "No fixture, original metadata or instruction may be mutated.");
assert.throws(() => curateDevelopmentCatalog([]), /twenty selected/);
const oldNode = process.env.NODE_ENV, oldFlag = process.env.TABLEWISE_DEV_CURATED_CATALOG;
try {
  process.env.TABLEWISE_DEV_CURATED_CATALOG = "true";
  process.env.NODE_ENV = "production";
  assert.equal(developmentCatalogEnabled(), false, "The local flag must not enable production curation.");
  process.env.NODE_ENV = "development";
  assert.equal(developmentCatalogEnabled(), true);
  process.env.TABLEWISE_DEV_CURATED_CATALOG = "false";
  assert.equal(developmentCatalogEnabled(), false);
} finally {
  if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode;
  if (oldFlag === undefined) delete process.env.TABLEWISE_DEV_CURATED_CATALOG; else process.env.TABLEWISE_DEV_CURATED_CATALOG = oldFlag;
}
console.log("PASS curated development: exactly 20 complete recipes, 8 clearly estimated fixtures, zero input mutations, consistent detail metadata and production-disabled guard; no database access.");
