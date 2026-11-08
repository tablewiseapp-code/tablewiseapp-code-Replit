import assert from "node:assert/strict";
import * as g from "../client/src/lib/grocery-progress";

const keys = ["a", "b", "c"];
const none = new Set<string>();
// Completion rules, including the empty category.
assert.deepEqual(g.categoryProgress(keys, new Set(["a"])), { total: 3, done: 1, complete: false });
assert.deepEqual(g.categoryProgress(keys, new Set(keys)), { total: 3, done: 3, complete: true });
assert.equal(g.categoryProgress([], none).complete, false, "an empty category is never complete");
assert.equal(g.categoryProgress([], new Set(["x"])).complete, false);
assert.equal(g.categoryProgress(["only"], new Set(["only"])).complete, true, "1 of 1 collected is complete");
assert.equal(g.categoryProgress(keys, new Set(["a", "b", "stale"])).complete, false, "stale ticks do not complete a category");

// Final unchecked item completes the category; auto-collapse; manual choices win.
let state = { checked: new Set(["a", "b"]), expansion: {} as g.Expansion };
assert.equal(g.isCategoryCollapsed(g.categoryProgress(keys, state.checked).complete, state.expansion.Dairy), false, "incomplete: open");
state = g.toggleItem(state.checked, state.expansion, "c", "Dairy");
const complete = g.categoryProgress(keys, state.checked).complete;
assert.equal(complete, true);
assert.equal(g.isCategoryCollapsed(complete, state.expansion.Dairy), true, "completing the last item collapses the category");
// Manual expansion stays expanded and is not re-collapsed while nothing is toggled.
state.expansion = g.toggleCategory(state.expansion, "Dairy", true);
assert.equal(g.isCategoryCollapsed(complete, state.expansion.Dairy), false, "manual expand of a completed category");
const afterOtherCategory = g.toggleItem(state.checked, state.expansion, "z", "Produce");
assert.equal(afterOtherCategory.expansion.Dairy, "open", "changes in other categories do not touch this preference");
assert.equal(g.isCategoryCollapsed(complete, afterOtherCategory.expansion.Dairy), false);
// Unchecking removes Complete and keeps it open; re-completing collapses again.
const unchecked = g.toggleItem(state.checked, state.expansion, "b", "Dairy");
assert.equal(g.categoryProgress(keys, unchecked.checked).complete, false, "unchecking removes Complete");
assert.equal(g.isCategoryCollapsed(false, unchecked.expansion.Dairy), false, "and the category stays expanded");
const recompleted = g.toggleItem(unchecked.checked, unchecked.expansion, "b", "Dairy");
assert.equal(g.isCategoryCollapsed(true, recompleted.expansion.Dairy), true, "completing again auto-collapses");
// Manual collapse of an incomplete category sticks; inputs are never mutated.
const manual = g.toggleCategory({}, "Produce", false);
assert.equal(manual.Produce, "closed"); assert.equal(g.isCategoryCollapsed(false, manual.Produce), true);
const frozen = new Set(["a"]); g.toggleItem(frozen, {}, "b", "X"); assert.deepEqual([...frozen], ["a"]);

// Overall progress and list completion.
assert.equal(g.countChecked(keys, new Set(["a", "stale1", "stale2"])), 1, "counter ignores stale ticks");
assert.equal(g.isListComplete(keys, new Set(keys)), true); assert.equal(g.isListComplete(keys, new Set(["a", "b"])), false);
assert.equal(g.isListComplete([], none), false, "an empty list is not 'complete'");

// Persistence round trip, validation and blocked storage.
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
assert.deepEqual(g.readGroceryPrefs(), { checked: new Set(), expansion: {} });
g.saveGroceryPrefs({ checked: new Set(["a", "b"]), expansion: { Dairy: "open", Produce: "closed" } });
const back = g.readGroceryPrefs();
assert.deepEqual([...back.checked].sort(), ["a", "b"]); assert.deepEqual(back.expansion, { Dairy: "open", Produce: "closed" });
store.set(g.groceryPrefsKey, JSON.stringify({ checked: ["ok", 5, null], expansion: { A: "open", B: "weird", C: 3 } }));
const cleaned = g.readGroceryPrefs(); assert.deepEqual([...cleaned.checked], ["ok"]); assert.deepEqual(cleaned.expansion, { A: "open" });
store.set(g.groceryPrefsKey, "not json"); assert.deepEqual(g.readGroceryPrefs(), { checked: new Set(), expansion: {} });
const blocked = () => { throw new Error("blocked"); };
(globalThis as any).localStorage = { getItem: blocked, setItem: blocked };
assert.deepEqual(g.readGroceryPrefs(), { checked: new Set(), expansion: {} }); g.saveGroceryPrefs({ checked: new Set(["a"]), expansion: {} });

console.log("PASS grocery progress: completion incl. empty/stale, auto-collapse on last item, manual expand kept, uncheck reopens, re-complete collapses, counter and list completion, persistence/validation/blocked storage.");
