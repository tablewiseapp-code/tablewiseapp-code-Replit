import assert from "node:assert/strict";
import { addBatch, emptyPlan, moveCookingDay, removeBatch, setServes, swapBatch } from "../client/src/lib/meal-plan";

// Cooking-plan edits are pure (the full rules are in test-week-suggestions.ts).
const plan = addBatch(emptyPlan("2026-11-16"), "a", "2026-11-17", { adults: 2, kids: 0 }, "x");
const frozen = JSON.stringify(plan);
swapBatch(plan, "x", "b"); setServes(plan, "x", [{ date: "2026-11-18", servings: 3 }]); removeBatch(plan, "x");
moveCookingDay(plan, "2026-11-17", "2026-11-16", {}, () => 1);
assert.equal(JSON.stringify(plan), frozen, "helpers never mutate their input");
assert.equal(swapBatch(plan, "x", "a"), plan, "swapping in the same recipe changes nothing");
assert.equal(addBatch(emptyPlan(), "a", "2026-11-17", null, "y").batches[0].serves[0].date, "2026-11-17");

// "For Mon–Wed & Fri": serving dates as runs of consecutive days, sorted, across a month end.
{
  const { dateRuns } = await import("../shared/cooking-plan");
  assert.deepEqual(dateRuns(["2026-11-23"]), [["2026-11-23"]]);
  assert.deepEqual(dateRuns(["2026-11-25", "2026-11-23"]), [["2026-11-23"], ["2026-11-25"]], "separate days");
  assert.deepEqual(dateRuns(["2026-11-30", "2026-12-01", "2026-11-29", "2026-12-03"]), [["2026-11-29", "2026-11-30", "2026-12-01"], ["2026-12-03"]]);
  assert.deepEqual(dateRuns([]), []);
}

// Recipe pagination: 12 per page, no duplicates or gaps, clamped page.
{
  const { paginate, pageNumbers } = await import("../client/src/lib/planner-filters");
  const list = (n: number) => Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(paginate([], 1), { items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  assert.deepEqual([paginate(list(1), 1).items, paginate(list(1), 1).pageCount], [[0], 1]);
  assert.equal(paginate(list(12), 1).pageCount, 1);
  assert.deepEqual([paginate(list(13), 2).items, paginate(list(13), 2).from, paginate(list(13), 2).to], [[12], 13, 13]);
  const many = list(84), seen = [];
  for (let p = 1; p <= paginate(many, 1).pageCount; p++) seen.push(...paginate(many, p).items);
  assert.deepEqual(seen, many);
  assert.deepEqual([paginate(many, 2).from, paginate(many, 2).to, paginate(many, 2).total], [13, 24, 84]);
  assert.equal(paginate(list(13), 9).page, 2, "page clamps when results shrink");
  assert.deepEqual(pageNumbers(5, 9), [1, null, 4, 5, 6, null, 9]);
  assert.deepEqual(pageNumbers(1, 2), [1, 2]);
}
// Week → Plan filters: deal ingredient, explicit-tag diets, nutrition thresholds, and what AI generation receives.
{
  const { matchesPlannerFilters, mealsGenerationFilters } = await import("../client/src/lib/planner-filters");
  const none = { maxMinutes: 30, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false, modifiedByMe: false,
    myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [] };
  const meta = { isMyPick: false, rating: null };
  const recipe = (ingredients: string[], tags: string[] = [], extra = {}) => ({ tags, ingredients, mealType: "Dinner", tools: ["Oven"], sourceType: "",
    proteinType: "", hasNotes: false, modifiedByMe: false, servingsRange: "3-4", prepTime: 10, cookTime: 15, servings: "4", ...extra });
  const ok = (r: ReturnType<typeof recipe>, f: object) => matchesPlannerFilters(r, { ...none, ...f }, "total", meta);
  const thighs = recipe(["8 boneless chicken thighs", "1 onion"], ["glutenFree", "kidFriendly"]);
  const mince = recipe(["500 g lean beef mince"]);
  assert.ok(ok(thighs, { deal: "chicken-thighs" }) && !ok(mince, { deal: "chicken-thighs" }) && ok(mince, { deal: "ground-beef" }));
  assert.ok(!ok(recipe(["2 chicken breasts"]), { deal: "chicken-thighs" }), "a chicken-thigh deal needs chicken thighs");
  assert.ok(ok(thighs, { deal: "chicken-thighs", dietary: ["Gluten-free", "Kid friendly"] }) && !ok(thighs, { dietary: ["Dairy-free"] }));
  assert.ok(!ok(thighs, { dietary: ["Halal"] }) && ok(recipe([], ["Halal"]), { dietary: ["Halal"] }), "religious needs an explicit tag");
  assert.ok(!ok(thighs, { cookingLevel: "easy" }) && ok(recipe([], ["level:easy"]), { cookingLevel: "easy" }));
  assert.ok(!ok(recipe(["x"], [], { prepTime: 20, cookTime: 15 }), {}), "default ≤30 uses total time");
  const totals = { caloriesKcal: 1600, proteinG: 120, carbsG: 60, fatG: 40, fiberG: 30, sugarG: 10 };
  const nutrition = { version: 1, source: "ai-estimate", model: "m", analyzedAt: "", inputHash: "", assumptions: ["a"], totals };
  const lean = recipe(["x"], [], { nutrition });
  assert.ok(ok(lean, { dietary: ["High-protein", "Low-carb", "Lower-calorie", "High-fibre"] }), "30 g protein, 15 g carbs, 400 kcal, 7.5 g fibre per serving");
  assert.ok(!ok(recipe(["x"], [], { nutrition, servings: "2" }), { dietary: ["Low-carb"] }) && !ok(recipe(["x"]), { dietary: ["High-protein"] }));
  const sent = mealsGenerationFilters({ ...none, dietary: ["Gluten-free", "Halal"], deal: "ground-beef", cookingLevel: "easy" });
  assert.deepEqual(sent.filters.dietary, ["Gluten-free"]);
  assert.deepEqual(sent.notApplied, ["dietary", "cookingLevel", "deal"]);
}
{
  const { currentMeal } = await import("../shared/cooking-plan");
  const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
  assert.deepEqual([at(7), at(10, 59), at(11), at(12, 30), at(15, 59), at(16), at(23)].map(currentMeal),
    ["Breakfast", "Breakfast", "Lunch", "Lunch", "Lunch", "Dinner", "Dinner"]);
}
console.log("weekly planner checks passed");
