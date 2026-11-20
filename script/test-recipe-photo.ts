import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { proteinPhotoGroup, proteinPhotoGroups, recipePhoto } from "../client/src/lib/recipe-photo";

assert.equal(proteinPhotoGroup(["6 boneless chicken thighs", "2 eggs"]), "chicken", "meat wins over eggs");
assert.equal(proteinPhotoGroup(["1 tin sardines or mackerel (or 300 g mussels)"]), "fish", "fish before shellfish");
assert.equal(proteinPhotoGroup(["200 g king prawns"]), "shellfish");
assert.equal(proteinPhotoGroup(["400 g tin chickpeas", "100 g feta"]), "beans");
assert.equal(proteinPhotoGroup(["2 eggs", "50 g cheddar"]), "eggs");
assert.equal(proteinPhotoGroup(["250 g pasta", "1 shallot"]), "vegetables", "no false match on 'ham' in shallot");
assert.equal(proteinPhotoGroup(["6 huevos"]), "vegetables", "non-English words are not read");

const a = recipePhoto({ id: "abc", ingredients: ["salmon"] });
assert.equal(a.example, true);
assert.match(a.src, /^\/protein-photos\/fish-[123]\.jpg$/);
assert.deepEqual(recipePhoto({ id: "abc", ingredients: ["salmon"] }), a, "same recipe, same photo");
assert.deepEqual(recipePhoto({ id: "abc", image: "/x.jpg", ingredients: ["salmon"] }), { src: "/x.jpg", example: false }, "a real photo wins");

for (const group of proteinPhotoGroups) for (const n of [1, 2, 3])
  assert.ok(existsSync(`client/public/protein-photos/${group}-${n}.jpg`), `${group}-${n}.jpg exists`);
console.log("recipe photo: ok");
