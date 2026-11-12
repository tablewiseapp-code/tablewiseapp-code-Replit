// My Basic Settings: persistence/migration, device AND/OR requirements, household restrictions, ranking, week filling.
// Pure checks, no browser or database. Run: npx tsx script/test-basic-settings.ts   (UI: script/test-basic-settings-browser.mjs)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultSettings, emptyMember, householdServings, loadSettings, methodChoices, availableDevices, sanitizeSettings, settingsKey, updateSettings,
  type BasicSettings } from "../client/src/lib/basic-settings";
import { inferDeviceRequirements, satisfiesDevices, deviceRequirementsOf } from "../client/src/lib/device-requirements";
import { checkEligibility, fillWeek, mealReasons, personalize, rankRecipe, suggestReplacement, type EngineRecipe } from "../client/src/lib/preference-engine";
import { restrictionText, settingsText } from "../client/src/lib/settings-copy";
import { evaluateMeat } from "../shared/food-rules";
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

// ---------- Meal-specific recipe type and cooking time ----------
type Rules = BasicSettings["planning"]["mealRules"];
const withRules = (rules: Partial<Rules>, patch: (s: BasicSettings) => BasicSettings = s => s) =>
  withSettings(s => patch({ ...s, planning: { ...s.planning, mealRules: { ...s.planning.mealRules, ...rules } } }));
const acceptance = { Breakfast: { type: "meatless", max: 15 }, Lunch: { type: "meat", max: 30 }, Dinner: { type: "both", max: 45 } } as const;
const fits = (r: EngineRecipe, s: BasicSettings, meal: "Breakfast" | "Lunch" | "Dinner") => checkEligibility(r, s, undefined, meal).eligible;

test("Breakfast, Lunch and Dinner rules are independent, persist, and sanitize field by field", () => {
  const store = memory();
  updateSettings(s => ({ ...s, planning: { ...s.planning, mealRules: acceptance } }), store);
  assert.deepEqual(loadSettings(store).planning.mealRules, acceptance);
  updateSettings(s => ({ ...s, planning: { ...s.planning, mealRules: { ...s.planning.mealRules, Lunch: { type: "both", max: "none" } } } }), store);
  const after = loadSettings(store).planning.mealRules;
  assert.deepEqual([after.Breakfast, after.Dinner], [acceptance.Breakfast, acceptance.Dinner], "changing Lunch leaves the others alone");
  assert.deepEqual(after.Lunch, { type: "both", max: "none" });
  const bad = sanitizeSettings({ version: 2, planning: { mealRules: { Breakfast: { type: "vegan", max: 17 }, Lunch: "x", Snack: { type: "meat" } } } });
  assert.deepEqual(bad.planning.mealRules, defaultSettings().planning.mealRules);
  assert.ok(!("Snack" in bad.planning.mealRules));
});
test("existing users keep their settings: no meal rules = Both and their weekday/weekend times", () => {
  const old = sanitizeSettings({ version: 2, cooking: { weekdayMax: 30, weekendMax: 60 }, planning: { cookingDays: 5 } });
  assert.deepEqual(old.planning.mealRules, { Breakfast: { type: "both", max: null }, Lunch: { type: "both", max: null }, Dinner: { type: "both", max: null } });
  assert.equal(old.cooking.weekdayMax, 30); assert.equal(old.cooking.weekendMax, 60); assert.equal(old.planning.cookingDays, 5);
  assert.deepEqual(loadSettings(memory({ [settingsKey]: JSON.stringify({ devices: ["Oven"] }) })).planning.mealRules, defaultSettings().planning.mealRules);
  // Weekday limit still steers Fill my week: a 50-minute dinner is not used on a weekday when a 25-minute one fits.
  const slow = recipe({ id: "slow", prepTime: 20, cookTime: 30 }), quick = recipe({ id: "quick", prepTime: 5, cookTime: 20 });
  const s = { ...old, planning: { ...old.planning, meals: ["Dinner" as const], cookingDays: 1 } };
  assert.equal(fillWeek({ selectedIds: [], planAssignments: [] }, [slow, quick], s).plan.planAssignments[0].recipeId, "quick");
});
test("meatless excludes meat, poultry and seafood; meat includes them; both accepts either; eggs and dairy are meatless", () => {
  const meats = [["2 chicken breasts"], ["400 g beef mince"], ["4 rashers bacon"], ["2 salmon fillets"], ["200 g prawns"], ["1 tin tuna"], ["300 g mussels"]];
  const meatless = [["3 eggs", "50 g cheddar", "100 ml milk"], ["400 g potatoes", "1 onion"], ["200 g Greek yogurt", "honey"]];
  const s = withRules({ Breakfast: { type: "meatless", max: null }, Lunch: { type: "meat", max: null }, Dinner: { type: "both", max: null } });
  for (const ingredients of meats) {
    const r = recipe({ ingredients });
    assert.equal(evaluateMeat(ingredients), "violates", ingredients[0]);
    assert.equal(fits(r, s, "Breakfast"), false, `meatless rejects ${ingredients[0]}`);
    assert.equal(fits(r, s, "Lunch"), true, `meat accepts ${ingredients[0]}`);
    assert.equal(fits(r, s, "Dinner"), true);
  }
  for (const ingredients of meatless) {
    const r = recipe({ ingredients });
    assert.equal(fits(r, s, "Breakfast"), true, `meatless accepts ${ingredients.join(", ")}`);
    assert.equal(fits(r, s, "Lunch"), false, `meat rejects ${ingredients.join(", ")}`);
    assert.equal(fits(r, s, "Dinner"), true);
  }
  // Classification reads ingredients, not titles or tags.
  assert.equal(fits(recipe({ title: "Chicken-style vegetable pie", tags: ["vegetarian"], ingredients: ["2 carrots", "1 sheet puff pastry"] }), s, "Breakfast"), true);
  assert.equal(fits(recipe({ title: "Garden salad", tags: ["vegetarian"], ingredients: ["1 lettuce", "100 g anchovies"] }), s, "Breakfast"), false);
});
test("time limits use total time (prep + cook); unknown time or ingredients never pass a meal rule", () => {
  const s = withRules({ Breakfast: { type: "both", max: 15 }, Dinner: { type: "both", max: "none" } });
  assert.equal(fits(recipe({ prepTime: 5, cookTime: 10 }), s, "Breakfast"), true);
  assert.equal(fits(recipe({ prepTime: 10, cookTime: 10 }), s, "Breakfast"), false, "20 min total is over 15 even though cook time alone is 10");
  assert.equal(fits(recipe({ prepTime: 20, cookTime: 0 }), s, "Breakfast"), false, "prep-only time counts");
  const unknown: EngineRecipe = { ...recipe({}), prepTime: null, cookTime: null, minutes: undefined };
  assert.deepEqual(mealReasons(unknown, s, "Breakfast"), [{ kind: "mealTime", meal: "Breakfast", minutes: null, max: 15 }], "missing time is not 0");
  assert.equal(fits(unknown, s, "Dinner"), true, "No limit accepts unknown time");
  assert.equal(fits(unknown, s, "Lunch"), true, "Lunch (not set) is unaffected");
  const typed = withRules({ Breakfast: { type: "meatless", max: null }, Lunch: { type: "meat", max: null } });
  for (const ingredients of [[], ["500 ml stock", "2 leeks"]]) {
    assert.equal(fits(recipe({ ingredients }), typed, "Breakfast"), false, `unverifiable is not meatless: ${ingredients}`);
    assert.equal(fits(recipe({ ingredients }), typed, "Lunch"), false, `unverifiable is not meat: ${ingredients}`);
  }
  assert.equal(mealReasons(recipe({ ingredients: [] }), typed, "Breakfast")[0].kind, "mealType");
});
test("global restrictions still apply: a meal setting never overrides allergies, diets or devices", () => {
  const s = withRules({ Lunch: { type: "meat", max: 60 }, Dinner: { type: "both", max: "none" } }, s => ({ ...s, dietary: { ...s.dietary, allergies: ["shellfish"], diets: ["porkFree"] } }));
  assert.equal(fits(recipe({ ingredients: ["200 g prawns"] }), s, "Lunch"), false);
  assert.equal(fits(recipe({ ingredients: ["4 rashers bacon"] }), s, "Lunch"), false);
  assert.equal(fits(recipe({ ingredients: ["2 chicken thighs"] }), s, "Lunch"), true);
  const hard = withRules({ Dinner: { type: "both", max: "none" } }, s => ({ ...s, cooking: { ...s.cooking, weekdayMax: 30, hardMax: true } }));
  assert.equal(fits(recipe({ prepTime: 30, cookTime: 30 }), hard, "Dinner"), false, "the global hard time limit still applies");
  const oven = withRules({ Breakfast: { type: "both", max: 60 } }, s => ({ ...s, kitchen: { devices: [] } }));
  assert.equal(fits(recipe({ steps: ["Bake in the oven for 20 minutes."] }), oven, "Breakfast"), false);
});
test("the general list keeps global rules only; a meal's rules apply to that meal's recipes when it is selected", () => {
  const s = withRules(acceptance);
  const bacon = recipe({ id: "bacon-bkf", mealType: "Breakfast", ingredients: ["4 rashers bacon", "2 eggs"] });
  const steak = recipe({ id: "steak", mealType: "Dinner", ingredients: ["2 steaks"], prepTime: 10, cookTime: 20 });
  const oats = recipe({ id: "oats", mealType: "Breakfast", ingredients: ["80 g oats", "200 ml milk"], prepTime: 2, cookTime: 5 });
  const all = [bacon, steak, oats];
  const ids = (ctx = {}) => personalize(all, s, ctx).eligible.map(e => e.recipe.id).sort();
  assert.deepEqual(ids(), ["bacon-bkf", "oats", "steak"], "no meal selected: nothing hidden by meal rules");
  assert.deepEqual(ids({ meals: ["Breakfast"] }), ["oats", "steak"], "Breakfast rules only touch Breakfast recipes");
  assert.deepEqual(ids({ meals: ["Dinner"] }), ["bacon-bkf", "oats", "steak"]);
  // A Breakfast recipe that fails Breakfast is still eligible as Dinner.
  assert.equal(fits(bacon, s, "Dinner"), true);
});
test("per-meal recipe counts equal the rendered results for that meal (settings + meal rules + manual filters)", () => {
  const s = withRules(acceptance, s => ({ ...s, dietary: { ...s.dietary, allergies: ["fish"] } }));
  const pool = [
    recipe({ id: "b1", mealType: "Breakfast", ingredients: ["2 eggs", "toast"], prepTime: 5, cookTime: 5 }),
    recipe({ id: "b2", mealType: "Breakfast", ingredients: ["2 eggs", "bacon"], prepTime: 5, cookTime: 5 }),
    recipe({ id: "b3", mealType: "Breakfast", ingredients: ["oats", "milk"], prepTime: 10, cookTime: 10 }),
    recipe({ id: "b4", mealType: "Breakfast", ingredients: ["2 eggs", "smoked salmon"], prepTime: 5, cookTime: 0 }),
    recipe({ id: "l1", mealType: "Lunch", ingredients: ["chicken", "bread"], prepTime: 10, cookTime: 15 }),
    recipe({ id: "l2", mealType: "Lunch", ingredients: ["chickpeas", "bread"], prepTime: 10, cookTime: 0 }),
    recipe({ id: "l3", mealType: "Lunch", ingredients: ["tuna", "bread"], prepTime: 5, cookTime: 0 }),
    recipe({ id: "d1", mealType: "Dinner", ingredients: ["beef"], prepTime: 15, cookTime: 30 }),
    recipe({ id: "d2", mealType: "Dinner", ingredients: ["lentils"], prepTime: 15, cookTime: 40 }),
  ];
  const filters = { maxMinutes: null, dietary: [], mealType: [] as string[], cookingMethod: [], source: [], proteinType: [], withNotes: false, modifiedByMe: false,
    myPicks: false, minRating: null, servings: null, mustInclude: [] as string[], mustExclude: [] as string[] };
  const meta = { isMyPick: false, rating: null };
  const mealEligible = personalize(pool, s, { meals: ["Breakfast", "Lunch", "Dinner"] }).eligible.map(e => e.recipe);
  const count = (meal: string, f = filters) => mealEligible.filter(r => r.mealType === meal && matchesPlannerFilters({ ...r, tools: [], sourceType: "", proteinType: "",
    hasNotes: false, modifiedByMe: false, servingsRange: "" }, { ...f, mealType: [meal] }, "total", meta)).length;
  const shown = (meal: string, f = filters) => personalize(pool, s, { meals: [meal as "Breakfast"] }).eligible.map(e => e.recipe).filter(r => matchesPlannerFilters({ ...r, tools: [],
    sourceType: "", proteinType: "", hasNotes: false, modifiedByMe: false, servingsRange: "" }, { ...f, mealType: [meal] }, "total", meta));
  for (const meal of ["Breakfast", "Lunch", "Dinner"]) assert.equal(count(meal), shown(meal).length, meal);
  assert.deepEqual(shown("Breakfast").map(r => r.id), ["b1"], "meatless, 15 min, no fish");
  assert.deepEqual(shown("Lunch").map(r => r.id), ["l1"], "meat, 30 min; tuna excluded by the fish allergy");
  assert.deepEqual(shown("Dinner").map(r => r.id), ["d1"], "both, 45 min");
  const withExclude = { ...filters, mustExclude: ["toast"] };
  assert.equal(count("Breakfast", withExclude), 0); assert.equal(shown("Breakfast", withExclude).length, 0);
  const c = matchCounts(personalize(pool, s, { meals: ["Breakfast"] }), shown("Breakfast"));
  assert.equal(c.matching, 1); assert.equal(c.breakdown.meal, 3, "b2 (meat), b3 (20 min), b4 (salmon) fail Breakfast settings"); assert.equal(c.breakdown.allergies, 2, "b4 and l3 (fish)");
});
test("Fill my week uses each meal's own rules for each slot; replacements respect the meal's rules", () => {
  const s = withRules(acceptance, s => ({ ...s, planning: { ...s.planning, cookingDays: 1 }, cooking: { ...s.cooking, weekdayMax: 10 } }));
  const selected = [
    recipe({ id: "bacon", mealType: "Breakfast", ingredients: ["bacon", "eggs"], prepTime: 5, cookTime: 5 }),
    recipe({ id: "porridge", mealType: "Breakfast", ingredients: ["oats", "milk"], prepTime: 2, cookTime: 8 }),
    recipe({ id: "salad", mealType: "Lunch", ingredients: ["lettuce", "feta"], prepTime: 10, cookTime: 0 }),
    recipe({ id: "wrap", mealType: "Lunch", ingredients: ["chicken", "tortilla"], prepTime: 10, cookTime: 15 }),
    recipe({ id: "stew", mealType: "Dinner", ingredients: ["beans", "tomatoes"], prepTime: 10, cookTime: 30 }),
    recipe({ id: "roast", mealType: "Dinner", ingredients: ["lamb"], prepTime: 20, cookTime: 60 }),
  ];
  const { plan } = fillWeek({ selectedIds: selected.map(r => r.id), planAssignments: [] }, selected, s);
  const at = (meal: string) => plan.planAssignments.find(a => a.mealType === meal)?.recipeId;
  assert.equal(at("Breakfast"), "porridge"); assert.equal(at("Lunch"), "wrap");
  assert.equal(at("Dinner"), "stew", "Dinner's own 45 min replaces the 10 min weekday time; the 80 min roast never fits");
  const pool = [selected[0], recipe({ id: "yogurt", mealType: "Breakfast", ingredients: ["yogurt", "berries"], prepTime: 5, cookTime: 0 }),
    recipe({ id: "ham", mealType: "Breakfast", ingredients: ["ham", "bread"], prepTime: 5, cookTime: 0 })];
  assert.equal(suggestReplacement(pool[0], pool, ["bacon"], s)?.id, "yogurt");
});
test("meal settings read correctly in English, Russian and Hebrew", () => {
  for (const lang of ["en", "ru", "he"]) {
    for (const key of ["mealRulesTitle", "recipeType", "mealType_both", "mealType_meatless", "mealType_meat", "mealMaxTime", "mealTimeDefault", "bd_meal", "mealCount", "pickOthers", "meal_Breakfast"]) {
      const text = settingsText(lang, key);
      assert.ok(text && text !== key, `${lang}.${key}`);
      if (lang !== "en") assert.notEqual(text, settingsText("en", key), `${lang}.${key} is translated`);
    }
    const reasons = mealReasons(recipe({ ingredients: ["bacon"], prepTime: 10, cookTime: 10 }), withRules({ Breakfast: { type: "meatless", max: 15 } }), "Breakfast");
    for (const r of reasons) assert.ok(!/[{}]/.test(restrictionText(lang, r, () => null)), `${lang} ${r.kind}`);
  }
  assert.equal(restrictionText("en", { kind: "mealTime", meal: "Breakfast", minutes: null, max: 15 }, () => null), "total time unknown (Breakfast: up to 15)");
  assert.equal(restrictionText("ru", { kind: "mealType", meal: "Lunch", type: "meat", status: "violates" }, () => null), "нет мяса, птицы или морепродуктов (Обед)");
  assert.equal(restrictionText("he", { kind: "mealType", meal: "Dinner", type: "meatless", status: "violates" }, () => null), "מכיל בשר, עוף או פירות ים (ארוחת ערב)");
  const chips = activePreferenceChips(withRules(acceptance), "en", m => m);
  assert.deepEqual(chips.filter(c => c.id.startsWith("meal-")).map(c => c.text), ["Breakfast: Meatless · 15 min", "Lunch: Meat · 30 min", "Dinner: 45 min"]);
});
// ---------- Individual food preferences (likes / dislikes per member) ----------
const kid = (name: string, favorites: string[] = [], dislikes: string[] = []) => ({ ...emptyMember("child", name), favorites, dislikes });
const withKids = (...members: ReturnType<typeof kid>[]) => withSettings(s => ({ ...s, household: { ...s.household, members } }));
const muffin = recipe({ id: "muffin", title: "Blueberry Muffins", mealType: "Breakfast", tags: ["Breakfast", "Baking"], ingredients: ["200 g flour", "150 g blueberries", "2 eggs"] });
const eggs = recipe({ id: "eggs", title: "Scrambled Eggs on Toast", mealType: "Breakfast", tags: ["Breakfast"], ingredients: ["4 eggs", "2 slices bread"] });
test("likes and dislikes are stored per member, persist, and keep the person's own words", () => {
  const store = memory();
  const mia = kid("Mia", ["muffins", "custom:strawberries"], ["mushrooms"]), sam = kid("Sam", ["pizza"], ["onions"]);
  updateSettings(s => ({ ...s, household: { ...s.household, members: [mia, sam] } }), store);
  const [a, b] = loadSettings(store).household.members;
  assert.deepEqual([a.id, a.favorites, a.dislikes], [mia.id, ["muffins", "custom:strawberries"], ["mushrooms"]]);
  assert.deepEqual([b.favorites, b.dislikes], [["pizza"], ["onions"]]);
  // Older members without likes, and unknown ids, sanitize safely.
  const old = sanitizeSettings({ version: 2, household: { members: [{ id: "abcd1234", name: "Old", favorites: ["unicorns", "muffins"] }, { id: "efgh5678", name: "Older" }] } });
  assert.deepEqual(old.household.members.map(m => m.favorites), [["muffins"], []]);
});
test("a dish like (muffins) matches by recipe title, an ingredient like (strawberries) by ingredient lines", () => {
  const s = withKids(kid("Mia", ["muffins"]));
  assert.ok(rankRecipe(muffin, s).matches.includes("favorite:muffins"));
  assert.ok(!rankRecipe(recipe({ title: "Pancakes", ingredients: ["1 leftover muffin, crumbled"] }), s).matches.length, "dishes don't match ingredient lines");
  const berries = withKids(kid("Mia", ["custom:strawberries"]));
  assert.ok(rankRecipe(recipe({ title: "Yogurt Pots", ingredients: ["200 g strawberries"] }), berries).matches.includes("favorite:custom:strawberries"));
  assert.ok(!rankRecipe(recipe({ title: "Strawberry-free Toast", ingredients: ["bread"] }), withKids(kid("Mia", ["custom:straw"]))).matches.length, "no naive substring match");
  assert.ok(rankRecipe(muffin, withKids(kid("Mia", ["custom:blueberry muffins"]))).matches.length, "free text matches the dish name");
});
test("the more members like a recipe, the higher it ranks; one long list can't outweigh everyone else", () => {
  const one = rankRecipe(muffin, withKids(kid("Mia", ["muffins"]), kid("Sam"))).score;
  const two = rankRecipe(muffin, withKids(kid("Mia", ["muffins"]), kid("Sam", ["muffins"]))).score;
  assert.ok(two > one && one > 0);
  const greedy = withKids(kid("Mia", ["muffins", "custom:blueberries", "custom:flour", "eggs"]), kid("Sam", ["omelette"]), kid("Ana", ["omelette"]));
  assert.ok(rankRecipe(eggs, greedy).score > rankRecipe(muffin, greedy).score, "two people's likes beat one person's four");
  // Only the members eating count.
  const twoKids = withKids(kid("Mia", ["muffins"]), kid("Sam", ["muffins"]));
  assert.equal(rankRecipe(muffin, twoKids, { memberIds: [twoKids.household.members[0].id] }).score, one);
  assert.deepEqual(rankRecipe(muffin, twoKids).matches.filter(m => m.startsWith("likedBy:")).length, 2);
});
test("dislikes lower a recipe but never hide it; an allergy always wins over a like", () => {
  const s = withKids(kid("Mia", [], ["muffins"]));
  const { eligible } = personalize([muffin, eggs], s);
  assert.deepEqual(eligible.map(e => e.recipe.id), ["eggs", "muffin"]);
  const allergic = { ...kid("Mia", ["muffins"]), allergies: ["eggs" as const] };
  const r = personalize([muffin, eggs], withKids(allergic, kid("Sam", ["muffins"])));
  assert.deepEqual([r.eligible.length, r.excluded.length], [0, 2], "a liked recipe with an allergen is still excluded");
});
test("breakfast on the real catalog: liked muffins come first, nothing is hidden, pagination comes after ranking", () => {
  const s = withKids(kid("Mia", ["muffins"]), kid("Sam", ["muffins"]));
  const breakfasts = planner.filter(r => r.mealType === "Breakfast");
  const plain = personalize(breakfasts, defaultSettings(), { meals: ["Breakfast"] }).eligible.map(e => e.recipe.id);
  const ranked = personalize(breakfasts, s, { meals: ["Breakfast"] }).eligible.map(e => e.recipe);
  assert.equal(ranked.length, plain.length, "same recipes, only the order changes");
  const muffins = breakfasts.filter(r => /muffin/i.test(r.title));
  assert.ok(muffins.length >= 2);
  const firstPage = ranked.slice(0, muffins.length);
  assert.ok(firstPage.every(r => /muffin/i.test(r.title)), firstPage.map(r => r.title).join(", "));
  assert.deepEqual(personalize(breakfasts, withKids(kid("Mia"), kid("Sam")), { meals: ["Breakfast"] }).eligible.map(e => e.recipe.id), plain, "empty likes keep today's order");
});
test("lunch and dinner use the same likes; Fill my week puts the liked recipe into the slot", () => {
  const s = withKids(kid("Mia", ["pizza", "soup"]));
  const lunch = [recipe({ id: "wrap", title: "Chicken Wrap", mealType: "Lunch" }), recipe({ id: "soup", title: "Tomato Soup", mealType: "Lunch", tags: ["Lunch", "Soup"] })];
  assert.equal(personalize(lunch, s, { meals: ["Lunch"] }).eligible[0].recipe.id, "soup");
  const dinner = [recipe({ id: "stew", title: "Beef Stew" }), recipe({ id: "pizza", title: "Margherita Pizza" })];
  const plan = { selectedIds: [], planAssignments: [] } as never;
  const one = { ...s, planning: { ...s.planning, meals: ["Dinner" as const], cookingDays: 1 } };
  assert.equal(fillWeek(plan, dinner, one).plan.planAssignments[0].recipeId, "pizza");
});
test("food preference copy is translated in English, Russian and Hebrew", () => {
  for (const lang of ["en", "ru", "he"]) for (const key of ["foodPrefs", "foodPrefsHint", "memberLikes", "memberDislikes", "ing_muffins", "ing_pizza", "likedByMember", "likedByMany"]) {
    const text = settingsText(lang, key);
    assert.ok(text && text !== key, `${lang}.${key}`);
    if (lang !== "en" && !["ing_pizza"].includes(key)) assert.notEqual(text, settingsText("en", key), `${lang}.${key} is translated`);
  }
  assert.equal(settingsText("he", "likedByMany", { count: 2 }), "אהוב על 2 מבני הבית");
});
console.log(`All ${passed} My Basic Settings tests passed.`);
