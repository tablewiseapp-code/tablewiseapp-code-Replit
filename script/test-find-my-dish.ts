// Find my dish (Home): the handoff's acceptance cases on the pure logic (client/src/lib/find-my-dish.ts).
import assert from "node:assert/strict";
import { defaultSettings, type BasicSettings } from "../client/src/lib/basic-settings";
import { toPlannerRecipes } from "../client/src/lib/planner-recipes";
import { exampleDishes, findMyDish, otherIngredients, searchSettings, type DishSearch } from "../client/src/lib/find-my-dish";

let n = 0;
const recipe = (title: string, ingredients: string[], tags: string[] = ["Dinner"], image: string | null = "x.jpg", steps = ["Cook in a pan on the stovetop."]) =>
  ({ id: `r${++n}-${title}`, title, ingredients, steps, prepTime: 10, cookTime: 20, servings: "4", tags, image } as never);
const catalog = toPlannerRecipes([
  recipe("Chicken and mushroom pie", ["500 g chicken thighs", "200 g mushrooms", "1 onion"]),
  recipe("Lemon chicken", ["4 chicken breasts", "1 lemon", "1 tbsp olive oil"]),
  recipe("Vegetable soup", ["1 l chicken broth", "2 carrots", "1 potato"], ["Lunch"]), // broth only: not a chicken dish
  recipe("Baked salmon", ["4 salmon fillets", "1 lemon"]),
  recipe("Fish stew", ["800 g white fish fillets", "4 tomatoes"]),
  recipe("Beef meatballs", ["500 g minced beef", "1 egg", "2 tomatoes"]),
  recipe("Lentil soup", ["1 cup red lentils", "1 onion"], ["Lunch", "Vegan"]),
  recipe("Shakshuka", ["4 eggs", "4 tomatoes"], ["Breakfast", "Vegetarian"]),
  recipe("Chicken salad", ["2 chicken breasts", "1 lettuce"], ["Lunch"], null, ["Toss everything in a bowl."]), // no device named
  recipe("Chicken lettuce cups", ["2 cooked chicken breasts", "1 lettuce"], ["Lunch"], null, ["Fill the leaves."]),
]);
const ids = (list: { title: string }[]) => list.map(r => r.title);
const at = new Date(2026, 10, 18, 18); // a Wednesday evening: dinners first
const search = (protein: DishSearch["protein"], extra: Partial<DishSearch> = {}): DishSearch => ({ protein, leaveOut: [], diets: [], allergies: [], ...extra });
const fresh = defaultSettings(); // a new household: nothing answered, kitchen unknown

// Chicken, leaving out mushrooms: a chicken main dish without mushrooms. Chicken broth alone is not chicken.
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ key: "chicken" }), at)).slice(0, 2).sort(), ["Chicken and mushroom pie", "Lemon chicken"]);
assert.ok(!ids(findMyDish(catalog, fresh, search({ key: "chicken" }), at)).includes("Vegetable soup"), "chicken broth alone is not chicken");
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ key: "chicken" }, { leaveOut: ["mushrooms"] }), at)).includes("Chicken and mushroom pie"), false);
assert.equal(ids(findMyDish(catalog, fresh, search({ key: "chicken" }, { leaveOut: ["lemon"] }), at)).includes("Lemon chicken"), false, "own Leave out words");
// Fish includes salmon; Salmon needs salmon; own text by name words; nothing for an unsupported protein.
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ key: "fish" }), at)), ["Baked salmon", "Fish stew"]);
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ key: "salmon" }), at)), ["Baked salmon"]);
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ text: "salmon fillets" }), at)), ["Baked salmon"]);
assert.deepEqual(findMyDish(catalog, fresh, search({ text: "kangaroo" }), at), []);
// The egg in meatballs is not their main ingredient; eggs may be breakfast.
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ key: "eggs" }), at)), ["Shakshuka"]);
assert.deepEqual(ids(findMyDish(catalog, fresh, search({ key: "beef" }), at)), ["Beef meatballs"]);
// A household restriction (and a dietary need added for this search) applies to every result.
const fishAllergy: BasicSettings = { ...fresh, dietary: { ...fresh.dietary, allergies: ["fish"] } };
assert.deepEqual(findMyDish(catalog, fishAllergy, search({ key: "fish" }), at), []);
assert.deepEqual(findMyDish(catalog, fresh, search({ key: "fish" }, { allergies: ["fish"] }), at), []);
assert.deepEqual(fresh.dietary.allergies, [], "the search changes no settings");
// Kitchen: unanswered is unknown (no filter); No cooking appliances and Microwave keep the saved answer.
assert.equal(searchSettings(fresh).kitchen.devices?.length, 4);
const none: BasicSettings = { ...fresh, kitchen: { devices: [] } };
const microwave: BasicSettings = { ...fresh, kitchen: { devices: ["Microwave"] } };
assert.deepEqual(findMyDish(catalog, none, search({ key: "chicken" }), at), []);
assert.deepEqual(findMyDish(catalog, microwave, search({ key: "chicken" }), at), []);
assert.ok(ids(findMyDish(catalog, fresh, search({ key: "chicken" }), at)).includes("Chicken salad"));
// The other ingredients: everything but the protein on hand.
const lemon = catalog.find(r => r.title === "Lemon chicken")!;
assert.deepEqual(otherIngredients(lemon).map(i => lemon.ingredients[i]), ["1 lemon", "1 tbsp olive oil"]);

// Home examples: beef, chicken, plant-based, with a photo; a slot ruled out is filled by another dish.
assert.deepEqual(ids(exampleDishes(catalog, fresh, at)), ["Beef meatballs", "Chicken and mushroom pie", "Lentil soup"]);
const vegetarian: BasicSettings = { ...fresh, dietary: { ...fresh.dietary, diets: ["vegetarian"] } };
assert.deepEqual(ids(exampleDishes(catalog, vegetarian, at)), ["Lentil soup"], "fewer than three when the rest are ruled out");
const noBeef: BasicSettings = { ...fresh, dietary: { ...fresh.dietary, customAllergies: ["beef"] } };
assert.deepEqual(ids(exampleDishes(catalog, noBeef, at)), ["Chicken and mushroom pie", "Lentil soup", "Lemon chicken"]);
console.log("find-my-dish: ok");
