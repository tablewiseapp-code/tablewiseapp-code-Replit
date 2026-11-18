import assert from "node:assert/strict";
import { ingredientPartSchema, parseIngredientLine, parseIngredients } from "../shared/ingredient-parse";
import { scaleIngredient } from "../client/src/lib/ingredient-scale";

// Acceptance table from the manual import brief: input → preview text.
for (const [input, display] of [
  ["2Kg flour", "2 kg flour"], ["250gr butter", "250 g butter"], ["500ml milk", "500 mL milk"],
  ["1.5L water", "1.5 L water"], ["2.5 cups of white sugar", "2.5 cups white sugar"],
  ["1 ½ cups milk", "1½ cups milk"], ["1/2 teaspoon salt", "½ tsp salt"], ["4 fl oz apple juice", "4 fl oz apple juice"],
  ["3 cloves of garlic", "3 cloves garlic"], ["2 eggs", "2 eggs"], ["salt to taste", "salt to taste"],
  ["a handful of parsley", "a handful of parsley"], ["2Kg", "2 kg"],
]) assert.equal(parseIngredientLine(input).display, display, input);

// Stored parts: the original text, a numeric quantity and a canonical unit.
assert.deepEqual(parseIngredientLine(" 1 1/2 Tablespoons olive oil "), { originalText: "1 1/2 Tablespoons olive oil", quantity: 1.5, unit: "tbsp", ingredient: "olive oil", display: "1½ tbsp olive oil" });
assert.deepEqual(parseIngredientLine("2Kg"), { originalText: "2Kg", quantity: 2, unit: "kg", ingredient: "", display: "2 kg" });
assert.deepEqual(parseIngredientLine("2 eggs"), { originalText: "2 eggs", quantity: 2, unit: null, ingredient: "eggs", display: "2 eggs" });
assert.deepEqual(parseIngredientLine("salt to taste"), { originalText: "salt to taste", quantity: null, unit: null, ingredient: "salt to taste", display: "salt to taste" });

// Quantities: whole, decimal, fraction, Unicode fraction, mixed numbers.
for (const [input, quantity] of [["2 g", 2], ["2.5 g", 2.5], ["1/2 g", 0.5], ["½ g", 0.5], ["1 1/2 g", 1.5], ["1 ½ g", 1.5], ["1½ g", 1.5], ["1,5 kg", 1.5]] as const) {
  assert.equal(parseIngredientLine(input).quantity, quantity, input);
}
// Units: case-insensitive, with or without a space, longest spelling first, singular/plural/spelled out.
for (const [input, unit] of [
  ["100G sugar", "g"], ["100 grams sugar", "g"], ["1 kilogram rice", "kg"], ["3 OZ cheese", "oz"], ["2 lbs beef", "lb"],
  ["1 pound beef", "lb"], ["200 ML cream", "ml"], ["1 litre stock", "l"], ["1 cup rice", "cup"], ["2 tsp. salt", "tsp"],
  ["1 tbs oil", "tbsp"], ["4fl oz juice", "fl oz"], ["8 fluid ounces milk", "fl oz"], ["3 oz ham", "oz"],
  ["2 pieces chicken", "piece"], ["1 clove garlic", "clove"], ["4 slices bread", "slice"],
] as const) assert.equal(parseIngredientLine(input).unit, unit, input);
assert.equal(parseIngredientLine("4 Tbls Maple Syrup").display, "4 tbsp Maple Syrup");
assert.equal(parseIngredientLine("1 cup rice").display, "1 cup rice");
assert.equal(parseIngredientLine("½ cup rice").display, "½ cup rice");
assert.equal(parseIngredientLine("2 lbs beef").display, "2 lb beef");

// Words that start like a unit are not units.
for (const input of ["2 large eggs", "2 lemons", "2 garlic cloves, minced", "3 tomatoes"]) {
  assert.equal(parseIngredientLine(input).unit, null, input);
  assert.equal(parseIngredientLine(input).display, input, input);
}
// Unclear lines keep their text exactly; uncertain quantities are not stored.
for (const input of ["2 scoops protein powder", "2-3 eggs", "2 to 3 eggs", "1 x 400 g tin tomatoes", "7up", "1,000 g flour", "Salt and pepper, to taste"]) {
  assert.equal(parseIngredientLine(input).display, input, input);
}
assert.equal(parseIngredientLine("2-3 eggs").quantity, null);
assert.equal(parseIngredientLine("1 x 400 g tin tomatoes").quantity, null);
assert.equal(parseIngredientLine("2 scoops protein powder").quantity, 2); // a count of an unknown unit

// Lines: order kept, empty lines ignored; every part passes the server schema.
const list = parseIngredients("2 eggs\n\n   \nsalt to taste\n500ml milk\n");
assert.deepEqual(list.map(item => item.display), ["2 eggs", "salt to taste", "500 mL milk"]);
for (const { display, ...part } of list) assert.equal(ingredientPartSchema.safeParse(part).success, true, display);

// Shown text still scales with the existing serving scaler.
assert.equal(scaleIngredient(parseIngredientLine("1 ½ cups milk").display, 2), "3 cups milk");
assert.equal(scaleIngredient(parseIngredientLine("1/2 teaspoon salt").display, 2), "1 tsp salt");
console.log("PASS ingredient parsing: acceptance table, quantities, units, unclear lines kept as written, schema, scaling");
