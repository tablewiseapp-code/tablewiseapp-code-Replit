// Grocery list redesign: aisles, item text, sample prices, per-list quantity edits and removals.
import assert from "node:assert/strict";
import { categorizeIngredient } from "../client/src/lib/grocery-categories";
import { buildShoppingList, quantityOf, samplePrice, shoppingKey, splitPreparation, withQuantity } from "../client/src/lib/grocery-items";
import { groceryMeasure } from "../client/src/lib/grocery-meal-removal";

for (const [item, aisle] of [
  ["bananas", "Produce"], ["potatoes", "Produce"], ["pork mince", "Meat & Poultry"], ["ground cinnamon", "Spices & Seasonings"],
  ["milk", "Dairy & Eggs"], ["gluten-free vegetable stock", "Canned & Jarred"], ["chicken stock", "Canned & Jarred"],
  ["bell pepper", "Produce"], ["black pepper", "Spices & Seasonings"], ["garlic powder", "Spices & Seasonings"],
  ["peanut butter", "Canned & Jarred"], ["egg noodles", "Grains & Pasta"], ["chickpeas", "Canned & Jarred"], ["paper towels", "Other"],
] as const) assert.equal(categorizeIngredient(item), aisle, item);

assert.deepEqual(splitPreparation("potatoes, peeled and diced"), { product: "potatoes", preparation: "peeled and diced" });
assert.deepEqual(splitPreparation("gluten-free vegetable stock"), { product: "gluten-free vegetable stock", preparation: "" });
assert.equal(quantityOf("500 g pork mince"), "500 g");
assert.equal(quantityOf("salt to taste"), "");
assert.equal(withQuantity("500 g pork mince", "1 kg"), "1 kg pork mince");

const price = samplePrice("500 g pork mince");
assert.ok(price !== null && price > 0 && price === samplePrice("500 g pork mince"), "sample price is stable");
assert.ok(samplePrice("1000 g pork mince", "500 g pork mince")! > price!, "price follows the quantity");
assert.equal(samplePrice("2 cup pork mince", "500 g pork mince"), null, "another unit has no estimate");
assert.equal(samplePrice("salt to taste"), null, "no quantity, no price");
assert.equal(samplePrice("2 apples", "2 apples", { priceCents: 199, priceText: "2 apples" }), 199, "a saved price wins");

const mince = groceryMeasure("500 g pork mince").identity;
const rows = new Map([[mince, { ingredient: "500 g pork mince", recipes: ["Ragù"], proteinRecipes: new Set<string>() }]]);
const edited = buildShoppingList(rows, [], new Set(), new Set(), new Map([[mince, "750 g"]]));
assert.equal(edited.activeRows[0].ingredient, "750 g pork mince", "quantity edit applies to the list");
assert.equal(rows.get(mince)!.ingredient, "500 g pork mince", "the recipe row is unchanged");
const removed = buildShoppingList(rows, [], new Set(["200 g pork mince"]), new Set([mince]));
assert.equal(removed.activeRows.length, 0);
assert.equal(removed.purchasedRows.length, 0, "a removed item is never shown as bought");
assert.equal(shoppingKey("2026-11-16", mince), `2026-11-16|${mince}`);
assert.equal(shoppingKey("2026-11-16", "extra:abc"), "extra:abc");

const milk = buildShoppingList(new Map(), [{ id: "m1", text: "2 L milk" }], new Set(), new Set());
assert.equal(milk.activeRows[0].extraId, "m1");
assert.equal(categorizeIngredient("milk"), "Dairy & Eggs");
console.log("Grocery list aisles, prices, edits and removals passed.");
