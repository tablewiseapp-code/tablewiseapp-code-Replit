// My Basic Settings: persistence/migration, device AND/OR requirements, household restrictions, ranking, week filling.
// Pure checks, no browser or database. Run: npx tsx script/test-basic-settings.ts   (UI: script/test-basic-settings-browser.mjs)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultSettings, emptyMember, householdServings, loadSettings, methodChoices, availableDevices, sanitizeSettings, settingsKey, updateSettings,
  type BasicSettings } from "../client/src/lib/basic-settings";
import { inferDeviceRequirements, satisfiesDevices, deviceRequirementsOf } from "../client/src/lib/device-requirements";
import { checkEligibility, fillWeek, personalize, rankRecipe, suggestReplacement, type EngineRecipe } from "../client/src/lib/preference-engine";
import { toPlannerRecipes } from "../client/src/lib/planner-recipes";
import { matchesPlannerFilters } from "../client/src/lib/planner-filters";
import { evaluateAllergen } from "../shared/food-rules";
import { activePreferenceChips, limitingReasons, matchCounts } from "../client/src/lib/active-preferences";
import { evaluateDiet } from "../shared/food-rules";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`PASS ${name}`); };
const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }, failing: false };
};
const recipe = (patch: Partial<EngineRecipe> & { steps?: string[] }): EngineRecipe => ({
  id: patch.id ?? "r", title: patch.title ?? "Recipe", ingredients: patch.ingredients ?? ["400 g potatoes"], tags: patch.tags ?? ["Dinner"],
  mealType: patch.mealType ?? "Dinner", prepTime: patch.prepTime ?? 10, cookTime: patch.cookTime ?? 20,
  deviceRequirements: patch.deviceRequirements ?? inferDeviceRequirements(patch.steps ?? []), equipment: patch.equipment, proteinType: patch.proteinType,
});
const withSettings = (patch: (s: BasicSettings) => BasicSettings) => patch(defaultSettings());

// ---------- Persistence ----------
test("unconfigured devices default to every device; an explicit empty selection is preserved", () => {
  const store = memory();
  assert.equal(loadSettings(store).kitchen.devices, null);
  assert.deepEqual(availableDevices(loadSettings(store)), ["Oven", "Air fryer", "Stovetop", "Microwave"]);
  updateSettings(s => ({ ...s, kitchen: { devices: [] } }), store);
  assert.deepEqual(loadSettings(store).kitchen.devices, []);
  assert.deepEqual(availableDevices(loadSettings(store)), []);
  assert.deepEqual(methodChoices([]), ["No-cook"]);
});
test("v1 device settings migrate without loss (including an empty list); corrupt data falls back safely", () => {
  assert.deepEqual(loadSettings(memory({ [settingsKey]: JSON.stringify({ devices: ["Stovetop", "Microwave", "Toaster"] }) })).kitchen.devices, ["Stovetop", "Microwave"]);
  assert.deepEqual(loadSettings(memory({ [settingsKey]: JSON.stringify({ devices: [] }) })).kitchen.devices, []);
  assert.deepEqual(loadSettings(memory({ [settingsKey]: "{not json" })), defaultSettings());
  const partial = sanitizeSettings({ version: 2, dietary: { allergies: ["milk", "unicorn"] }, planning: { cookingDays: 99 } });
  assert.deepEqual(partial.dietary.allergies, ["milk"]);
  assert.equal(partial.planning.cookingDays, 7);
});
test("settings survive a reload and each write merges onto the latest stored copy (two tabs)", () => {
  const store = memory();
  updateSettings(s => ({ ...s, cooking: { ...s.cooking, weekday: { ...s.cooking.weekday, quick: true } } }), store);              // tab A
  updateSettings(s => ({ ...s, shopping: { ...s.shopping, pantry: ["rice"] } }), store);      // tab B, after A
  const reloaded = loadSettings(store);
  assert.equal(reloaded.cooking.weekday.quick, true);
  assert.deepEqual(reloaded.shopping.pantry, ["rice"]);
  assert.equal(reloaded.rev, 2);
});
test("weekday and weekend preferences are stored separately; an older shared set seeds both", () => {
  const old = sanitizeSettings({ version: 2, cooking: { weekdayMax: 30, quick: true, onePot: true } });
  assert.deepEqual(old.cooking.weekday, { quick: true, minimalCleanup: false, onePot: true, batch: false });
  assert.deepEqual(old.cooking.weekend, old.cooking.weekday);
  const split = sanitizeSettings({ version: 2, cooking: { weekday: { quick: true }, weekend: { batch: true } } });
  assert.equal(split.cooking.weekday.quick && !split.cooking.weekday.batch, true);
  assert.equal(split.cooking.weekend.batch && !split.cooking.weekend.quick, true);
});
test("a failed write throws and leaves stored settings unchanged (the page shows Unable to save — Retry)", () => {
  const store = memory();
  updateSettings(s => ({ ...s, cooking: { ...s.cooking, weekday: { ...s.cooking.weekday, quick: true } } }), store);
  const before = store.data[settingsKey];
  const broken = { getItem: store.getItem, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.throws(() => updateSettings(s => ({ ...s, cooking: { ...s.cooking, weekday: { ...s.cooking.weekday, batch: true } } }), broken));
  assert.equal(store.data[settingsKey], before);
});
test("household members have stable ids and can be added, edited and removed", () => {
  const store = memory();
  const a = emptyMember("adult", "Dana"), b = emptyMember("child", "Leo");
  updateSettings(s => ({ ...s, household: { ...s.household, members: [a, b] } }), store);
  updateSettings(s => ({ ...s, household: { ...s.household, members: s.household.members.map(m => m.id === b.id ? { ...m, allergies: ["milk"] } : m) } }), store);
  let saved = loadSettings(store).household.members;
  assert.deepEqual(saved.map(m => m.id), [a.id, b.id]);
  assert.deepEqual(saved[1].allergies, ["milk"]);
  updateSettings(s => ({ ...s, household: { ...s.household, members: s.household.members.filter(m => m.id !== a.id) } }), store);
  saved = loadSettings(store).household.members;
  assert.deepEqual(saved.map(m => m.name), ["Leo"]);
  assert.notEqual(a.id, b.id);
});
test("household servings: automatic from members and portion sizes, or fixed", () => {
  const s = withSettings(s => ({ ...s, household: { ...s.household, members: [emptyMember("adult", "A"), { ...emptyMember("adult", "B"), portion: "large" }, emptyMember("child", "C")] } }));
  assert.equal(householdServings(defaultSettings()), null);
  assert.equal(householdServings(s), 4); // 1 + 1.5 + 1 → 3.5 → 4
  assert.equal(householdServings({ ...s, household: { ...s.household, servingsMode: "fixed", fixedServings: 6 } }), 6);
});

// ---------- Device requirements ----------
const ovenOrAir = ["Heat the oven to 200°C or the air fryer to 180°C.", "Cook the wedges for 20 minutes until crisp."];
const ovenAndStove = ["Heat the oven to 180°C.", "Fry the onion in a frying pan over medium heat for 5 minutes.", "Bake for 25 minutes."];
const combined = ["Fry the chicken in a pan over medium-high heat until it reaches 74°C.", "Roast the potatoes in the oven or air fryer until golden."];
test("Oven OR Air fryer works with either device", () => {
  const req = inferDeviceRequirements(ovenOrAir);
  assert.deepEqual(req, [["Oven", "Air fryer"]]);
  assert.ok(satisfiesDevices(req, ["Oven"]) && satisfiesDevices(req, ["Air fryer"]) && !satisfiesDevices(req, ["Stovetop", "Microwave"]));
});
test("Oven AND Stovetop requires both", () => {
  const req = inferDeviceRequirements(ovenAndStove);
  assert.deepEqual(req, [["Oven"], ["Stovetop"]]);
  assert.ok(satisfiesDevices(req, ["Oven", "Stovetop"]) && !satisfiesDevices(req, ["Oven"]) && !satisfiesDevices(req, ["Stovetop"]));
});
test("(Oven OR Air fryer) AND Stovetop evaluates correctly", () => {
  const req = inferDeviceRequirements(combined);
  assert.deepEqual(req, [["Stovetop"], ["Oven", "Air fryer"]]);
  assert.ok(satisfiesDevices(req, ["Stovetop", "Air fryer"]) && satisfiesDevices(req, ["Stovetop", "Oven"]));
  assert.ok(!satisfiesDevices(req, ["Oven", "Air fryer"]) && !satisfiesDevices(req, ["Stovetop", "Microwave"]));
});
test("no-cook recipes need nothing; incidental and optional mentions are not requirements", () => {
  assert.deepEqual(inferDeviceRequirements(["Mix the oats and milk in a jar.", "Chill overnight. Leftovers keep in the fridge; reheat in the microwave if you like."]), []);
  assert.deepEqual(inferDeviceRequirements(["Pour boiling water over the couscous and cover for 5 minutes."]), []);
  assert.deepEqual(inferDeviceRequirements(["Line a baking tray with baking paper.", "Chill the bark until firm."]), []);
  assert.deepEqual(inferDeviceRequirements(["Bake in the oven for 20 minutes.", "Alternatively, air fry at 180°C for 12 minutes."]), [["Oven", "Air fryer"]]);
  assert.ok(satisfiesDevices([], []));
});
test("a required device stays required when it is also offered as an alternative elsewhere (conservative)", () => {
  const req = inferDeviceRequirements(["Fry the chicken in a frying pan until it reaches 74°C.", "Warm the tortillas in a dry frying pan or the microwave."]);
  assert.deepEqual(req, [["Stovetop"]]);
});
test("explicit recipe metadata overrides inference", () => {
  assert.deepEqual(deviceRequirementsOf({ steps: ovenAndStove, deviceRequirements: [["Air fryer"]] }), [["Air fryer"]]);
});

// ---------- Household restrictions & ranking ----------
const dana = { ...emptyMember("adult", "Dana"), diets: ["glutenFree" as const] };
const leo = { ...emptyMember("child", "Leo"), allergies: ["milk" as const], dislikes: ["mushrooms"] };
const family = withSettings(s => ({ ...s, household: { ...s.household, members: [emptyMember("adult", "Parent"), dana, leo] } }));
test("shared meals respect every member's hard restrictions; member-specific ones name the member", () => {
  const pasta = recipe({ ingredients: ["400 g dried pasta", "200 ml double cream", "1 onion"] });
  const result = checkEligibility(pasta, family);
  assert.equal(result.eligible, false);
  const kinds = result.reasons.map(r => r.kind === "diet" ? `${r.diet}:${r.members}` : r.kind === "allergy" ? `${r.allergen}:${r.members}` : r.kind);
  assert.deepEqual(kinds.sort(), [`glutenFree:${dana.id}`, `milk:${leo.id}`].sort());
  const safe = recipe({ ingredients: ["400 g potatoes", "2 tbsp olive oil", "1 tsp salt"] });
  assert.equal(checkEligibility(safe, family).eligible, true);
  // Planning for Dana only: Leo's milk allergy no longer applies.
  const forDana = checkEligibility(recipe({ ingredients: ["400 g potatoes", "100 g cheddar cheese"] }), family, [dana.id]);
  assert.equal(forDana.eligible, true);
});
test("unknown or ambiguous allergen information is never treated as safe", () => {
  assert.equal(evaluateAllergen("milk", ["200 g dark chocolate"]).status, "violates"); // chocolate counts as dairy unless dairy-free
  assert.equal(evaluateAllergen("milk", ["2 tbsp basil pesto"]).status, "uncertain");
  assert.equal(evaluateAllergen("milk", ["150 g dairy-free dark chocolate"]).status, "ok");
  assert.equal(evaluateAllergen("peanuts", []).status, "uncertain");
  const settings = withSettings(s => ({ ...s, dietary: { ...s.dietary, allergies: ["milk"] } }));
  const pesto = checkEligibility(recipe({ ingredients: ["2 tbsp basil pesto", "400 g potatoes"] }), settings);
  assert.equal(pesto.eligible, false);
  assert.equal(pesto.reasons[0].kind === "allergy" && pesto.reasons[0].status, "uncertain");
  const custom = withSettings(s => ({ ...s, dietary: { ...s.dietary, customAllergies: ["kiwi"] } }));
  assert.equal(checkEligibility(recipe({ ingredients: ["2 kiwis, sliced"] }), custom).eligible, false);
});
test("disliked ingredients lower the ranking but never hide a recipe", () => {
  const withMushrooms = recipe({ id: "m", ingredients: ["250 g mushrooms", "400 g potatoes"] });
  const plain = recipe({ id: "p", ingredients: ["400 g potatoes", "1 tbsp olive oil"] });
  assert.equal(checkEligibility(withMushrooms, family).eligible, true);
  assert.ok(rankRecipe(withMushrooms, family).score < rankRecipe(plain, family).score);
  assert.deepEqual(personalize([withMushrooms, plain], family).eligible.map(e => e.recipe.id), ["p", "m"]);
});
test("a soft time limit only lowers ranking; a hard maximum excludes", () => {
  const long = recipe({ prepTime: 30, cookTime: 90 });
  const soft = withSettings(s => ({ ...s, cooking: { ...s.cooking, weekdayMax: 30, weekendMax: 60 } }));
  assert.equal(checkEligibility(long, soft).eligible, true);
  assert.ok(rankRecipe(long, soft).concerns.includes("overTime"));
  assert.equal(checkEligibility(long, { ...soft, cooking: { ...soft.cooking, hardMax: true } }).eligible, false);
});
test("each day type ranks with its own preferences (list = weekday; Fill my week = that day's set)", () => {
  const quickOne = recipe({ id: "quick", prepTime: 5, cookTime: 15, steps: ["Simmer in a saucepan for 15 minutes."] });
  const batchOne = recipe({ id: "batch", prepTime: 20, cookTime: 70, tags: ["Dinner", "Batch cooking"], steps: ["Simmer in a saucepan for an hour."] });
  const s = withSettings(s => ({ ...s, cooking: { ...s.cooking, weekday: { ...s.cooking.weekday, quick: true }, weekend: { ...s.cooking.weekend, batch: true } } }));
  assert.ok(rankRecipe(quickOne, s).score > rankRecipe(batchOne, s).score, "list uses weekday preferences");
  assert.ok(rankRecipe(batchOne, s, { day: "weekend" }).score > rankRecipe(quickOne, s, { day: "weekend" }).score);
  const plan = fillWeek({ selectedIds: ["quick", "batch"], planAssignments: [] }, [quickOne, batchOne],
    { ...s, planning: { ...s.planning, meals: ["Dinner"], cookingDays: 7 } });
  const byDay = Object.fromEntries(plan.plan.planAssignments.map(a => [a.startDay, a.recipeId]));
  assert.equal(byDay[0], "batch", "Sunday (weekend) gets the batch recipe");
  assert.equal(byDay[1], "quick", "Monday (weekday) gets the quick recipe");
});
test("an incompatible selected recipe gets a compatible replacement of the same meal type", () => {
  const oven = recipe({ id: "oven", steps: ["Bake in the oven for 30 minutes."] });
  const hob = recipe({ id: "hob", steps: ["Simmer in a saucepan for 20 minutes."] });
  const breakfast = recipe({ id: "b", mealType: "Breakfast", steps: [] });
  const noOven = withSettings(s => ({ ...s, kitchen: { devices: ["Stovetop"] } }));
  assert.equal(checkEligibility(oven, noOven).eligible, false);
  assert.equal(suggestReplacement(oven, [oven, hob, breakfast], ["oven"], noOven)?.id, "hob");
});

// ---------- Catalog: Weekly Meals filtering and My Recipes ----------
const catalog = JSON.parse(readFileSync("data/catalog/tablewise-recipes-v1.json", "utf8")).recipes as { id: string; steps: string[]; title: string }[];
const planner = toPlannerRecipes(catalog.map(r => ({ ...r, createdAt: "", updatedAt: "" })) as never);
test("incompatible recipes are excluded from Weekly Meals (list and name search); My Recipes data is untouched", () => {
  const microwaveOnly = withSettings(s => ({ ...s, kitchen: { devices: ["Microwave"] } }));
  const { eligible, excluded } = personalize(planner, microwaveOnly);
  assert.ok(eligible.length > 0 && excluded.length > 0);
  assert.ok(eligible.every(e => satisfiesDevices(e.recipe.deviceRequirements, ["Microwave"])));
  const search = eligible.map(e => e.recipe).filter(r => /pancake/i.test(r.title));
  assert.ok(search.every(r => satisfiesDevices(r.deviceRequirements, ["Microwave"])));
  const none = personalize(planner, withSettings(s => ({ ...s, kitchen: { devices: [] } })));
  assert.ok(none.eligible.length > 0 && none.eligible.every(e => e.recipe.deviceRequirements.length === 0), "only no-cook recipes remain");
  // My Recipes reads the API list directly and never imports the engine.
  assert.ok(!/preference-engine|basic-settings/.test(readFileSync("client/src/pages/recipe-list.tsx", "utf8")));
  // Default settings hide nothing and keep the original order.
  assert.deepEqual(personalize(planner, defaultSettings()).eligible.map(e => e.recipe.id), planner.map(r => r.id));
});
test("meal-type and dietary filters still work on top of personalization", () => {
  const none = { maxMinutes: null, dietary: [], mealType: ["Breakfast"], cookingMethod: [], source: [], proteinType: [], withNotes: false,
    modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [] };
  const vegetarian = withSettings(s => ({ ...s, dietary: { ...s.dietary, diets: ["vegetarian"] } }));
  const shown = personalize(planner, vegetarian).eligible.map(e => e.recipe).filter(r => matchesPlannerFilters(r, none, "total", { isMyPick: false, rating: null }));
  assert.ok(shown.length > 0 && shown.every(r => r.mealType === "Breakfast" && !/\b(bacon|chicken|ham|salmon|sausages?)\b/i.test(r.ingredients.join(" "))));
});

test("Weekly Meals filters work on top of saved restrictions; clearing them keeps the restrictions", () => {
  const glutenFree = withSettings(s => ({ ...s, dietary: { ...s.dietary, diets: ["glutenFree"] } }));
  const baseline = personalize(planner, glutenFree).eligible.map(e => e.recipe);
  const none = { maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false,
    modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [] };
  const meta = { isMyPick: false, rating: null };
  const withChicken = baseline.filter(r => matchesPlannerFilters(r, { ...none, proteinType: ["Chicken"] }, "total", meta));
  assert.ok(withChicken.length > 0 && withChicken.every(r => r.proteinType === "Chicken" && checkEligibility(r, glutenFree).eligible));
  const cleared = baseline.filter(r => matchesPlannerFilters(r, none, "total", meta));
  assert.equal(cleared.length, baseline.length, "Clear filters returns to the saved baseline");
  assert.ok(cleared.length < planner.length, "…which still excludes non-gluten-free recipes");
});
test("active preference chips show exactly the saved values (none for defaults) in three languages", () => {
  const meal = (m: string) => m;
  assert.deepEqual(activePreferenceChips(defaultSettings(), "en", meal), []);
  const leo = { ...emptyMember("child", "Leo"), allergies: ["milk" as const] };
  const s = withSettings(s => ({ ...s, household: { ...s.household, members: [emptyMember("adult", "Dana"), leo] },
    dietary: { ...s.dietary, diets: ["glutenFree"], dislikes: ["mushrooms"], preferredCuisines: ["Italian"] },
    kitchen: { devices: ["Stovetop", "Microwave"] }, cooking: { ...s.cooking, weekdayMax: 30, weekend: { ...s.cooking.weekend, batch: true } },
    planning: { ...s.planning, meals: ["Dinner"], cookingDays: 4 } }));
  const en = activePreferenceChips(s, "en", meal);
  const text = (group: string) => en.filter(c => c.group === group).map(c => c.text);
  assert.deepEqual(text("hard"), ["Gluten-free", "Allergy: milk (Leo)", "Devices: Stovetop · Microwave"]);
  assert.deepEqual(text("planning"), ["Adults: 1 · Children: 1", "2 servings", "Plans: Dinner", "4 cooking days"]);
  assert.deepEqual(text("soft"), ["Weekdays: up to 30 min", "Weekend: batch cooking", "Likes: Italian", "Dislikes: mushrooms"]);
  assert.ok(activePreferenceChips(s, "ru", meal).some(c => c.text === "Аллергия: молоко (Leo)"));
  assert.ok(activePreferenceChips(s, "he", meal).some(c => c.text === "ללא גלוטן"));
  const hard = activePreferenceChips({ ...s, cooking: { ...s.cooking, hardMax: true } }, "en", meal);
  assert.ok(hard.some(c => c.group === "hard" && c.text === "Never over 30 min") && !hard.some(c => c.id === "weekday-time"));
  assert.deepEqual(activePreferenceChips(withSettings(s => ({ ...s, kitchen: { devices: [] } })), "en", meal).map(c => c.text), ["No cooking devices"]);
});
test("when nothing matches, the most limiting restrictions are named", () => {
  const s = withSettings(s => ({ ...s, kitchen: { devices: [] }, dietary: { ...s.dietary, allergies: ["eggs"] } }));
  const { excluded } = personalize(planner, s);
  const reasons = limitingReasons(excluded, "en", () => null);
  assert.ok(reasons.length > 0 && reasons.length <= 3);
  assert.match(reasons[0], /^needs Stovetop — \d+ recipes$/);
});
test("audit regressions: gluten in buns, muffins, rolls, pasta shapes, broth and wheat sauces is caught", () => {
  for (const line of ["6 burger buns, split", "4 English muffins, split", "2 sandwich rolls", "8 oz fettuccine", "2 cups chicken broth", "4 flatbreads", "1 pizza base", "2 croissants"]) {
    assert.equal(evaluateAllergen("gluten", [line]).status, "violates", line);
    assert.equal(evaluateDiet("glutenFree", [line]).status, "violates", line);
  }
  for (const line of ["2 tbsp fish sauce", "1 tbsp oyster sauce", "2 tbsp mustard or sauce", "4 pork sausages"]) assert.equal(evaluateAllergen("gluten", [line]).status, "uncertain", line);
  for (const line of ["250 g flat rice noodles", "2 tbsp tamari (gluten-free soy sauce)", "1 tbsp cornflour", "500 ml gluten-free vegetable stock"]) assert.equal(evaluateAllergen("gluten", [line]).status, "ok", line);
  assert.equal(evaluateDiet("vegetarian", ["300 g rump steak"]).status, "violates");
  assert.equal(evaluateAllergen("shellfish", ["200 g crawfish tails"]).status, "violates");
  assert.equal(evaluateAllergen("milk", ["4 pork sausages"]).status, "uncertain");
  assert.equal(evaluateAllergen("eggs", ["4 brioche buns"]).status, "uncertain");
});
test("every recipe that matches really passes each hard rule (independent re-check on the catalog)", () => {
  const strict = withSettings(s => ({ ...s, dietary: { ...s.dietary, diets: ["glutenFree", "vegetarian"], allergies: ["gluten", "milk", "peanuts"] },
    kitchen: { devices: ["Stovetop", "Microwave"] } }));
  const { eligible } = personalize(planner, strict);
  assert.ok(eligible.length > 0);
  for (const { recipe: r } of eligible) {
    for (const d of ["glutenFree", "vegetarian"] as const) assert.equal(evaluateDiet(d, r.ingredients).status, "ok", `${r.title}: ${d}`);
    for (const a of ["gluten", "milk", "peanuts"] as const) assert.equal(evaluateAllergen(a, r.ingredients).status, "ok", `${r.title}: ${a}`);
    assert.ok(satisfiesDevices(r.deviceRequirements, ["Stovetop", "Microwave"]), `${r.title}: devices`);
  }
  for (const title of ["Slow cooker pulled pork", "Homemade beef burgers", "Eggs Benedict", "Prawn pad thai"]) {
    assert.ok(!eligible.some(e => e.recipe.title === title), `${title} must not match a gluten allergy`);
  }
});
test("match counts are unique and consistent; page filters move recipes from matching to 'additional filters'", () => {
  const s = withSettings(s => ({ ...s, dietary: { ...s.dietary, diets: ["glutenFree"], allergies: ["gluten"] }, kitchen: { devices: ["Stovetop"] } }));
  const p = personalize(planner, s);
  const all = p.eligible.map(e => e.recipe);
  const c = matchCounts(p, all);
  assert.equal(c.total, planner.length);
  assert.equal(c.matching + c.bySettings + c.byFilters, c.total);
  assert.equal(c.byFilters, 0);
  assert.equal(c.bySettings, new Set(p.excluded.map(e => e.recipe.id)).size);
  const multi = p.excluded.filter(e => new Set(e.eligibility.reasons.map(r => r.kind)).size > 1).length;
  assert.ok(multi > 0, "some recipes fail several rules");
  assert.ok(Object.values(c.breakdown).reduce((a, b) => a + b, 0) > c.bySettings, "breakdown may list a recipe twice, the total never does");
  assert.equal(c.breakdown.devices, p.excluded.filter(e => e.eligibility.reasons.some(r => r.kind === "device")).length);
  const chicken = all.filter(r => r.proteinType === "Chicken");
  const filtered = matchCounts(p, [...chicken, ...chicken]); // duplicates must not double-count
  assert.equal(filtered.matching, chicken.length);
  assert.equal(filtered.byFilters, all.length - chicken.length);
  assert.equal(filtered.bySettings, c.bySettings, "page filters never change the settings count");
  assert.equal(matchCounts(p, [planner.find(r => !all.includes(r))!]).matching, 0, "an excluded recipe can never count as matching");
});
test("filter order never changes results: every application order of the same filters gives the same recipes", () => {
  const glutenFree = withSettings(s => ({ ...s, dietary: { ...s.dietary, diets: ["glutenFree"] } }));
  const baseline = personalize(planner, glutenFree).eligible.map(e => e.recipe);
  const empty = { maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false,
    modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [], cuisine: [] as string[] };
  type F = typeof empty;
  // The sidebar order (meal type, time, protein, ingredients, dietary, method, source, cuisine) as edits.
  const edits: ((f: F) => F)[] = [
    f => ({ ...f, mealType: [...f.mealType, "Dinner"] }), f => ({ ...f, maxMinutes: 60 }), f => ({ ...f, proteinType: [...f.proteinType, "Chicken"] }),
    f => ({ ...f, mustExclude: [...f.mustExclude, "mushroom"] }), f => ({ ...f, dietary: [...f.dietary, "Kid friendly"] }),
    f => ({ ...f, cookingMethod: [...f.cookingMethod, "Stovetop"] }),
  ];
  const meta = { isMyPick: false, rating: null };
  const run = (order: number[]) => {
    const filters = order.reduce((f, i) => edits[i](f), empty);
    return baseline.filter(r => matchesPlannerFilters(r, filters, "total", meta)).map(r => r.id);
  };
  const reference = run([0, 1, 2, 3, 4, 5]);
  assert.ok(reference.length > 0 && reference.length < baseline.length);
  for (const order of [[5, 4, 3, 2, 1, 0], [2, 0, 5, 1, 3, 4], [4, 2, 0, 3, 5, 1], [3, 5, 1, 4, 0, 2]]) assert.deepEqual(run(order), reference, `order ${order}`);
  // Cuisine (under More filters) refines the saved baseline; removing it keeps the restriction.
  const italian = baseline.filter(r => matchesPlannerFilters(r, { ...empty, cuisine: ["Italian"] }, "total", meta));
  assert.ok(italian.length > 0 && italian.every(r => r.tags.includes("Italian") && checkEligibility(r, glutenFree).eligible));
  assert.equal(baseline.filter(r => matchesPlannerFilters(r, empty, "total", meta)).length, baseline.length);
  // Older saved filters without the cuisine field still work.
  const { cuisine: _drop, ...legacy } = empty;
  assert.equal(baseline.filter(r => matchesPlannerFilters(r, legacy, "total", meta)).length, baseline.length);
});
// ---------- Fill my week ----------
test("Fill my week uses cooking days, meals, servings and leftovers, and never removes existing plans", () => {
  const dinners = [1, 2, 3, 4].map(i => recipe({ id: `d${i}`, steps: ["Simmer in a saucepan for 20 minutes."] }));
  const settings = withSettings(s => ({ ...s, household: { ...s.household, servingsMode: "fixed", fixedServings: 3 },
    planning: { ...s.planning, meals: ["Dinner"], cookingDays: 3, leftovers: "often" } }));
  const existing = { recipeId: "d4", mealType: "Dinner" as const, startDay: 1, spanDays: 1 };
  const plan = { selectedIds: dinners.map(d => d.id), planAssignments: [existing] };
  const { plan: filled, added } = fillWeek(plan, dinners, settings);
  assert.ok(filled.planAssignments.includes(existing), "existing assignment kept");
  assert.ok(added > 0);
  const fresh = filled.planAssignments.filter(a => a !== existing);
  assert.ok(fresh.every(a => a.mealType === "Dinner" && a.servings === 3 * a.spanDays));
  assert.ok(fresh.some(a => a.spanDays === 2), "leftovers span two days");
  assert.ok(fresh.every(a => a.spanDays === 1 || !fresh.some(o => o.startDay === a.startDay + 1)), "leftover days are not cooking days");
  assert.ok(!fresh.some(a => a.recipeId === "d4"), "already planned recipe not added twice");
  const occupied = new Set<string>();
  for (const a of filled.planAssignments) for (let d = a.startDay; d < a.startDay + a.spanDays; d++) {
    assert.ok(!occupied.has(`${a.mealType}${d}`), "no double-booked slot"); occupied.add(`${a.mealType}${d}`);
  }
  // 4 cooking days with leftovers cover 7 days of dinners.
  const four = dinners.concat([5, 6].map(i => recipe({ id: `d${i}`, steps: ["Simmer in a saucepan for 20 minutes."] })));
  const week = fillWeek({ selectedIds: four.map(d => d.id), planAssignments: [] }, four, { ...settings, planning: { ...settings.planning, cookingDays: 4 } });
  assert.equal(week.added, 4);
  assert.equal(week.plan.planAssignments.reduce((n, a) => n + a.spanDays, 0), 7);
  const blocked = fillWeek(plan, dinners, { ...settings, kitchen: { devices: ["Oven"] } });
  assert.equal(blocked.added, 0);
  assert.equal(blocked.skippedIneligible.length, 4);
});
console.log(`All ${passed} My Basic Settings tests passed.`);
