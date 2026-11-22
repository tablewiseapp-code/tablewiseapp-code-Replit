// Cook with what I have: the handoff's acceptance examples on the pure logic (client/src/lib/on-hand.ts).
import assert from "node:assert/strict";
import { applyOnHand, boughtProteins, findWithWhatIHave, newItems, parseAmount, preferOnHand, typesOf, usesProtein, type OnHand } from "../client/src/lib/on-hand";
import { buildRecipeGroceryRows, groceryMeasure } from "../client/src/lib/grocery-meal-removal";
import type { EngineRecipe } from "../client/src/lib/preference-engine";

const r = (id: string, ingredients: string[], servings = "2"): EngineRecipe & { servings: string } =>
  ({ id, title: id, ingredients, tags: [], mealType: "Dinner", deviceRequirements: { groups: [] } as never, servings });
const chickenRice = r("chicken-rice", ["400 g chicken thighs", "1 cup rice", "1 tbsp soy sauce"]);
const chickenBroccoli = r("chicken-broccoli", ["400 g chicken thighs", "1 head broccoli", "1 tbsp soy sauce"]);
const eggs = r("eggs", ["4 eggs", "1 tbsp butter"]);
const tofu = r("tofu", ["300 g tofu", "1 tbsp soy sauce"]);
const stock = r("stock", ["500 ml chicken stock", "200 g noodles"]);

// Amounts.
assert.deepEqual(parseAmount("600 g"), { quantity: 600, unit: "g" });
assert.deepEqual(parseAmount("1 kg"), { quantity: 1000, unit: "g" });
assert.deepEqual(parseAmount("6 eggs"), { quantity: 6, unit: null });
assert.equal(parseAmount("some"), null);
assert.ok(!usesProtein(stock, "chicken"), "chicken stock is not chicken");

// Last week's bought chicken is suggested (unchecked in the UI); vegetables are not proteins.
assert.deepEqual(boughtProteins(["600 g chicken thighs", "2 onions", "extra:x1:6 eggs", "extra:x2"], [{ id: "x2", text: "tofu" }]),
  ["chicken thighs", "eggs", "tofu"]);

// Home: eggs or chicken; Must include chicken drops the egg-only recipe; restrictions stay (only eligible recipes come in).
const eligible = [eggs, chickenRice, tofu, stock];
assert.deepEqual(findWithWhatIHave(eligible, [{ name: "chicken thighs" }]).recipes.map(x => x.id), ["chicken-rice"]);
assert.deepEqual(findWithWhatIHave(eligible, [{ name: "eggs" }, { name: "chicken" }]).recipes.map(x => x.id), ["eggs", "chicken-rice"]);
assert.deepEqual(findWithWhatIHave(eligible, [{ name: "eggs" }, { name: "chicken", required: true }]).recipes.map(x => x.id), ["chicken-rice"]);
assert.equal(findWithWhatIHave([], [{ name: "eggs" }]).noMatch, "restrictions");
assert.equal(findWithWhatIHave([eggs], [{ name: "eggs" }, { name: "chicken", required: true }]).noMatch, "required");
assert.equal(findWithWhatIHave([eggs], [{ name: "lamb" }]).noMatch, "proteins");

// Minimize groceries: rice already on the list, so chicken and rice adds nothing new and beats chicken and broccoli.
const have = typesOf(["2 cups rice", "2 tbsp soy sauce"]);
assert.equal(newItems(chickenRice, have, ["chicken"]), 0);
assert.equal(newItems(chickenBroccoli, have, ["chicken"]), 1);
assert.deepEqual(findWithWhatIHave([chickenBroccoli, chickenRice], [{ name: "chicken" }], { minimize: true, have }).recipes.map(x => x.id), ["chicken-rice", "chicken-broccoli"]);
assert.deepEqual(findWithWhatIHave([chickenBroccoli, chickenRice], [{ name: "chicken" }], { have }).recipes.map(x => x.id), ["chicken-broccoli", "chicken-rice"], "off: the incoming order");

// The Week's draft: a protein on hand first, once; with Minimize, ingredients of earlier dishes count as had.
const prefer = preferOnHand<EngineRecipe>({ items: [{ name: "tofu", amount: null }], minimize: false });
assert.deepEqual(prefer([eggs, tofu], []).map(x => x.id), ["tofu", "eggs"]);
assert.deepEqual(prefer([eggs, tofu], [tofu]).map(x => x.id), ["eggs", "tofu"], "tofu used already: the usual order");
const lean = preferOnHand<EngineRecipe>({ items: [], minimize: true });
assert.deepEqual(lean([eggs, chickenBroccoli, tofu], [chickenRice]).map(x => x.id), ["chicken-broccoli", "tofu", "eggs"], "chicken thighs and soy sauce are bought once for the week");

// Groceries: 400 g + 600 g of chicken, 600 g at home → 400 g to buy. The second dish down to 300 g → 100 g.
const a = r("a", ["400 g chicken thighs", "1 onion"], "2"), b = r("b", ["600 g chicken thighs"], "2");
const batch = (id: string, recipeId: string, servings: number) => ({ id, recipeId, cookDate: "2026-11-23", serves: [{ date: "2026-11-23", servings }] });
const rows = (bServings: number) => buildRecipeGroceryRows([batch("1", "a", 2), batch("2", "b", bServings)], [a, b]);
const key = groceryMeasure("1 g chicken thighs").identity;
const known: OnHand = { minimize: false, items: [{ name: "chicken thighs", amount: { quantity: 600, unit: "g" } }] };
assert.equal(applyOnHand(rows(2), known).rows.get(key)?.ingredient, "400 g chicken thighs");
assert.equal(applyOnHand(rows(1), known).rows.get(key)?.ingredient, "100 g chicken thighs");
assert.equal(applyOnHand(rows(1), known).rows.get(key)?.ingredient, "100 g chicken thighs", "the same total every time");
assert.ok(applyOnHand(rows(2), known).rows.has(groceryMeasure("1 onion").identity), "other items stay");

// Unknown amount: 1 kg stays visible for review; "I have enough" covers it; entering 600 g leaves 400 g.
const unknown: OnHand = { minimize: false, items: [{ name: "chicken", amount: null }] };
const review = applyOnHand(rows(2), unknown);
assert.equal(review.rows.get(key)?.ingredient, "1000 g chicken thighs");
assert.deepEqual(review.reviews.get(key), { item: 0, kind: "unknown", demand: 1000 });
const covered: OnHand = { minimize: false, items: [{ name: "chicken", amount: null, covered: { [key]: 1000 } }] };
assert.equal(applyOnHand(rows(2), covered).rows.has(key), false);
assert.equal(applyOnHand(rows(2), { minimize: false, items: [{ name: "chicken", amount: { quantity: 600, unit: "g" } }] }).rows.get(key)?.ingredient, "400 g chicken thighs");
// Demand grows past the confirmation: ask about the extra 200 g only.
const grown = buildRecipeGroceryRows([batch("1", "a", 2), batch("2", "b", 4)], [a, b]);
assert.equal(applyOnHand(grown, covered).rows.get(key)?.ingredient, "600 g chicken thighs");
assert.equal(applyOnHand(grown, covered).reviews.get(key)?.kind, "more");
// Different measurement types: 2 thighs vs grams → ask, never guess a weight.
const units = applyOnHand(rows(2), { minimize: false, items: [{ name: "chicken thighs", amount: { quantity: 2, unit: null } }] });
assert.equal(units.rows.get(key)?.ingredient, "1000 g chicken thighs");
assert.equal(units.reviews.get(key)?.kind, "units");
// No protein on hand: the list is unchanged.
assert.equal(applyOnHand(rows(2), null).rows.get(key)?.ingredient, "1000 g chicken thighs");

console.log("on-hand: ok");
