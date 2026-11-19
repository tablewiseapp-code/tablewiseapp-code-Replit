// Your household → suggested week. Pure logic; optional real-catalog pass with CATALOG_URL=http://localhost:5000.
import assert from "node:assert/strict";
import { defaultSettings, type BasicSettings } from "../client/src/lib/basic-settings";
import { occupant, type PlanState } from "../client/src/lib/meal-plan";
import { checkEligibility, total } from "../client/src/lib/preference-engine";
import { buildRecipeGroceryRows } from "../client/src/lib/grocery-meal-removal";
import { toPlannerRecipes, type PlannerRecipe } from "../client/src/lib/planner-recipes";
import { cookingEvenings, needsHouseholdSetup, openEvening, proposeWeek, suggestWeek, swapDinner } from "../client/src/lib/week-suggestions";
import { plannedSlotCount, totalSlots } from "../client/src/lib/meal-plan";

const empty = (): PlanState => ({ selectedIds: [], planAssignments: [] });
const settingsWith = (change: (s: BasicSettings) => void) => { const s = defaultSettings(); change(s); return s; };
let n = 0;
const recipe = (title: string, minutes: number, steps: number, tags: string[] = [], ingredients = ["2 carrots", "1 onion", "200 g rice"]) =>
  ({ id: `r${++n}`, title, ingredients, steps: Array.from({ length: steps }, (_, i) => `Step ${i + 1}`), prepTime: Math.round(minutes / 3),
    cookTime: minutes - Math.round(minutes / 3), servings: "4", tags: ["Dinner", ...tags] } as never);
const catalog: PlannerRecipe[] = toPlannerRecipes([
  recipe("Quick rice bowl", 15, 3, ["Gluten-free", "Kid friendly"]), recipe("Veg stir rice", 20, 4, ["Gluten-free"]),
  recipe("Carrot soup", 25, 4, ["Gluten-free", "Vegetarian"]), recipe("Weeknight pilaf", 30, 5, ["Gluten-free"]),
  recipe("Slow braise", 150, 14, ["Gluten-free"], ["1 kg beef", "2 carrots", "1 onion", "500 ml wine", "2 bay leaves", "1 tbsp tomato paste", "200 g rice"]),
  recipe("Untagged soup", 20, 3, [], ["2 carrots", "1 onion", "1 l water"]),
  recipe("Pasta bake", 40, 8, [], ["400 g pasta", "200 g cheese", "1 onion"]),
  recipe("Elaborate risotto", 70, 12, ["Gluten-free"], ["300 g rice", "1 onion", "1 l water", "50 g butter", "1 lemon", "parsley", "2 carrots"]),
] as never);
const byId = new Map(catalog.map(r => [r.id, r]));
const dinnerDays = (plan: PlanState) => plan.planAssignments.filter(a => a.mealType === "Dinner").map(a => a.startDay).sort();

// 1. Quick & easy, five servings, three evenings, Friday fixed → Friday plus two more, five servings each.
const quick = settingsWith(s => { s.setup.style = "quick"; s.setup.evenings = 3; s.setup.fixedDays = [5]; s.household.servingsMode = "fixed"; s.household.fixedServings = 5; });
const q = suggestWeek(empty(), catalog, quick, "2026-11-16");
assert.equal(q.plan.planAssignments.length, 3);
assert.ok(dinnerDays(q.plan).includes(5), "Friday is scheduled");
assert.ok(q.plan.planAssignments.every(a => a.servings === 5 && a.spanDays === 1 && a.mealType === "Dinner"));
assert.deepEqual([...q.plan.selectedIds].sort(), [...new Set(q.plan.planAssignments.map(a => a.recipeId))].sort());
assert.deepEqual(suggestWeek(empty(), catalog, quick, "2026-11-16").plan, q.plan, "stable across refreshes");
// Not sure yet: three evenings, or more when more fixed days were picked.
assert.equal(cookingEvenings(settingsWith(s => { s.setup.evenings = null; })).length, 3);
assert.equal(cookingEvenings(settingsWith(s => { s.setup.evenings = null; s.setup.fixedDays = [1, 2, 3, 4]; })).length, 4);
assert.deepEqual(cookingEvenings(settingsWith(s => { s.setup.evenings = 2; s.setup.fixedDays = [1, 3, 5]; })), [1, 3, 5], "fixed days are kept when they exceed the count");

// 2. Chef challenge on Friday with a 30-minute weeknight limit: weekdays respect it, Friday is the most involved.
const chef = settingsWith(s => { s.setup.style = "chef"; s.setup.evenings = 4; s.setup.challenge = { when: "day", day: 5 }; s.setup.weeknightMax = { Breakfast: 10, Lunch: null, Dinner: 30 }; });
const c = suggestWeek(empty(), catalog, chef, "2026-11-16");
for (const a of c.plan.planAssignments) {
  if (a.startDay >= 1 && a.startDay <= 4) assert.ok(total(byId.get(a.recipeId)!)! <= 30, `weekday ${a.startDay} within 30 min`);
}
const friday = byId.get(occupant(c.plan, "Dinner", 5)!.recipeId)!;
assert.ok(["Slow braise", "Elaborate risotto", "Pasta bake"].includes(friday.title), `ambitious Friday, got ${friday.title}`);
// Per meal: the breakfast limit (10) applies to breakfasts on weekdays, not to dinners and not at the weekend.
const breakfast = toPlannerRecipes([{ ...recipe("Pancakes", 20, 3, ["Breakfast"]), tags: ["Breakfast"] }] as never)[0];
assert.equal(checkEligibility(breakfast, chef, undefined, "Breakfast", 2).eligible, false, "20-min breakfast over a 10-min weekday limit");
assert.equal(checkEligibility(breakfast, chef, undefined, "Breakfast", 6).eligible, true, "no limit on Saturday");
assert.equal(checkEligibility(breakfast, chef, undefined, "Dinner", 2).eligible, true, "the breakfast limit does not apply to dinner");
const quickFriday = byId.get(occupant(q.plan, "Dinner", 5)!.recipeId)!;
assert.ok(total(quickFriday)! <= 30, "Quick & easy Friday stays simple");

// 3. Gluten-free: the same rule for suggestions, swaps and Home; missing tag = not suitable.
const gf = settingsWith(s => { s.dietary.diets = ["glutenFree"]; s.setup.evenings = 5; });
const untagged = catalog.find(r => r.title === "Untagged soup")!;
assert.equal(checkEligibility(untagged, gf).eligible, false, "clean ingredients without the tag are not enough");
assert.equal(checkEligibility(untagged, settingsWith(s => { s.dietary.allergies = ["gluten"]; })).eligible, false, "same for the gluten allergy");
const g = suggestWeek(empty(), catalog, gf, "2026-11-16");
const ok = (id: string) => byId.get(id)!.tags.some(t => t.toLowerCase().replace(/[\s_-]/g, "") === "glutenfree");
assert.ok(g.plan.planAssignments.every(a => ok(a.recipeId)));
const day = g.plan.planAssignments[0].startDay;
const swapped = swapDinner(g.plan, catalog, gf, day, "2026-11-16");
assert.ok(!swapped || ok(swapped.recipe.id), "swap stays gluten-free");
// Home uses checkEligibility with the meal and today: same answer.
assert.ok(catalog.filter(r => checkEligibility(r, gf, undefined, "Dinner", 2).eligible).every(r => ok(r.id)));

// 4. Swap changes only that slot; groceries come from scheduled meals only, scaled to their servings.
const s4 = swapDinner(q.plan, catalog, quick, 5, "2026-11-16")!;
assert.ok(s4, "an alternative exists");
const before = q.plan.planAssignments.filter(a => a.startDay !== 5), after = s4.plan.planAssignments.filter(a => a.startDay !== 5);
assert.deepEqual(after, before, "other evenings unchanged");
assert.notEqual(occupant(s4.plan, "Dinner", 5)!.recipeId, occupant(q.plan, "Dinner", 5)!.recipeId);
const declined = occupant(q.plan, "Dinner", 5)!.recipeId;
const shortlisted: PlanState = { ...s4.plan, selectedIds: [...s4.plan.selectedIds, declined, "r7"] };
const rows = buildRecipeGroceryRows(shortlisted, catalog);
const titles = new Set([...rows.values()].flatMap(r => r.recipes));
assert.ok(!titles.has(byId.get(declined)!.title) && !titles.has("Pasta bake"), "declined and shortlisted-only recipes add nothing");
const rice = [...rows.values()].find(r => r.ingredient.endsWith("rice"));
const riceMeals = s4.plan.planAssignments.filter(a => byId.get(a.recipeId)!.ingredients.includes("200 g rice")).length;
assert.equal(rice?.ingredient, `${200 * 5 / 4 * riceMeals} g rice`, "scaled from 4 to 5 servings per meal");

// 5. Re-suggesting keeps dinners the person placed and replaces only the earlier unapproved suggestion.
const manual: PlanState = { selectedIds: ["r7"], planAssignments: [{ recipeId: "r7", mealType: "Dinner", startDay: 5, spanDays: 1 }] };
const kept = suggestWeek(manual, catalog, quick, "2026-11-16");
assert.equal(occupant(kept.plan, "Dinner", 5)!.recipeId, "r7", "a placed dinner is never replaced");
const again = suggestWeek(kept.plan, catalog, { ...quick, setup: { ...quick.setup, suggested: kept.suggested } }, "2026-11-16");
assert.equal(again.plan.planAssignments.length, kept.plan.planAssignments.length, "no duplicated dinners");

// 6. Too few matches: evenings stay open, with the reason; restrictions are never relaxed.
const none = settingsWith(s => { s.dietary.diets = ["vegan"]; s.setup.evenings = 3; });
const v = suggestWeek(empty(), catalog, none, "2026-11-16");
assert.equal(v.plan.planAssignments.length, 0);
assert.equal(v.open.length, 3);
assert.ok(v.open.every(o => o.reason === "noMatch" && o.excluded.length > 0));
const two = settingsWith(s => { s.dietary.diets = ["vegetarian"]; s.setup.evenings = 3; });
const w = suggestWeek(empty(), catalog, two, "2026-11-16");
assert.equal(w.plan.planAssignments.length, 1, "only one vegetarian dinner");
assert.ok(w.open.every(o => o.reason === "allUsed"));
assert.equal(openEvening(catalog, two, 3, new Set()), null, "an evening left open on purpose has no warning");

// 7. First visit only for people with nothing yet.
assert.equal(needsHouseholdSetup(defaultSettings(), empty()), true);
assert.equal(needsHouseholdSetup({ ...defaultSettings(), rev: 3 }, empty()), false);
assert.equal(needsHouseholdSetup(defaultSettings(), manual), false);

// The full week: 7 days × Breakfast, Lunch, Dinner from a catalog with every meal type.
{
  const meal = (type: string, title: string, tags: string[] = []) => ({ ...(recipe(title, 20, 3, tags) as object), tags: [type, ...tags] }) as never;
  const full = toPlannerRecipes([
    ...["Oats", "Eggs", "Toast", "Yogurt"].map(t => meal("Breakfast", t, ["Vegetarian"])),
    ...["Soup", "Salad", "Wrap"].map(t => meal("Lunch", t, ["Vegetarian"])),
    ...catalog.map(r => ({ ...r, steps: Array.from({ length: r.stepCount ?? 1 }, () => "x"), tags: r.tags })) as never[],
  ] as never);
  const settings = settingsWith(s => { s.household.servingsMode = "fixed"; s.household.fixedServings = 3; });
  const p = proposeWeek(empty(), full, settings, "2026-11-16");
  assert.equal(plannedSlotCount(p.plan), totalSlots, "21 meals");
  assert.equal(p.open.length, 0);
  assert.ok(p.plan.proposed && p.plan.planAssignments.every(a => a.servings === 3 && full.find(r => r.id === a.recipeId)!.mealType === a.mealType));
  const breakfasts = p.plan.planAssignments.filter(a => a.mealType === "Breakfast").map(a => a.recipeId);
  assert.equal(new Set(breakfasts).size, 4, "every breakfast used before one repeats");
  assert.ok(Math.max(...[...new Set(breakfasts)].map(id => breakfasts.filter(b => b === id).length)) <= 2, "repeats are spread");
  assert.deepEqual(proposeWeek(empty(), full, settings, "2026-11-16").plan, p.plan, "deterministic");
  // A partial draft keeps its meals and only fills the gaps.
  const partial: PlanState = { selectedIds: [], planAssignments: [{ recipeId: catalog[4].id, mealType: "Dinner", startDay: 3, spanDays: 1, servings: 7 }] };
  const filled = proposeWeek(partial, full, settings, "2026-11-16").plan;
  assert.equal(plannedSlotCount(filled), totalSlots);
  assert.deepEqual(filled.planAssignments[0], partial.planAssignments[0]);
  // Restrictions are never relaxed: a vegetarian household with no vegetarian lunch would get empty lunches. Here lunches are
  // vegetarian, dinners mostly not: only the tagged vegetarian dinner (Carrot soup) can be planned, and it repeats.
  const veg = proposeWeek(empty(), full, settingsWith(s => { s.dietary.diets = ["vegetarian"]; }), "2026-11-16");
  const vegDinners = veg.plan.planAssignments.filter(a => a.mealType === "Dinner");
  assert.equal(vegDinners.length, 7);
  assert.ok(vegDinners.every(a => full.find(r => r.id === a.recipeId)!.title === "Carrot soup"));
  const noLunch = proposeWeek(empty(), full.filter(r => r.mealType !== "Lunch"), settings, "2026-11-16");
  assert.equal(noLunch.open.length, 7);
  assert.ok(noLunch.open.every(slot => slot.meal === "Lunch"), "lunches without an eligible recipe stay open");
  // Filters narrow the choice, but a slot no recipe passes falls back to the restrictions alone.
  const fitsOats = (r: PlannerRecipe) => r.title === "Oats" || r.mealType !== "Breakfast";
  const narrowed = proposeWeek(empty(), full, settings, "2026-11-16", fitsOats).plan;
  assert.ok(narrowed.planAssignments.filter(a => a.mealType === "Breakfast").every(a => full.find(r => r.id === a.recipeId)!.title === "Oats"));
  assert.equal(plannedSlotCount(proposeWeek(empty(), full, settings, "2026-11-16", () => false).plan), totalSlots);
}

// Optional: the real catalog (scenarios 1–3).
if (process.env.CATALOG_URL) {
  const real = toPlannerRecipes(await (await fetch(`${process.env.CATALOG_URL}/api/recipes`)).json());
  const ids = new Map(real.map(r => [r.id, r]));
  const show = (label: string, plan: PlanState) => console.log(label, plan.planAssignments.map(a => `${a.startDay}:${ids.get(a.recipeId)!.title} (${total(ids.get(a.recipeId)!)} min, ${a.servings ?? "-"} sv)`).join(" | "));
  const rq = suggestWeek(empty(), real, quick, "2026-11-16"); show("quick", rq.plan);
  assert.equal(rq.plan.planAssignments.length, 3); assert.ok(dinnerDays(rq.plan).includes(5));
  const rc = suggestWeek(empty(), real, chef, "2026-11-16"); show("chef", rc.plan);
  for (const a of rc.plan.planAssignments) if (a.startDay >= 1 && a.startDay <= 4) assert.ok(total(ids.get(a.recipeId)!)! <= 30);
  const rg = suggestWeek(empty(), real, gf, "2026-11-16"); show("gluten-free", rg.plan);
  assert.ok(rg.plan.planAssignments.every(a => ok2(ids.get(a.recipeId)!)));
  console.log("dinners in catalog:", real.filter(r => r.mealType === "Dinner").length,
    "| gluten-free eligible:", real.filter(r => r.mealType === "Dinner" && checkEligibility(r, gf).eligible).length,
    "| vegan:", real.filter(r => r.mealType === "Dinner" && checkEligibility(r, none).eligible).length,
    "| dairy-free:", real.filter(r => r.mealType === "Dinner" && checkEligibility(r, settingsWith(s => { s.dietary.diets = ["dairyFree"]; })).eligible).length,
    "| vegetarian:", real.filter(r => r.mealType === "Dinner" && checkEligibility(r, two).eligible).length);
}
if (process.env.CATALOG_URL) {
  const real = toPlannerRecipes(await (await fetch(`${process.env.CATALOG_URL}/api/recipes`)).json());
  const p = proposeWeek(empty(), real, defaultSettings(), "2026-11-16");
  assert.equal(plannedSlotCount(p.plan), totalSlots, "real catalog: 21 meals");
  console.log("real catalog: distinct recipes in the proposed week:", new Set(p.plan.planAssignments.map(a => a.recipeId)).size);
}
function ok2(r: PlannerRecipe) { return r.tags.some(t => t.toLowerCase().replace(/[\s_-]/g, "") === "glutenfree"); }
console.log("week suggestions: ok");
