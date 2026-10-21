import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { DatabaseStorage } from "../server/storage";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";
import {
  emptyPlan, toggleDinner, replaceDinner, assignDinner, confirmPlan, canConfirm,
  weekPlanSchema, selectedWeek, currentWeek, weekDays, addDays, planKey, checkKey,
} from "../client/src/lib/week-plan";
import { buildGroceries } from "../client/src/lib/grocery-engine";

const week = "2026-10-19";
const recipes = [
  { id: "a", title: "A", ingredients: ["1 cup rice", "2 tbsp olive oil", "1 onion", "salt to taste", "0.5 cup beans", "100 g chicken", "1-2 tsp pepper"] },
  { id: "b", title: "B", ingredients: ["2 cups rice", "1 tbsp olive oil", "1 onion", "salt to taste", "1/2 cup beans", "0.1 cup peas", "2 tsp oil", "1 oz cheese"] },
  { id: "c", title: "C", ingredients: ["300 g rice", "1 cup rice, cooked", "1 tbsp olive oil", "0.2 cup peas", "2 tbsp oil", "1 oz cheese"] },
  { id: "d", title: "D", ingredients: ["7 kg new ingredient"] },
];
function confirmed(ids: string[]) {
  let plan = emptyPlan(week);
  ids.forEach((id, index) => { plan = assignDinner(toggleDinner(plan, id), id, addDays(week, index)); });
  return confirmPlan(plan);
}
async function main() {
  assert.deepEqual(weekDays("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(currentWeek(new Date(2026, 9, 25, 23)), week);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-02", 7), "2026-03-09");
  for (const value of ["2026-02-30", "2026-10-20", "garbage", "2026-10-19T00:00:00Z"]) {
    assert.equal(selectedWeek(`week=${value}`), null);
  }
  assert.notEqual(planKey(week), planKey(addDays(week, 7)));
  assert.notEqual(planKey(week), checkKey(week));
  console.log("PASS fixtures: local Monday weeks, DST/calendar/year boundaries, invalid links and independent storage keys.");

  const plan = confirmed(["a", "b", "c"]);
  assert.ok(canConfirm(plan));
  assert.equal(canConfirm(emptyPlan(week)), false);
  assert.equal(toggleDinner(plan, "d"), plan);
  assert.throws(() => assignDinner(plan, "a", "2026-10-26"));
  assert.throws(() => assignDinner(plan, "a", plan.assignments.b));
  assert.equal(weekPlanSchema.safeParse({ ...plan, selectedRecipeIds: ["a", "a", "c"] }).success, false);
  assert.equal(weekPlanSchema.safeParse({ ...plan, selectedRecipeIds: ["a", "b"] }).success, false);
  assert.equal(weekPlanSchema.safeParse({ ...plan, assignments: { a: week } }).success, false);
  assert.equal(weekPlanSchema.safeParse({ ...plan, assignments: { ...plan.assignments, extra: week } }).success, false);
  assert.equal(weekPlanSchema.safeParse({ ...plan, extra: "invalid" }).success, false);
  assert.equal(weekPlanSchema.safeParse({ weeklyMealsState: {} }).success, false);
  console.log("PASS fixtures: only three unique, available-day assignments can be confirmed; legacy and malformed shapes are rejected.");

  const saved = JSON.stringify(plan);
  const list = buildGroceries(plan, recipes);
  assert.equal(list.missingRecipeIds.length, 0);
  assert.deepEqual(list.recipeTitles, ["A", "B", "C"]);
  assert.equal(list.items.reduce((sum, item) => sum + item.sources.length, 0),
    recipes.slice(0, 3).reduce((sum, recipe) => sum + recipe.ingredients.length, 0));
  assert.ok(list.items.some(item => item.text === "3 cup rice"));
  assert.ok(list.items.some(item => item.text === "4 tbsp olive oil"));
  assert.ok(list.items.some(item => item.text === "1 cup beans"));
  assert.ok(list.items.some(item => item.text === "0.3 cup peas"));
  assert.equal(list.items.filter(item => item.text === "1 onion").length, 2);
  assert.equal(list.items.filter(item => item.text === "salt to taste").length, 2);
  assert.equal(list.items.filter(item => item.text === "1 oz cheese").length, 2);
  for (const text of ["300 g rice", "1 cup rice, cooked", "2 tsp oil", "2 tbsp oil", "1-2 tsp pepper"]) {
    assert.ok(list.items.some(item => item.text === text));
  }
  assert.ok(!list.items.some(item => item.sources.some(source => source.recipeId === "d")));
  assert.equal(new Set(list.items.map(item => item.id)).size, list.items.length);
  console.log("PASS fixtures: correct three recipes only; exact fractions/decimals summed; different units/preparations and ambiguous counts remain separate.");

  const reopened = replaceDinner(plan, "b", "d");
  assert.equal(reopened.confirmed, false);
  assert.equal(reopened.assignments.d, plan.assignments.b);
  assert.deepEqual(buildGroceries(reopened, recipes).items, []);
  const updated = buildGroceries(confirmPlan(reopened), recipes);
  assert.ok(updated.items.some(item => item.text === "7 kg new ingredient"));
  assert.ok(!updated.items.some(item => item.sources.some(source => source.recipeId === "b")));
  const unchanged = list.items.find(item => item.text === "100 g chicken")!;
  assert.ok(updated.items.some(item => item.id === unchanged.id));
  const changed = list.items.find(item => item.text === "3 cup rice")!;
  assert.ok(!updated.items.some(item => item.id === changed.id));
  const edited = recipes.map(recipe => recipe.id === "a" ? { ...recipe, ingredients: ["2 cup rice", ...recipe.ingredients.slice(1)] } : recipe);
  assert.ok(!buildGroceries(plan, edited).items.some(item => item.id === changed.id));
  console.log("PASS fixtures: replacement preserves day, reopens confirmation, updates ingredients and invalidates only changed contribution identities.");

  const incomplete = buildGroceries(plan, recipes.filter(recipe => recipe.id !== "b"));
  assert.deepEqual(incomplete.missingRecipeIds, ["b"]);
  assert.equal(JSON.stringify(plan), saved);
  assert.ok(!incomplete.items.some(item => item.sources.some(source => source.recipeId === "b")));
  assert.equal(toggleDinner(plan, "a").confirmed, false);
  console.log("PASS fixtures: deleted recipes reported explicitly; confirmed plans never mutated by grocery generation.");

  const socket = testSocketArgument();
  if (!socket) {
    console.log("Database checks not requested. No database was opened or modified.");
    return;
  }
  const pool = await openLocalTestDatabase(socket);
  try {
    const storage = new DatabaseStorage(drizzle(pool, { schema }));
    const realRecipes = await storage.getAllRecipes();
    assert.equal(realRecipes.length, 12);
    for (const seed of dinnerCatalog) {
      const actual = realRecipes.find(recipe => recipe.id === seed.id);
      assert.ok(actual);
      for (const [key, value] of Object.entries(seed)) {
        assert.deepEqual(actual[key as keyof typeof actual], value);
      }
    }
    const realPlan = confirmed(realRecipes.slice(0, 3).map(recipe => recipe.id));
    const actualList = buildGroceries(realPlan, realRecipes);
    assert.equal(actualList.missingRecipeIds.length, 0);
    assert.equal(actualList.items.reduce((sum, item) => sum + item.sources.length, 0),
      realRecipes.slice(0, 3).reduce((sum, recipe) => sum + recipe.ingredients.length, 0));
    assert.ok(actualList.items.every(item => item.sources.every(source => realPlan.selectedRecipeIds.includes(source.recipeId))));
    const arg = process.argv.indexOf("--base-url");
    if (arg >= 0) {
      const base = process.argv[arg + 1];
      const response = await fetch(`${base}/api/recipes`);
      assert.equal(response.status, 200);
      const apiRecipes = await response.json() as typeof realRecipes;
      for (const recipe of realRecipes) {
        const api = apiRecipes.find(value => value.id === recipe.id);
        assert.ok(api);
        assert.deepEqual(api.ingredients, recipe.ingredients);
        assert.equal(api.title, recipe.title);
      }
      assert.deepEqual(buildGroceries(realPlan, apiRecipes), actualList);
      console.log("PASS real PostgreSQL + backend API: grocery results match verified persisted rows through normal GET /api/recipes.");
    }
    console.log(`PASS real PostgreSQL: 12 exact reviewed records; 3 selected dinners produce ${actualList.items.length} shopping entries with every ingredient contribution preserved. Read-only: no inserts, updates, seeds or deletes.`);
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error : "Grocery verification failed; no default database was used."); process.exitCode = 1; });
