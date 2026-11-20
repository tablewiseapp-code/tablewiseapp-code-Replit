// The Week as a cooking plan (docs/cooking-plan.md): draft, servings math, edits, groceries, deals and legacy plans.
// Pure logic; optional real-catalog pass with CATALOG_URL=http://localhost:5000.
import assert from "node:assert/strict";
import { defaultSettings, householdCounts, type BasicSettings } from "../client/src/lib/basic-settings";
import { addBatch, approvePlan, cookedOn, emptyPlan, moveConflicts, moveCookingDay, removeBatch, restoreBatch, setServes, statusOf, swapBatch, type PlanState } from "../client/src/lib/meal-plan";
import { checkEligibility, total } from "../client/src/lib/preference-engine";
import { buildRecipeGroceryRows } from "../client/src/lib/grocery-meal-removal";
import { toPlannerRecipes, type PlannerRecipe } from "../client/src/lib/planner-recipes";
import { cookingEvenings, dishOptions, needsHouseholdSetup, proposeCookingPlan, resuggest } from "../client/src/lib/week-suggestions";
import { weekDeals, type FoodDeal } from "../client/src/lib/food-deals";
import { batchFactor, batchTotal, fromLegacy, planStatus, serveAmount, weekdayOf } from "../shared/cooking-plan";
import { baseServings } from "../client/src/lib/ingredient-scale";

const WEEK = "2026-11-16"; // Mon 16 … Sun 22
const empty = (): PlanState => emptyPlan(WEEK);
const settingsWith = (change: (s: BasicSettings) => void) => { const s = defaultSettings(); change(s); return s; };
let n = 0;
const ids = () => { let i = 0; return () => `b${++i}`; };
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
  recipe("Teriyaki chicken with rice", 30, 5, [], ["400 g chicken thighs", "200 g rice", "3 tbsp soy sauce"]),
] as never);
const byId = new Map(catalog.map(r => [r.id, r]));
const cookDays = (plan: PlanState) => plan.batches.map(b => weekdayOf(b.cookDate)).sort();
const teriyaki = catalog.find(r => r.title === "Teriyaki chicken with rice")!;

// ---- Acceptance 1: preferred days exceed the target → all are scheduled.
assert.deepEqual(cookingEvenings(settingsWith(s => { s.setup.evenings = 2; s.setup.fixedDays = [1, 3, 5]; })), [1, 3, 5], "target 2, three preferred days → all three");
// ---- Acceptance 2: target 3, Wednesday and Sunday preferred → Friday is added (farthest from both, Sun–Mon adjacent).
assert.deepEqual(cookingEvenings(settingsWith(s => { s.setup.evenings = 3; s.setup.fixedDays = [3, 0]; })), [3, 5, 0], "Wed, Fri, Sun");
// No preferred day: spread across the week; "Not sure yet" means three; more preferred days win.
assert.deepEqual(cookingEvenings(settingsWith(s => { s.setup.evenings = 2; s.setup.fixedDays = []; })), [1, 4], "Mon and Thu");
assert.equal(cookingEvenings(settingsWith(s => { s.setup.evenings = null; })).length, 3);
assert.equal(cookingEvenings(settingsWith(s => { s.setup.evenings = null; s.setup.fixedDays = [1, 2, 3, 4]; })).length, 4);

// ---- The draft: one dish per cooking day, deterministic, at the household's adults and kids.
const quick = settingsWith(s => { s.setup.style = "quick"; s.setup.evenings = 3; s.setup.fixedDays = [5];
  s.household.members = [{ kind: "adult" }, { kind: "adult" }, { kind: "child" }, { kind: "child" }, { kind: "child" }].map((m, i) =>
    ({ id: `m${i}`, name: "", diets: [], allergies: [], customAllergies: [], dislikes: [], favorites: [], portion: null, ...m }) as never); });
assert.deepEqual(householdCounts(quick), { adults: 2, kids: 3 });
const q = proposeCookingPlan(empty(), catalog, quick, WEEK, { newId: ids() });
assert.equal(q.plan.batches.length, 3);
assert.ok(cookDays(q.plan).includes(5), "Friday is scheduled");
assert.ok(q.plan.proposed && q.plan.approved === null);
assert.ok(q.plan.batches.every(b => b.serves.length === 1 && b.serves[0].date === b.cookDate && b.serves[0].adults === 2 && b.serves[0].kids === 3));
assert.equal(batchTotal(q.plan.batches[0], 4), 3.5, "two adults and three kids → 3.5 servings, half kept exactly");
assert.equal(new Set(q.plan.batches.map(b => b.recipeId)).size, 3, "no recipe repeats while others are eligible");
assert.deepEqual(proposeCookingPlan(empty(), catalog, quick, WEEK, { newId: ids() }).plan, q.plan, "stable across refreshes");
// A day that already has a dish keeps it; re-suggesting replaces only earlier suggestions.
const placed = addBatch(empty(), "r7", "2026-11-20", null, "mine");
const kept = proposeCookingPlan(placed, catalog, quick, WEEK, { newId: ids() });
assert.deepEqual(cookedOn(kept.plan, "2026-11-20").map(b => b.id), ["mine"], "a placed dish is never replaced");
const again = resuggest(kept.plan, catalog, { ...quick, setup: { ...quick.setup, suggested: kept.suggested } }, WEEK);
assert.equal(again.plan.batches.length, kept.plan.batches.length, "no duplicated dishes");
// No household counts: a new dish makes the recipe's own yield.
assert.equal(serveAmount(addBatch(empty(), "r1", "2026-11-17", null).batches[0].serves[0], 4), 4);

// ---- Restrictions: one rule (checkEligibility) for the draft and the picker; never relaxed.
const chef = settingsWith(s => { s.setup.style = "chef"; s.setup.evenings = 4; s.setup.challenge = { when: "day", day: 5 }; s.setup.weeknightMax = { Breakfast: 10, Lunch: null, Dinner: 30 }; });
const c = proposeCookingPlan(empty(), catalog, chef, WEEK);
for (const b of c.plan.batches) { const d = weekdayOf(b.cookDate); if (d >= 1 && d <= 4) assert.ok(total(byId.get(b.recipeId)!)! <= 30, `weekday ${d} within 30 min`); }
const friday = byId.get(cookedOn(c.plan, "2026-11-20")[0].recipeId)!;
assert.ok(["Slow braise", "Elaborate risotto", "Pasta bake"].includes(friday.title), `ambitious Friday, got ${friday.title}`);
const gf = settingsWith(s => { s.dietary.diets = ["glutenFree"]; s.setup.evenings = 5; });
const ok = (id: string) => byId.get(id)!.tags.some(t => t.toLowerCase().replace(/[\s_-]/g, "") === "glutenfree");
assert.equal(checkEligibility(catalog.find(r => r.title === "Untagged soup")!, gf).eligible, false, "clean ingredients without the tag are not enough");
assert.ok(proposeCookingPlan(empty(), catalog, gf, WEEK).plan.batches.every(b => ok(b.recipeId)));
assert.ok(dishOptions(catalog, gf, 2).every(r => ok(r.id)), "the picker stays gluten-free");
const vegan = settingsWith(s => { s.dietary.diets = ["vegan"]; s.setup.evenings = 3; });
assert.equal(proposeCookingPlan(empty(), catalog, vegan, WEEK).plan.batches.length, 0, "no eligible recipe → the day stays empty");
// Filters narrow the picker; when nothing passes them, the restrictions alone decide.
assert.deepEqual(dishOptions(catalog, quick, 2, { fits: r => r.title === "Carrot soup" }).map(r => r.title), ["Carrot soup"]);
assert.ok(dishOptions(catalog, quick, 2, { fits: () => false }).length > 1);

// ---- Acceptance 3: two dishes on a day; swapping one leaves the other; moving onto a day with one dish → three.
let plan = addBatch(addBatch(addBatch(empty(), "r1", "2026-11-18", null, "w1"), "r2", "2026-11-18", null, "w2"), "r3", "2026-11-17", null, "t1");
assert.equal(cookedOn(plan, "2026-11-18").length, 2, "two dishes, one cooking day");
const swapped = swapBatch(plan, "w1", "r4");
assert.deepEqual(cookedOn(swapped, "2026-11-18").map(b => b.recipeId), ["r4", "r2"], "only the chosen dish changes");
assert.deepEqual(swapped.batches.find(b => b.id === "w1")!.serves, plan.batches.find(b => b.id === "w1")!.serves, "dates and portions stay");
const merged = moveCookingDay(swapped, "2026-11-18", "2026-11-17", {}, () => 0)!;
assert.deepEqual(cookedOn(merged, "2026-11-17").map(b => b.id), ["t1", "w1", "w2"], "a group of three, existing dish first");
assert.deepEqual(merged.batches.find(b => b.id === "w1")!.serves.map(s => s.date), ["2026-11-18"], "serving dates that stay valid are kept");
// Later: each dish's own cooking-day portions would come before the new day, so they are resolved first.
const later = moveCookingDay(swapped, "2026-11-18", "2026-11-20", { "w1:2026-11-18": "move", "w2:2026-11-18": "move" }, () => 2)!;
assert.deepEqual(cookedOn(later, "2026-11-20").map(b => b.serves), [[{ date: "2026-11-20", servings: 2 }], [{ date: "2026-11-20", servings: 2 }]]);
// Remove dish touches only that entry, including another batch of the same recipe; Undo restores it in place.
const twice = addBatch(plan, "r1", "2026-11-21", null, "again");
const removed = removeBatch(twice, "w1");
assert.deepEqual(removed.batches.map(b => b.id), ["w2", "t1", "again"]);
assert.deepEqual(restoreBatch(removed, twice.batches[0], 0), twice);

// ---- Acceptance 4: Sunday cooking covers Tuesday (next week). Yield 4, 400 g chicken; 2 adults + 3 kids on both dates.
plan = addBatch(empty(), teriyaki.id, "2026-11-22", householdCounts(quick), "sun");
plan = setServes(plan, "sun", [{ date: "2026-11-22", adults: 2, kids: 3 }, { date: "2026-11-24", adults: 2, kids: 3 }]);
const sun = plan.batches[0];
assert.equal(batchTotal(sun, baseServings(teriyaki.servings)), 7, "Make 7 servings");
assert.equal(statusOf(plan), "draft");
assert.equal(buildRecipeGroceryRows(plan.approved ?? [], catalog).size, 0, "a draft adds nothing to Groceries");
let approved = approvePlan(plan);
assert.equal(statusOf(approved), "approved");
const chicken = (p: PlanState) => [...buildRecipeGroceryRows(p.approved ?? [], catalog).values()].find(r => r.ingredient.endsWith("chicken thighs"))?.ingredient;
assert.equal(chicken(approved), "700 g chicken thighs", "approval contributes 700 g once");
assert.equal(chicken(approvePlan(approvePlan(approved))), "700 g chicken thighs", "approving again changes nothing");
const edited = setServes(approved, "sun", [{ date: "2026-11-22", adults: 2, kids: 3 }]);
assert.equal(statusOf(edited), "changed", "an edit after approval waits for Save changes");
assert.equal(chicken(edited), "700 g chicken thighs", "Groceries keep the approved amount until saved");
approved = approvePlan(edited);
assert.equal(chicken(approved), "350 g chicken thighs", "Save changes → 350 g");
// Another dish's contribution stays when this one changes.
const withRice = approvePlan(addBatch(approved, "r1", "2026-11-17", null, "rice"));
const riceRow = (p: PlanState) => [...buildRecipeGroceryRows(p.approved ?? [], catalog).values()].find(r => r.ingredient.endsWith(" rice"))?.ingredient;
assert.equal(riceRow(withRice), `${200 * 3.5 / 4 + 200} g rice`, "each dish counts with its own scale");
assert.equal(chicken(approvePlan(removeBatch(withRice, "sun"))), undefined, "removing a dish removes only its contribution");
assert.equal(riceRow(approvePlan(removeBatch(withRice, "sun"))), "200 g rice");
// Direct amounts in half servings replace adults and kids; a missing yield is asked for (and then used).
const half = setServes(plan, "sun", [{ date: "2026-11-22", servings: 2.5 }, { date: "2026-11-23", adults: 1, kids: 1 }]);
assert.equal(batchTotal(half.batches[0], 4), 4);
assert.equal(batchFactor({ ...sun }, null), null, "no yield → no scale until asked");
assert.equal(batchFactor({ ...sun, yield: 2 }, null), 3.5);

// ---- Acceptance 5: a move that conflicts with serving dates. Weeks run Monday–Sunday, so "Sunday → Monday" crosses
// into the next week; the same rule shown inside one week: Wednesday cooking for Wed and Fri, moved to Thursday.
let wed = approvePlan(setServes(addBatch(empty(), teriyaki.id, "2026-11-18", null, "wed"), "wed", [{ date: "2026-11-18", adults: 2, kids: 3 }, { date: "2026-11-20", adults: 2, kids: 3 }]));
assert.deepEqual(moveConflicts(wed, "2026-11-18", "2026-11-19"), [{ batchId: "wed", date: "2026-11-18" }], "Wednesday's portions are flagged");
const amount = (b: typeof sun, s: typeof sun.serves[0]) => serveAmount(s, 4);
assert.equal(moveCookingDay(wed, "2026-11-18", "2026-11-19", {}, amount), null, "nothing moves until each portion is resolved");
assert.equal(chicken(wed), "700 g chicken thighs", "cancel: plan and groceries unchanged");
const movedOn = moveCookingDay(wed, "2026-11-18", "2026-11-19", { "wed:2026-11-18": "move" }, amount)!;
assert.deepEqual(movedOn.batches[0].serves, [{ date: "2026-11-19", servings: 3.5 }, { date: "2026-11-20", adults: 2, kids: 3 }]);
const dropped = moveCookingDay(wed, "2026-11-18", "2026-11-19", { "wed:2026-11-18": "remove" }, amount)!;
assert.equal(batchTotal(dropped.batches[0], 4), 3.5);
assert.equal(moveCookingDay(setServes(wed, "wed", [{ date: "2026-11-18", servings: 2 }]), "2026-11-18", "2026-11-19", { "wed:2026-11-18": "remove" }, amount), null,
  "a dish left with no serving date blocks the move");

// ---- Acceptance 6: deals appear only when an offer applies; offers for planned dishes come first.
const deals: FoodDeal[] = [
  { id: "beef", category: "protein", store: "A", price: "$4.99", unit: "lb", terms: ["ground beef"] },
  { id: "thighs", category: "protein", store: "B", price: "$3.49", unit: "lb", terms: ["chicken thigh", "chicken thighs"], expires: "2026-11-30" },
  { id: "old", category: "produce", store: "C", price: "$1", unit: "lb", terms: ["carrot"], expires: "2026-11-01" },
];
assert.deepEqual(weekDeals([], WEEK, []), [], "zero offers → no row");
const offers = weekDeals(deals, WEEK, [teriyaki]);
assert.deepEqual(offers.map(o => [o.deal.id, o.dish]), [["thighs", teriyaki.title], ["beef", null]], "matching offer first; expired one hidden");
assert.deepEqual(weekDeals(deals, WEEK, [teriyaki], ["a"]).map(o => o.deal.id), ["beef"], "only My stores when chosen");
assert.deepEqual(weekDeals(deals, WEEK, [teriyaki], ["Elsewhere"]), [], "no offer from my stores → no row");

// ---- Plans saved before cooking days become dated dishes; a locked one stays approved (server/week-plans.ts).
const legacy = fromLegacy(WEEK, [{ recipeId: "r1", mealType: "Dinner", startDay: 0, spanDays: 1, servings: 4 }, { recipeId: "r2", mealType: "Lunch", startDay: 3, spanDays: 2 }]);
assert.deepEqual(legacy, [
  { id: "legacy-0", recipeId: "r1", cookDate: "2026-11-22", serves: [{ date: "2026-11-22", servings: 4 }] },
  { id: "legacy-1", recipeId: "r2", cookDate: "2026-11-18", serves: [{ date: "2026-11-18" }, { date: "2026-11-19" }] },
]);
assert.equal(planStatus(legacy, JSON.parse(JSON.stringify(legacy))), "approved");

// First visit only for people with nothing yet.
assert.equal(needsHouseholdSetup(defaultSettings(), empty()), true);
assert.equal(needsHouseholdSetup({ ...defaultSettings(), rev: 3 }, empty()), false);
assert.equal(needsHouseholdSetup(defaultSettings(), placed), false);

if (process.env.CATALOG_URL) {
  const real = toPlannerRecipes(await (await fetch(`${process.env.CATALOG_URL}/api/recipes`)).json());
  const names = new Map(real.map(r => [r.id, r]));
  for (const [label, s] of [["quick", quick], ["chef", chef], ["gluten-free", gf]] as const) {
    const p = proposeCookingPlan(empty(), real, s, WEEK).plan;
    console.log(label, p.batches.map(b => `${b.cookDate}:${names.get(b.recipeId)!.title}`).join(" | "));
  }
}
console.log("week suggestions: ok");
