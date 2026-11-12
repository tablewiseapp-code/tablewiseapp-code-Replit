import assert from "node:assert/strict";
import { addToPlan, checkAdd, moveTo, occupant, plannedSlotCount, removeAt, repeatOn, setServingsAt, totalSlots, type PlanState } from "../client/src/lib/meal-plan";

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
console.log("weekly planner checks passed");
