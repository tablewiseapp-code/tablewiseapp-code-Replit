import assert from "node:assert/strict";
import { addToPlan, checkAdd, moveOrSwap, moveTo, occupant, setRecipeAt, plannedSlotCount, removeAt, repeatOn, setServingsAt, totalSlots, type PlanState } from "../client/src/lib/meal-plan";

const empty = (): PlanState => ({ selectedIds: ["a", "b"], planAssignments: [] });

// Assign to all 7 days x 3 meals; the same recipe can fill many slots.
let plan = empty();
for (let day = 0; day < 7; day++) for (const meal of ["Breakfast", "Lunch", "Dinner"] as const) plan = addToPlan(plan, { recipeId: "a", day, meal });
assert.equal(plannedSlotCount(plan), totalSlots);

// Occupied slot: never overwritten without replace.
plan = addToPlan(empty(), { recipeId: "a", day: 1, meal: "Dinner" });
assert.equal(addToPlan(plan, { recipeId: "b", day: 1, meal: "Dinner" }), plan);
assert.equal(checkAdd(plan, { recipeId: "b", day: 1, meal: "Dinner" }).status, "conflict");
assert.equal(occupant(addToPlan(plan, { recipeId: "b", day: 1, meal: "Dinner" }, true), "Dinner", 1)?.recipeId, "b");
assert.equal(addToPlan(plan, { recipeId: "a", day: 1, meal: "Dinner" }), plan, "no duplicate in the same slot");

// Repeat: fills free slots only, reports skipped, keeps servings, leaves occupied slots alone.
const rep = repeatOn(addToPlan(plan, { recipeId: "b", day: 2, meal: "Dinner" }), "a",
  [{ day: 1, meal: "Dinner" }, { day: 2, meal: "Dinner" }, { day: 3, meal: "Dinner" }], 4);
assert.deepEqual([rep.added, rep.skipped], [1, 2]);
assert.equal(occupant(rep.plan, "Dinner", 2)?.recipeId, "b");
assert.equal(occupant(rep.plan, "Dinner", 3)?.servings, 4);

// Remove one occurrence without touching the others; the recipe stays shortlisted.
const two = repeatOn(plan, "a", [{ day: 4, meal: "Dinner" }], null).plan;
const removed = removeAt(two, "Dinner", 1);
assert.equal(plannedSlotCount(removed), 1);
assert.ok(occupant(removed, "Dinner", 4));
assert.deepEqual(removed.selectedIds, two.selectedIds);
assert.equal(removeAt(removed, "Lunch", 0), removed, "removing an empty slot changes nothing");

// Linked multi-day assignments (existing +/- data) stay linked on remove and move.
const span: PlanState = { selectedIds: ["a"], planAssignments: [{ recipeId: "a", mealType: "Dinner", startDay: 1, spanDays: 3 }] };
assert.equal(plannedSlotCount(span), 3);
assert.equal(plannedSlotCount(removeAt(span, "Dinner", 2)), 0);
assert.equal(moveTo(span, { day: 1, meal: "Dinner" }, { day: 5, meal: "Dinner" }), span, "span would fall off the week");
assert.equal(moveTo(span, { day: 1, meal: "Dinner" }, { day: 4, meal: "Dinner" }).planAssignments[0].startDay, 4);

// Move: free slot ok, occupied slot refused, servings preserved.
const moved = moveTo(setServingsAt(plan, "Dinner", 1, 6), { day: 1, meal: "Dinner" }, { day: 5, meal: "Lunch" });
assert.equal(occupant(moved, "Dinner", 1), null);
assert.equal(occupant(moved, "Lunch", 5)?.servings, 6);
const blocked = addToPlan(plan, { recipeId: "b", day: 5, meal: "Dinner" });
assert.equal(moveTo(blocked, { day: 1, meal: "Dinner" }, { day: 5, meal: "Dinner" }), blocked);

// Partial week and purity.
assert.equal(plannedSlotCount(plan), 1);
const frozen = JSON.stringify(plan); repeatOn(plan, "a", [{ day: 6, meal: "Lunch" }]); removeAt(plan, "Dinner", 1);
assert.equal(JSON.stringify(plan), frozen, "helpers never mutate their input");

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
// Move meal: a free target moves; an occupied one trades places, so both meals stay scheduled with their servings.
{
  const two: PlanState = { selectedIds: [], planAssignments: [
    { recipeId: "a", mealType: "Dinner", startDay: 1, spanDays: 1, servings: 6 }, { recipeId: "b", mealType: "Lunch", startDay: 3, spanDays: 1, servings: 2 }] };
  const traded = moveOrSwap(two, { day: 1, meal: "Dinner" }, { day: 3, meal: "Lunch" });
  assert.deepEqual([occupant(traded, "Lunch", 3)?.recipeId, occupant(traded, "Lunch", 3)?.servings], ["a", 6]);
  assert.deepEqual([occupant(traded, "Dinner", 1)?.recipeId, occupant(traded, "Dinner", 1)?.servings], ["b", 2]);
  assert.equal(occupant(moveOrSwap(two, { day: 1, meal: "Dinner" }, { day: 0, meal: "Breakfast" }), "Breakfast", 0)?.recipeId, "a");
  assert.equal(moveOrSwap(two, { day: 2, meal: "Dinner" }, { day: 3, meal: "Lunch" }), two, "nothing to move");
  // Swap / Choose recipe: one slot changes, its servings stay, every other slot is untouched.
  const swapped = setRecipeAt(two, { day: 3, meal: "Lunch" }, "c");
  assert.deepEqual(swapped.planAssignments, [two.planAssignments[0], { ...two.planAssignments[1], recipeId: "c" }]);
  assert.deepEqual(setRecipeAt(two, { day: 0, meal: "Lunch" }, "d", 4).planAssignments.at(-1), { recipeId: "d", mealType: "Lunch", startDay: 0, spanDays: 1, servings: 4 });
  assert.equal(setRecipeAt(two, { day: 1, meal: "Dinner" }, "a"), two);
}
console.log("weekly planner checks passed");
