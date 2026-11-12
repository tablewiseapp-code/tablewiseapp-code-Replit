// Deterministic ingredient-text rules shared by the catalog build (script/build-recipe-catalog.ts)
// and the household preference engine (client/src/lib/preference-engine.ts). No AI, no network.
// These rules read ingredient wording only; they are not allergen labelling for purchased products.

const PLANT = /plant-based|vegan|dairy-free|egg-free|oat milk|soy(a)? milk|almond milk|coconut (milk|cream|yogurt|yoghurt)|(peanut|almond|cashew|nut|cocoa) butter|butter beans|butternut|cream of tartar/;
const MEAT = /\b(chicken|turkey|beef|steaks?|pork|lamb|bacon|ham|gammon|lardons|sausages?|sausagemeat|chorizo|pepperoni|pancetta|prosciutto|salami|mince|meatballs|duck|veal|venison|bone broth|gelatine|gelatin|lard|suet|anchov\w*|fish|seafood|salmon|cod|tuna|trout|mackerel|haddock|hake|pollock|sea bass|sardines?|kippers?|herring|tilapia|prawns?|shrimps?|crabs?|crawfish|crayfish|lobsters?|scallops?|clams?|oysters?|octopus|mussels|squid|worcestershire|oyster sauce|parmesan|parmigiano|pecorino|grana padano)\b/;
const LAND_MEAT = /\b(chicken|turkey|beef|steaks?|pork|lamb|bacon|ham|gammon|lardons|sausages?|sausagemeat|chorizo|pepperoni|pancetta|prosciutto|salami|mince|meatballs|gelatine|gelatin|lard|suet|duck|veal|venison|bone broth)\b/;
const PORK = /\b(pork|bacon|ham|pancetta|prosciutto|chorizo|salami|lard|gammon)\b/;
const DAIRY = /\b(milk|butter|buttermilk|cream|cheeses?|cheddar|yogh?urts?|kefir|quark|fromage frais|ghee|crème fraîche|creme fraiche|paneer|halloumi|feta|mozzarella|ricotta|mascarpone|parmesan|custard|whey|chocolate)\b/;
const NOT_VEGAN = /\b(eggs?|egg yolks?|egg whites?|honey|mayonnaise|mayo)\b/;
// Plurals and compounds count ("flatbreads", "burger buns", "English muffins", "fettuccine", "chicken broth").
const GLUTEN = /\b(flours?|\w*breads?|breadcrumbs|panko|pasta|spaghetti|penne|linguine|macaroni|lasagne|cannelloni|fusilli|fettuccine|tagliatelle|pappardelle|rigatoni|farfalle|orzo|ravioli|tortellini|conchiglie|orecchiette|noodles|couscous|bulgh?ur|barley|rye|spelt|semolina|wheat|durum|farro|freekeh|oats?|porridge|pastry|filo|phyllo|tortillas?|wraps?|pittas?|pitas?|naans?|bagels?|ciabatta|baguettes?|brioche|focaccia|croissants?|crumpets?|muffins?|buns?|rolls|pretzels?|pizza|dough|crackers?|biscuits?|cookies?|cakes?|sponge|wafers?|beer|malt|soy sauce|teriyaki|hoisin|stock|broth|bouillon|gravy|baking powder|worcestershire|gnocchi|croutons|seitan|sponge fingers|savoiardi|digestives?)\b/;
const GLUTEN_OK = /gluten-free|\b(rice|chickpea|gram|almond|buckwheat|potato|tapioca|coconut) flour\b|cornflour|corn tortillas?|rice noodles|rice paper|rice cakes/;

/** Line-level checks used to verify catalog dietary tags (a line passes when it is compatible). */
export const DIET_CHECKS: Record<string, (line: string) => boolean> = {
  Vegetarian: l => !MEAT.test(l) || /vegetarian|plant-based|vegan/.test(l),
  Vegan: l => (!MEAT.test(l) || /plant-based|vegan/.test(l)) && ((!DAIRY.test(l) && !NOT_VEGAN.test(l)) || PLANT.test(l)),
  "Dairy-free": l => !DAIRY.test(l) || PLANT.test(l),
  "Gluten-free": l => !GLUTEN.test(l) || GLUTEN_OK.test(l),
};

export type RuleStatus = "ok" | "uncertain" | "violates";
type Rule = { contains: (line: string) => boolean; mayContain?: RegExp; safe?: RegExp };
const worst = (a: RuleStatus, b: RuleStatus): RuleStatus => (a === "violates" || b === "violates" ? "violates" : a === "uncertain" || b === "uncertain" ? "uncertain" : "ok");

function evaluate(rule: Rule, ingredients: readonly string[]): { status: RuleStatus; lines: string[] } {
  if (ingredients.length === 0) return { status: "uncertain", lines: [] }; // nothing to check is never "safe"
  let status: RuleStatus = "ok";
  const lines: string[] = [];
  for (const raw of ingredients) {
    const line = raw.toLowerCase();
    const s: RuleStatus = rule.contains(line) ? "violates" : rule.mayContain?.test(line) && !rule.safe?.test(line) ? "uncertain" : "ok";
    if (s !== "ok") lines.push(raw);
    status = worst(status, s);
  }
  return { status, lines };
}

// ---- Dietary patterns (hard restrictions) ----
export const dietPatterns = ["vegetarian", "vegan", "pescatarian", "glutenFree", "dairyFree", "porkFree"] as const;
export type DietPattern = typeof dietPatterns[number];
const notExplicitlySafe = (safe: RegExp) => (re: RegExp) => (l: string) => re.test(l) && !safe.test(l);
const dietRules: Record<DietPattern, Rule> = {
  vegetarian: { contains: l => !DIET_CHECKS.Vegetarian(l), mayContain: /\b(stock|bouillon|curry paste|pesto|caesar|gravy|rennet)\b/ },
  vegan: { contains: l => !DIET_CHECKS.Vegan(l), mayContain: /\b(stock|bouillon|curry paste|pesto|bread|naan|brioche|pastry|biscuits|cake|sugar|wine|gravy|margarine|spread)\b/ },
  pescatarian: { contains: notExplicitlySafe(/vegetarian|plant-based|vegan/)(LAND_MEAT), mayContain: /\b(stock|bouillon|gravy)\b/ },
  glutenFree: { contains: l => !DIET_CHECKS["Gluten-free"](l), mayContain: /\b(sausages?|curry paste|seasoning|chocolate|sauce mix|mustard|(fish|oyster|barbecue|bbq|brown|steak|sweet chill?i|chill?i|curry) sauce|or sauce|ketchup|stock cubes?)\b|\bsauce$/, safe: GLUTEN_OK },
  dairyFree: { contains: l => !DIET_CHECKS["Dairy-free"](l), mayContain: /\b(pesto|margarine|spread|\w*breads?|naans?|brioche|biscuits?|cookies?|pastry|cakes?|muffins?|buns?|rolls|croissants?|sausages?)\b/, safe: PLANT },
  porkFree: { contains: notExplicitlySafe(/vegetarian|plant-based|vegan|turkey|chicken|beef/)(PORK), mayContain: /\b(sausages?|gelatine|gelatin|mince|meatballs)\b/ },
};
export const evaluateDiet = (diet: DietPattern, ingredients: readonly string[]) => evaluate(dietRules[diet], ingredients);

// ---- Allergens (hard restrictions) ----
export const allergens = ["milk", "eggs", "peanuts", "treeNuts", "soy", "gluten", "fish", "shellfish", "sesame", "mustard"] as const;
export type Allergen = typeof allergens[number];
const free = (word: string) => new RegExp(`\\b${word}-free\\b`);
const allergenRules: Record<Allergen, Rule> = {
  milk: { contains: l => !DIET_CHECKS["Dairy-free"](l), mayContain: /\b(pesto|margarine|spread|\w*breads?|naans?|brioche|biscuits?|cookies?|pastry|cakes?|muffins?|buns?|rolls|croissants?|sausages?|caramel|toffee)\b/, safe: PLANT },
  eggs: { contains: notExplicitlySafe(free("egg"))(/\b(eggs?|egg yolks?|egg whites?|mayonnaise|mayo|meringues?|aioli|hollandaise)\b/),
    mayContain: /\b(fresh pasta|egg noodles|lasagne sheets|pastry|brioche|buns?|rolls|cakes?|biscuits?|batter|sausages?)\b/, safe: /\begg-free\b|plant-based|vegan/ },
  peanuts: { contains: notExplicitlySafe(free("peanut"))(/\b(peanuts?|groundnuts?|satay)\b/), mayContain: /\b(mixed nuts|nuts|chocolate|granola|cereal bars?|curry paste|biscuits)\b/ },
  treeNuts: { contains: notExplicitlySafe(free("nut"))(/\b(almonds?|walnuts?|cashews?|pecans?|hazelnuts?|pistachios?|macadamias?|brazil nuts?|pine nuts|praline|marzipan|frangipane)\b/),
    mayContain: /\b(mixed nuts|nuts|pesto|granola|muesli|chocolate|nougat|biscuits|cereal)\b/ },
  soy: { contains: notExplicitlySafe(free("soy"))(/\b(soy|soya|tofu|edamame|tempeh|miso|tamari|teriyaki|hoisin)\b/), mayContain: /\b(chocolate|stock cubes?|bouillon|sausages?|plant-based|margarine|spread|bread)\b/ },
  gluten: { contains: l => !DIET_CHECKS["Gluten-free"](l), mayContain: /\b(sausages?|curry paste|seasoning|chocolate|sauce mix|mustard|(fish|oyster|barbecue|bbq|brown|steak|sweet chill?i|chill?i|curry) sauce|or sauce|ketchup|stock cubes?)\b|\bsauce$/, safe: GLUTEN_OK },
  fish: { contains: notExplicitlySafe(/vegetarian|vegan|plant-based/)(/\b(fish|salmon|cod|tuna|trout|mackerel|haddock|hake|plaice|sole|herring|kippers?|tilapia|catfish|swordfish|sardines?|pilchards?|anchov\w*|pollock|sea bass|worcestershire)\b/),
    mayContain: /\b(caesar|curry paste|stock|bouillon)\b/ },
  shellfish: { contains: notExplicitlySafe(/vegetarian|vegan|plant-based/)(/\b(prawns?|shrimps?|crabs?|crawfish|crayfish|langoustines?|lobsters?|mussels|clams?|oysters?|scallops?|squid|calamari|octopus|oyster sauce|shrimp paste)\b/),
    mayContain: /\b(curry paste|fish sauce|seafood|stock|broth|bouillon)\b/ },
  sesame: { contains: notExplicitlySafe(free("sesame"))(/\b(sesame|tahini|hummus|houmous|halva|za'?atar|furikake)\b/), mayContain: /\b(bread|buns?|bagels?|crackers|pitta|pita|naan|dukkah|curry paste)\b/ },
  mustard: { contains: notExplicitlySafe(free("mustard"))(/\b(mustard|dijon)\b/), mayContain: /\b(mayonnaise|mayo|dressing|curry powder|ketchup|piccalilli|relish|seasoning)\b/ },
};
export const evaluateAllergen = (allergen: Allergen, ingredients: readonly string[]) => evaluate(allergenRules[allergen], ingredients);

/** Meat, poultry or seafood, from every ingredient line (eggs and dairy don't count). "violates" = contains it;
 * "uncertain" = can't tell (e.g. stock, curry paste, no ingredient lines); "ok" = meatless.
 * ponytail: gelatine/lard/worcestershire count as meat, add a separate "animal by-product" status if that matters. */
export function evaluateMeat(ingredients: readonly string[]): RuleStatus {
  return [evaluateDiet("pescatarian", ingredients), evaluateAllergen("fish", ingredients), evaluateAllergen("shellfish", ingredients)]
    .reduce<RuleStatus>((a, b) => worst(a, b.status), "ok");
}

/** A person's own ingredient term (custom allergy/dislike/favourite). Name match only: absence is not proof. */
export function termPattern(term: string): RegExp | null {
  const words = term.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  // Simple English plural/singular tolerance: tomato ↔ tomatoes, berry ↔ berries, mushroom ↔ mushrooms.
  const stem = (w: string) => w.replace(/(ies|es|s)$/, "");
  const escaped = words.map(w => stem(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w{0,3}");
  return new RegExp(`(^|[^\\p{L}])${escaped.join("\\s+")}($|[^\\p{L}])`, "u");
}
export const mentionsTerm = (term: string, ingredients: readonly string[]) => {
  const re = termPattern(term);
  return !!re && ingredients.some(line => re.test(line.toLowerCase()));
};

// ---- Structured ingredient preferences (dislikes / favourites) ----
export const ingredientPrefs = {
  mushrooms: /\bmushrooms?\b/, onions: /\b(onions?|shallots?|spring onions?)\b/, garlic: /\bgarlic\b/, coriander: /\b(coriander|cilantro)\b/,
  olives: /\bolives?\b/, tomatoes: /\btomato(es)?\b/, peppers: /\b(bell )?peppers?\b/, chilli: /\b(chill?ies|chill?i|chili|jalapeños?|jalapenos?|cayenne|sriracha|hot sauce)\b/,
  aubergine: /\b(aubergines?|eggplants?)\b/, courgette: /\b(courgettes?|zucchini)\b/, broccoli: /\bbroccoli\b/, spinach: /\bspinach\b/,
  beans: /\b(beans?|lentils|chickpeas)\b/, fish: /\b(fish|salmon|cod|tuna|trout|mackerel|haddock|sardines?)\b/, seafood: /\b(prawns?|shrimps?|mussels|squid|crab)\b/,
  chicken: /\bchicken\b(?! stock)/, beef: /\b(beef|steak)\b(?! stock)/, pork: PORK, cheese: /\b(cheese|cheddar|feta|mozzarella|halloumi|parmesan|ricotta)\b/,
  eggs: /\beggs?\b/, avocado: /\bavocados?\b/, coconut: /\bcoconut\b/, potatoes: /\bpotato(es)?\b/, rice: /\brice\b/, pasta: /\b(pasta|spaghetti|penne|linguine|macaroni|fusilli)\b/,
} as const;
export type IngredientPref = keyof typeof ingredientPrefs;
export const ingredientPrefIds = Object.keys(ingredientPrefs) as IngredientPref[];
export const mentionsIngredientPref = (id: IngredientPref, ingredients: readonly string[]) =>
  ingredients.some(line => ingredientPrefs[id].test(line.toLowerCase()));

// ---- Dishes and food types (likes / dislikes). Matched against the recipe's title and tags, never its ingredient
// lines: "muffins" is a kind of dish, not an ingredient, and "chocolate chips" must not look like chips. ----
export const dishPrefs = {
  muffins: /\bmuffins?\b/, pancakes: /\b(pancakes?|crêpes?|crepes?|blini|fritters?)\b/, waffles: /\bwaffles?\b/,
  porridge: /\b(porridge|oatmeal|overnight oats|oats)\b/, omelette: /\b(omelettes?|omelets?|frittatas?|scrambled eggs?|shakshuka)\b/,
  toast: /\b(toasts?|toasties?)\b/, sandwiches: /\b(sandwich(es)?|wraps?|pittas?|pitas?|bagels?)\b/, salad: /\b(salads?|slaw)\b/,
  soup: /\b(soups?|broth|chowder)\b/, pizza: /\b(pizzas?|flatbreads?)\b/, burgers: /\bburgers?\b/,
  tacos: /\b(tacos?|burritos?|quesadillas?|fajitas?|enchiladas?)\b/, noodles: /\b(noodles?|ramen|pad thai|stir[- ]fry)\b/,
  curry: /\b(curry|curries|tikka|masala|korma|dal|dhal)\b/, stew: /\b(stews?|casseroles?|tagine|chilli con carne|goulash)\b/,
  pie: /\b(pies?|bakes?|lasagne|lasagna|moussaka|gratin)\b/, cake: /\b(cakes?|brownies?|cookies?|biscuits?|traybakes?)\b/,
  smoothie: /\b(smoothies?|shakes?)\b/,
} as const;
export type DishPref = keyof typeof dishPrefs;
export const dishPrefIds = Object.keys(dishPrefs) as DishPref[];
/** Every structured food preference: dishes first (they are what children ask for), then ingredients. */
export const foodPrefIds = [...dishPrefIds, ...ingredientPrefIds];
type MatchableRecipe = { title?: string | null; tags?: readonly string[] | null; ingredients: readonly string[] };
const dishText = (r: MatchableRecipe) => [r.title ?? "", ...(r.tags ?? [])].join(" · ").toLowerCase();
/** A structured id or "custom:<text>" against a recipe. A dish matches by title/tags; an ingredient by ingredient lines;
 * free text by either (the person may have typed "blueberry muffins" or "strawberries"). */
export function matchesFoodPref(choice: string, recipe: MatchableRecipe): boolean {
  if (choice.startsWith("custom:")) {
    const re = termPattern(choice.slice(7));
    return !!re && (re.test(dishText(recipe)) || recipe.ingredients.some(line => re.test(line.toLowerCase())));
  }
  if (choice in dishPrefs) return dishPrefs[choice as DishPref].test(dishText(recipe));
  return choice in ingredientPrefs && mentionsIngredientPref(choice as IngredientPref, recipe.ingredients);
}

// ---- Cuisines (catalog vocabulary; recipes carry them as tags) ----
export const cuisines = ["American", "British", "Caribbean", "Chinese", "French", "Greek", "Indian", "Italian", "Japanese", "Korean",
  "Mediterranean", "Mexican", "Middle Eastern", "North African", "Scandinavian", "Spanish", "Thai", "Vietnamese", "Eastern European"] as const;
export type Cuisine = typeof cuisines[number];
export const recipeCuisine = (tags: readonly string[] | null | undefined): Cuisine | null =>
  (tags ?? []).find((t): t is Cuisine => (cuisines as readonly string[]).includes(t)) ?? null;
