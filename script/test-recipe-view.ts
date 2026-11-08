import assert from "node:assert/strict";
import { baseServings, formatQuantity, scaleIngredient, servingFactor } from "../client/src/lib/ingredient-scale";
import { cleanStep, stepDuration } from "../client/src/lib/recipe-steps";
import { addToPlan, checkAdd, maxPlannedRecipes, plannedServingsFactor, type PlanState } from "../client/src/lib/meal-plan";
import { ingredientRows, ingredientSections, readIngredientView, saveIngredientView, ingredientViewKey } from "../client/src/lib/ingredient-view";
import * as cooking from "../client/src/lib/cooking-session";
import * as timer from "../client/src/lib/step-timer";
import { isMockNutrition, usableNutrition, type RecipeNutrition } from "../shared/recipe-nutrition";

// Scaling: halve, double, fractions, decimals, ranges, unparseable text.
const original = ["400 g canned chopped tomatoes", "2 tbsp sunflower oil", "6 boneless skinless chicken thighs", "1 thumb-sized piece ginger, grated",
  "1/2 tsp salt", "1 1/2 cups rice", "0.5 kg flour", "2-3 garlic cloves", "½ lemon", "Salt, to taste", "1 x 400 g tin", "a handful of coriander"];
const copy = [...original];
const half = original.map(item => scaleIngredient(item, 0.5));
assert.deepEqual(half.slice(0, 3), ["200 g canned chopped tomatoes", "1 tbsp sunflower oil", "3 boneless skinless chicken thighs"]);
assert.equal(half[3], "1/2 thumb-sized piece ginger, grated");
assert.equal(half[4], "1/4 tsp salt");
assert.equal(half[5], "3/4 cups rice");
assert.equal(half[6], "1/4 kg flour");
assert.equal(half[7], "1–1 1/2 garlic cloves");
assert.equal(half[8], "1/4 lemon");
assert.deepEqual(half.slice(9), ["Salt, to taste", "1 x 400 g tin", "a handful of coriander"], "unparseable lines keep the original text");
assert.equal(scaleIngredient("2 tbsp sunflower oil", 2), "4 tbsp sunflower oil");
assert.equal(scaleIngredient("1/3 cup milk", 3), "1 cup milk");
assert.equal(scaleIngredient("2 tbsp oil", 1), "2 tbsp oil");
assert.equal(scaleIngredient("2 tbsp oil", 0), "2 tbsp oil");
assert.equal(scaleIngredient("2 tbsp oil", NaN), "2 tbsp oil");
assert.equal(formatQuantity(2.5), "2 1/2");
assert.equal(formatQuantity(12.4), "12");
assert.deepEqual(original, copy, "scaling never mutates the recipe");
assert.equal(baseServings("4"), 4); assert.equal(baseServings("4 servings"), 4); assert.equal(baseServings("12 muffins"), 12);
assert.equal(baseServings("4-6"), 4); assert.equal(baseServings(null), null); assert.equal(baseServings("a bowl"), null);
assert.equal(servingFactor(4, 4), 1); assert.equal(servingFactor(2, 4), 0.5); assert.equal(servingFactor(3, null), 1);

// Steps: single numbering, durations only when stated.
assert.equal(cleanStep("1. Chop the onion."), "Chop the onion.");
assert.equal(cleanStep("2) Stir"), "Stir"); assert.equal(cleanStep("Step 3: Serve"), "Serve");
assert.equal(cleanStep("Heat 2 tbsp oil."), "Heat 2 tbsp oil."); assert.equal(cleanStep("350 g pasta, boiled"), "350 g pasta, boiled");
assert.equal(stepDuration("Serve with rice."), null);
assert.deepEqual({ min: stepDuration("Simmer for 25–30 minutes.")!.min, max: stepDuration("Simmer for 25–30 minutes.")!.max }, { min: 25, max: 30 });
assert.equal(stepDuration("Cook for 5 minutes.")!.provenance, "source");
assert.equal(stepDuration("Stir 1 minute, then fry 5 minutes."), null, "two durations are ambiguous: omit");

// Nutrition: placeholder data is never usable.
const nutrition = (model: string, assumptions: string[]): RecipeNutrition => ({
  version: 1, source: "ai-estimate", model, analyzedAt: "2026-11-01T12:00:00.000Z", inputHash: "a".repeat(64), assumptions,
  totals: { caloriesKcal: 400, proteinG: 30, carbsG: 20, fatG: 10, fiberG: 2, sugarG: 3 },
});
const mock = nutrition("mock-data", ["MOCK DATA: placeholder values, not analyzed. To be calculated with AI."]);
const real = nutrition("replit-assisted-analysis", ["Chicken counted without skin."]);
assert.equal(isMockNutrition(mock), true); assert.equal(usableNutrition(mock), null);
assert.equal(isMockNutrition(nutrition("other", ["placeholder values"])), true);
assert.equal(usableNutrition(real), real); assert.equal(usableNutrition(null), null);

// Planner: free slot, duplicate, conflict (explicit replace only), full plan, servings, spans.
const empty: PlanState = { selectedIds: [], planAssignments: [] };
const free = addToPlan(empty, { recipeId: "a", day: 2, meal: "Dinner", servings: 6 });
assert.deepEqual(free.planAssignments, [{ recipeId: "a", mealType: "Dinner", startDay: 2, spanDays: 1, servings: 6 }]);
assert.deepEqual(free.selectedIds, ["a"]); assert.deepEqual(empty, { selectedIds: [], planAssignments: [] }, "input plan is not mutated");
assert.equal(checkAdd(free, { recipeId: "a", day: 2, meal: "Dinner" }).status, "same");
assert.equal(addToPlan(free, { recipeId: "a", day: 2, meal: "Dinner" }), free);
assert.equal(checkAdd(free, { recipeId: "b", day: 2, meal: "Dinner" }).status, "conflict");
assert.equal(addToPlan(free, { recipeId: "b", day: 2, meal: "Dinner" }), free, "never overwrites without replace");
const replaced = addToPlan(free, { recipeId: "b", day: 2, meal: "Dinner" }, true);
assert.deepEqual(replaced.planAssignments.map(a => a.recipeId), ["b"]); assert.deepEqual(replaced.selectedIds, ["b"]);
assert.equal(checkAdd(free, { recipeId: "b", day: 2, meal: "Lunch" }).status, "free");
const spanned: PlanState = { selectedIds: ["a"], planAssignments: [{ recipeId: "a", mealType: "Dinner", startDay: 1, spanDays: 3 }] };
assert.equal(checkAdd(spanned, { recipeId: "b", day: 3, meal: "Dinner" }).status, "conflict", "a multi-day span occupies its days");
assert.equal(checkAdd(spanned, { recipeId: "b", day: 4, meal: "Dinner" }).status, "free");
const keep = { ...free, other: { x: 1 } } as PlanState;
assert.deepEqual((addToPlan(keep, { recipeId: "b", day: 0, meal: "Lunch" }) as PlanState & { other: unknown }).other, { x: 1 }, "unrelated planner state is preserved");
const full: PlanState = { selectedIds: Array.from({ length: maxPlannedRecipes }, (_, i) => `r${i}`), planAssignments: [] };
assert.equal(checkAdd(full, { recipeId: "new", day: 0, meal: "Lunch" }).status, "full");
assert.equal(addToPlan(full, { recipeId: "new", day: 0, meal: "Lunch" }), full);
assert.equal(checkAdd(full, { recipeId: "r1", day: 0, meal: "Lunch" }).status, "free", "an already-selected recipe fits a full plan");

// Grocery integration: planned servings scale what the grocery list shows.
assert.equal(plannedServingsFactor(free.planAssignments, "a", 4), 1.5);
assert.equal(plannedServingsFactor(free.planAssignments, "a", null), 1);
assert.equal(plannedServingsFactor([{ recipeId: "a", mealType: "Lunch", startDay: 0, spanDays: 1 }], "a", 4), 1, "no servings chosen: unchanged");
assert.equal(plannedServingsFactor([...free.planAssignments, { recipeId: "a", mealType: "Lunch", startDay: 0, spanDays: 1, servings: 8 }], "a", 4), 2);
assert.equal(scaleIngredient("400 g canned tomatoes", plannedServingsFactor(free.planAssignments, "a", 4)), "600 g canned tomatoes");

// Ingredient view: order preserved, category is presentation only, ids stable across scaling/views, duplicates distinct.
const stored = ["1 onion, thinly sliced", "6 boneless skinless chicken thighs", "2 tbsp sunflower oil", "1 onion, thinly sliced", "a pinch of mystery", "100 g Greek yogurt"];
const snapshot = [...stored];
const rows = ingredientRows(stored, stored);
const flat = ingredientSections(rows, "order");
assert.equal(flat.length, 1); assert.equal(flat[0].category, null);
assert.deepEqual(flat[0].rows.map(r => r.text), stored, "Recipe Order keeps stored sequence, no headings");
const byCategory = ingredientSections(rows, "category");
assert.deepEqual(byCategory.map(s => s.category), ["protein", "dairy", "fats", "vegetables", "other"].sort((a, b) => ["protein", "carbs", "vegetables", "dairy", "fats", "seasonings", "other"].indexOf(a) - ["protein", "carbs", "vegetables", "dairy", "fats", "seasonings", "other"].indexOf(b)));
assert.equal(byCategory.flatMap(s => s.rows).length, stored.length, "no ingredient dropped");
assert.equal(byCategory.find(s => s.category === "other")!.rows[0].text, "a pinch of mystery", "uncategorised go to Other");
assert.equal(byCategory.find(s => s.category === "vegetables")!.rows.length, 2, "duplicates both kept");
assert.deepEqual(stored, snapshot, "grouping never mutates stored order");
assert.equal(new Set(rows.map(r => r.id)).size, rows.length, "ids are unique even for duplicate lines");
const scaledRows = ingredientRows(stored, stored.map(t => scaleIngredient(t, 0.5)));
assert.deepEqual(scaledRows.map(r => r.id), rows.map(r => r.id), "ids survive serving changes");
assert.equal(scaledRows[1].text, "3 boneless skinless chicken thighs");
assert.deepEqual(ingredientSections(scaledRows, "category").find(s => s.category === "protein")!.rows.map(r => r.text), ["3 boneless skinless chicken thighs"], "scaling applies in category mode");
// A checked id selects the same ingredient in both views.
const checkedId = rows[1].id;
assert.equal(ingredientSections(rows, "order")[0].rows.find(r => r.id === checkedId)!.original, ingredientSections(rows, "category").flatMap(s => s.rows).find(r => r.id === checkedId)!.original);
// Preference: default order, persisted, tolerant of bad values and unavailable storage.
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
assert.equal(readIngredientView(), "order");
saveIngredientView("category"); assert.equal(readIngredientView(), "category"); assert.equal(store.get(ingredientViewKey), "category");
store.set(ingredientViewKey, "junk"); assert.equal(readIngredientView(), "order");
(globalThis as any).localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
assert.equal(readIngredientView(), "order"); saveIngredientView("category");

// Cooking session: boundaries, progress, preference, clearing, unavailable storage.
assert.equal(cooking.clampStep(-3, 4), 0); assert.equal(cooking.clampStep(99, 4), 3); assert.equal(cooking.clampStep(NaN, 4), 0); assert.equal(cooking.clampStep(1.9, 4), 1); assert.equal(cooking.clampStep(2, 0), 0);
assert.equal(cooking.previousStep(0, 4), 0, "no step before the first"); assert.equal(cooking.nextStep(3, 4), 3, "no step after the last");
assert.equal(cooking.nextStep(1, 4), 2); assert.equal(cooking.previousStep(2, 4), 1);
assert.equal(cooking.isLastStep(3, 4), true); assert.equal(cooking.isLastStep(2, 4), false); assert.equal(cooking.isLastStep(0, 1), true);
assert.deepEqual(cooking.stepProgress(1, 4), { current: 2, total: 4, percent: 50 }); assert.equal(cooking.stepProgress(3, 4).percent, 100);
const session = new Map<string, string>(), pref = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v), removeItem: (k: string) => void session.delete(k) };
(globalThis as any).localStorage = { getItem: (k: string) => pref.get(k) ?? null, setItem: (k: string, v: string) => void pref.set(k, v) };
assert.equal(cooking.readCookingStep("r1", 4), 0); assert.equal(cooking.hasCookingProgress("r1"), false);
cooking.saveCookingStep("r1", 2); cooking.saveCookingStep("r2", 1);
assert.equal(cooking.readCookingStep("r1", 4), 2, "progress survives close/reopen"); assert.equal(cooking.readCookingStep("r2", 4), 1, "progress is per recipe");
assert.equal(cooking.hasCookingProgress("r1"), true); assert.equal(cooking.readCookingStep("r1", 2), 1, "a saved step beyond a shortened recipe is clamped");
session.set(cooking.cookingStepKey("r1"), "junk"); assert.equal(cooking.readCookingStep("r1", 4), 0);
cooking.saveCookingStep("r1", 3); cooking.clearCookingStep("r1");
assert.equal(cooking.readCookingStep("r1", 4), 0, "finishing clears progress"); assert.equal(cooking.readCookingStep("r2", 4), 1, "other recipes untouched");
assert.equal(cooking.readCookingZen(), false); cooking.saveCookingZen(true); assert.equal(cooking.readCookingZen(), true); cooking.saveCookingZen(false); assert.equal(cooking.readCookingZen(), false);
const blocked = () => { throw new Error("blocked"); };
(globalThis as any).sessionStorage = { getItem: blocked, setItem: blocked, removeItem: blocked }; (globalThis as any).localStorage = { getItem: blocked, setItem: blocked };
assert.equal(cooking.readCookingStep("r1", 4), 0); cooking.saveCookingStep("r1", 2); cooking.clearCookingStep("r1"); assert.equal(cooking.readCookingZen(), false); cooking.saveCookingZen(true);

// Step timer: set to the minimum of the stated range, user-started, pausable, never invented.
assert.equal(timer.timerSeconds({ min: 25, unit: "minutes" }), 1500); assert.equal(timer.timerSeconds({ min: 30, unit: "seconds" }), 30);
assert.equal(timer.timerSeconds({ min: 2, unit: "hours" }), 7200); assert.equal(timer.timerSeconds(null), null);
assert.equal(timer.timerSeconds(stepDuration("Simmer for 25–30 minutes.")), 1500, "a range starts at its minimum");
assert.equal(timer.timerSeconds(stepDuration("Serve with rice.")), null, "no stated duration, no timer");
const idle = timer.idleTimer(600);
assert.equal(timer.secondsLeft(idle, 1e9), 600, "idle timers do not count down"); assert.equal(timer.isRunning(idle, 0), false);
const running = timer.startTimer(idle, 1000);
assert.equal(timer.secondsLeft(running, 1000), 600); assert.equal(timer.secondsLeft(running, 1000 + 90_500), 510); assert.equal(timer.isRunning(running, 2000), true);
assert.equal(timer.startTimer(running, 5000), running, "starting twice does not restart");
const paused = timer.pauseTimer(running, 1000 + 60_000);
assert.deepEqual(paused, { remaining: 540, endsAt: null }); assert.equal(timer.secondsLeft(paused, 1e12), 540, "paused time is frozen");
assert.equal(timer.secondsLeft(timer.startTimer(paused, 9e6), 9e6 + 40_000), 500, "resume continues from where it paused");
assert.equal(timer.secondsLeft(running, 1000 + 700_000), 0); assert.equal(timer.isDone(running, 1000 + 700_000), true); assert.equal(timer.isDone(running, 2000), false);
assert.equal(timer.startTimer(timer.idleTimer(0), 0).endsAt, null, "a zero timer never starts");
assert.equal(timer.formatClock(480), "08:00"); assert.equal(timer.formatClock(59), "00:59"); assert.equal(timer.formatClock(3725), "1:02:05"); assert.equal(timer.formatClock(-5), "00:00");
const tstore = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => tstore.get(k) ?? null, setItem: (k: string, v: string) => void tstore.set(k, v), removeItem: (k: string) => void tstore.delete(k) };
timer.saveTimers("r1", { 0: running, 2: paused }); assert.deepEqual(timer.readTimers("r1"), { 0: running, 2: paused }, "timers survive close/reopen");
tstore.set(timer.timersKey("r1"), JSON.stringify({ 0: { remaining: -1, endsAt: null }, x: { remaining: 1, endsAt: null }, 1: "bad", 3: { remaining: 5, endsAt: null } }));
assert.deepEqual(timer.readTimers("r1"), { 3: { remaining: 5, endsAt: null } }, "malformed stored timers are ignored");
timer.clearTimers("r1"); assert.deepEqual(timer.readTimers("r1"), {});

console.log("PASS recipe view: ingredient scaling (halve/double/fractions/decimals/ranges/unparseable, no mutation), step numbering and stated durations, mock nutrition hidden, planner add/duplicate/replace/full/span/servings, grocery servings factor, ingredient view order/category/ids/preference, cooking session boundaries/progress/clear/zen preference, step timer model/persistence.");
