// Paleo and Carnivore demo recipes (AI-generated, 2026-11-21; labelled "ai-generated", so every card says so).
// Five per diet so both diets can be suggested before the catalog review. The Paleo set has Asian dishes (a Paleo household
// that likes Asian food gets one first); the Carnivore set has none (its Asian preference falls back to another dish).
// Every recipe is checked here against the same rules the app uses; a failure stops the script.
//   npx tsx script/diet-recipes.ts > data/catalog/diet-recipes-v1.sql     then psql -f that file (idempotent)
import assert from "node:assert/strict";
import { DIET_CHECKS, evaluateDiet, recipeCuisine, type DietPattern } from "../shared/food-rules";
import { inferDeviceRequirements } from "../client/src/lib/device-requirements";

type DietRecipe = { slug: string; title: string; diet: DietPattern; meal: "Dinner" | "Breakfast" | "Lunch"; cuisine: string; protein?: string;
  prep: number; cook: number; ingredients: string[]; steps: string[] };

const recipes: DietRecipe[] = [
  { slug: "paleo-thai-basil-chicken-lettuce-cups", title: "Thai basil chicken lettuce cups", diet: "paleo", meal: "Dinner", cuisine: "Thai", protein: "Chicken", prep: 15, cook: 10,
    ingredients: ["2 tbsp coconut oil", "500 g minced chicken", "3 cloves garlic, finely chopped", "1 red chilli, finely sliced", "3 tbsp coconut aminos",
      "1 lime, juiced", "20 g fresh Thai basil leaves", "2 little gem lettuces, leaves separated", "1 carrot, cut into matchsticks"],
    steps: ["Heat the coconut oil in a large frying pan over a high heat.", "Add the minced chicken and fry for 6–8 minutes, breaking it up, until browned and cooked through to 74°C.",
      "Stir in the garlic and chilli and cook for 1 minute until fragrant.", "Add the coconut aminos and lime juice, bubble for 1 minute, then stir through the basil until it wilts.",
      "Spoon the chicken into the lettuce leaves, top with the carrot and serve straight away."] },
  { slug: "paleo-korean-beef-cauliflower-bowl", title: "Korean-style beef with garlic cauliflower", diet: "paleo", meal: "Dinner", cuisine: "Korean", protein: "Beef", prep: 15, cook: 15,
    ingredients: ["1 cauliflower, coarsely grated", "2 tbsp avocado oil", "400 g beef sirloin, thinly sliced", "2 cloves garlic, grated", "1 thumb fresh ginger, grated",
      "3 tbsp coconut aminos", "1 tsp toasted sesame oil", "4 spring onions, sliced", "1 tbsp sesame seeds"],
    steps: ["Heat 1 tbsp of the avocado oil in a large frying pan over a medium heat and cook the grated cauliflower for 5 minutes until just tender. Tip into bowls.",
      "Wipe out the pan, add the remaining oil and turn the heat to high. Fry the beef in two batches for 2 minutes until browned, then return it all to the pan.",
      "Add the garlic and ginger and fry for 30 seconds, then add the coconut aminos and sesame oil and toss to coat.",
      "Spoon the beef over the cauliflower and scatter with the spring onions and sesame seeds."] },
  { slug: "paleo-lemon-herb-chicken-sweet-potatoes", title: "Lemon and herb chicken with sweet potatoes", diet: "paleo", meal: "Dinner", cuisine: "British", protein: "Chicken", prep: 15, cook: 40,
    ingredients: ["8 bone-in chicken thighs", "600 g sweet potatoes, cut into chunks", "1 red onion, cut into wedges", "3 tbsp olive oil", "1 lemon, zested and juiced",
      "2 tsp dried thyme", "3 cloves garlic, crushed", "1 tsp sea salt", "0.5 tsp black pepper"],
    steps: ["Heat the oven to 200°C (fan 180°C).", "Toss the sweet potatoes and onion with half the olive oil on a large baking tray.",
      "Rub the chicken with the remaining oil, lemon zest, thyme, garlic, salt and pepper, and sit it on the vegetables skin side up.",
      "Roast for 40 minutes until the skin is crisp and the thickest part reaches 74°C with clear juices.", "Squeeze over the lemon juice and serve."] },
  { slug: "paleo-salmon-asparagus-traybake", title: "Salmon and asparagus traybake", diet: "paleo", meal: "Dinner", cuisine: "Mediterranean", protein: "Fish", prep: 10, cook: 18,
    ingredients: ["4 salmon fillets", "300 g asparagus, woody ends snapped off", "250 g cherry tomatoes", "2 tbsp olive oil", "1 lemon, sliced", "1 tsp sea salt", "0.5 tsp black pepper"],
    steps: ["Heat the oven to 200°C (fan 180°C).", "Toss the asparagus and tomatoes with the olive oil, salt and pepper on a baking tray and roast for 8 minutes.",
      "Add the salmon, top each fillet with lemon slices and roast for 10 minutes more until the fish is opaque and flakes easily.", "Serve straight from the tray."] },
  { slug: "paleo-sweet-potato-spinach-hash", title: "Sweet potato and spinach breakfast hash", diet: "paleo", meal: "Breakfast", cuisine: "American", protein: "Eggs", prep: 10, cook: 20,
    ingredients: ["2 tbsp avocado oil", "500 g sweet potatoes, diced small", "1 red pepper, diced", "1 onion, diced", "100 g baby spinach", "4 eggs", "0.5 tsp smoked paprika", "0.5 tsp sea salt"],
    steps: ["Heat the oil in a large frying pan over a medium heat and fry the sweet potatoes for 10 minutes, stirring often, until golden and almost tender.",
      "Add the pepper, onion, paprika and salt and cook for 5 minutes more.", "Stir in the spinach until it wilts, then make four hollows and crack an egg into each.",
      "Cover the pan and cook for 4–5 minutes until the whites are set and the yolks are cooked to your liking."] },

  { slug: "carnivore-pan-seared-ribeye", title: "Pan-seared ribeye with butter", diet: "carnivore", meal: "Dinner", cuisine: "American", protein: "Beef", prep: 5, cook: 12,
    ingredients: ["2 ribeye steaks", "1 tsp flaky salt", "40 g butter"],
    steps: ["Take the steaks out of the fridge 20 minutes before cooking and season both sides with the salt.", "Heat a heavy frying pan over a high heat until very hot.",
      "Sear the steaks for 3 minutes on each side, then add the butter and spoon it over them for 1 minute. They should reach at least 63°C.",
      "Rest the steaks for 5 minutes before slicing and pour over the pan butter."] },
  { slug: "carnivore-crispy-chicken-thighs", title: "Crispy roast chicken thighs", diet: "carnivore", meal: "Dinner", cuisine: "British", protein: "Chicken", prep: 5, cook: 40,
    ingredients: ["8 bone-in chicken thighs, skin on", "1.5 tsp sea salt", "20 g beef dripping"],
    steps: ["Heat the oven to 220°C (fan 200°C).", "Pat the chicken dry and rub with the salt.", "Melt the dripping in a roasting tin in the oven for 3 minutes, add the chicken skin side down, then turn it skin side up.",
      "Roast for 35–40 minutes until the skin is crisp and the thickest part reaches 74°C with clear juices."] },
  { slug: "carnivore-smoked-salmon-scrambled-eggs", title: "Scrambled eggs with smoked salmon", diet: "carnivore", meal: "Breakfast", cuisine: "British", protein: "Fish", prep: 5, cook: 5,
    ingredients: ["8 eggs", "30 g butter", "200 g smoked salmon", "0.5 tsp salt"],
    steps: ["Beat the eggs with the salt in a mixing bowl.", "Melt the butter in a saucepan over a low heat.",
      "Add the eggs and stir slowly for 3–4 minutes until softly set and cooked through.", "Spoon onto plates and drape the smoked salmon alongside."] },
  { slug: "carnivore-beef-patties", title: "Beef patties with cheddar", diet: "carnivore", meal: "Dinner", cuisine: "American", protein: "Beef", prep: 10, cook: 10,
    ingredients: ["600 g beef mince", "1 tsp salt", "4 slices cheddar cheese", "1 tbsp beef dripping"],
    steps: ["Mix the mince with the salt in a mixing bowl and shape into four patties about 2 cm thick.", "Heat the dripping in a large frying pan over a medium-high heat.",
      "Fry the patties for 4–5 minutes on each side until no pink remains and they reach 71°C.", "Lay a cheddar slice on each for the last minute, cover the pan so it melts, and serve."] },
  { slug: "carnivore-lamb-chops", title: "Grilled lamb chops", diet: "carnivore", meal: "Dinner", cuisine: "French", protein: "Lamb", prep: 5, cook: 10,
    ingredients: ["8 lamb chops", "1 tsp sea salt", "20 g butter, melted"],
    steps: ["Heat the grill to high.", "Brush the chops with the melted butter and season with the salt.",
      "Grill on a rack in the oven for 4–5 minutes on each side until they reach at least 63°C, then rest for 3 minutes before serving."] },
];

const tagsOf = (r: DietRecipe) => {
  const lines = r.ingredients.map(l => l.toLowerCase());
  const marks = ["Gluten-free", "Dairy-free"].filter(tag => lines.every(DIET_CHECKS[tag]));
  return [r.meal, r.diet === "paleo" ? "Paleo" : "Carnivore", r.cuisine, ...(r.protein ? [r.protein] : []), ...marks, "ai-generated"];
};
for (const r of recipes) {
  const status = evaluateDiet(r.diet, r.ingredients);
  assert.equal(status.status, "ok", `${r.slug}: ${r.diet} ${status.status} on ${status.lines.join(" | ")}`);
  assert.ok(inferDeviceRequirements(r.steps).length > 0, `${r.slug}: the steps name no cooking device`);
  if (r.diet === "paleo") assert.deepEqual(tagsOf(r).filter(t => t === "Gluten-free" || t === "Dairy-free"), ["Gluten-free", "Dairy-free"], `${r.slug}: paleo is gluten- and dairy-free`);
}
const paleo = recipes.filter(r => r.diet === "paleo"), carnivore = recipes.filter(r => r.diet === "carnivore");
assert.equal(paleo.length, 5); assert.equal(carnivore.length, 5);
const asian = ["Chinese", "Indian", "Japanese", "Korean", "Thai", "Vietnamese"];
assert.ok(paleo.some(r => asian.includes(recipeCuisine(tagsOf(r)) ?? "")), "an Asian Paleo dish");
assert.ok(!carnivore.some(r => asian.includes(recipeCuisine(tagsOf(r)) ?? "")), "no Asian Carnivore dish");

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => `ARRAY[${xs.map(lit).join(", ")}]::text[]`;
console.log(`-- Paleo and Carnivore demo recipes (AI-generated, labelled ai-generated). Generated by script/diet-recipes.ts.
-- Idempotent: inserts missing ids, never updates or deletes.
BEGIN;
INSERT INTO recipes (id, title, ingredients, steps, prep_time, cook_time, servings, tags, language) VALUES
${recipes.map(r => `  (${lit(`tablewise:diet:v1:${r.slug}`)}, ${lit(r.title)}, ${arr(r.ingredients)}, ${arr(r.steps)}, ${r.prep}, ${r.cook}, '4', ${arr(tagsOf(r))}, 'en')`).join(",\n")}
ON CONFLICT (id) DO NOTHING;
COMMIT;
SELECT count(*) AS diet_recipes FROM recipes WHERE id LIKE 'tablewise:diet:v1:%';`);
