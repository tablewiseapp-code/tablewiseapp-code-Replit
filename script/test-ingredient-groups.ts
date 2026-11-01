import assert from "node:assert/strict";
import { groupIngredients, ingredientGroup } from "../client/src/lib/ingredient-groups";

const ingredients = [
  "400 g fusilli pasta", "100 g frozen peas", "50 g butter",
  "50 g plain flour", "600 ml milk", "2 x 160 g tins tuna",
];
const groups = groupIngredients(ingredients);
assert.deepEqual(groups.map(group => group.category), ["protein", "carbs", "vegetables", "dairy", "fats"]);
assert.deepEqual(groups.find(group => group.category === "carbs")!.ingredients,
  ["400 g fusilli pasta", "50 g plain flour"]);
assert.deepEqual(groups.flatMap(group => group.ingredients).sort(), [...ingredients].sort());
for (const [text, category] of [
  ["chicken stock", "seasonings"], ["fish sauce", "seasonings"],
  ["chicken breast seasoned with salt", "protein"], ["butter beans", "protein"],
  ["almond milk", "dairy"], ["almonds", "fats"],
  ["corn flour", "carbs"], ["sweet potato", "carbs"],
  ["fresh parsley", "seasonings"], ["unrecognized ingredient", "other"],
  ["1 red pepper", "vegetables"], ["Greek yoghurt", "dairy"],
] as const) assert.equal(ingredientGroup(text), category, text);
assert.deepEqual(groupIngredients([]), []);
assert.deepEqual(groupIngredients(["50 g butter", "50 g butter"]),
  [{ category: "fats", ingredients: ["50 g butter", "50 g butter"] }]);
console.log("PASS ingredient groups: protein/carbs and other food types; all ingredients and exact wording preserved; compound names, uncertain items and duplicates handled.");
