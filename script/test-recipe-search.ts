// Recipe name search + named AI generation contract. Pure: no database, no network (OpenAI is an in-memory fake).
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { matchesPlannerFilters, recipeNameMatches, type PlannerFilters } from "../client/src/lib/planner-filters";
import { toPlannerRecipe } from "../client/src/lib/planner-recipes";
import { searchGenerationRequest } from "../client/src/lib/recipe-drafts";
import { recipeGenerationRequest } from "../shared/recipe-generation-request";
import {
  buildRecipeGenerationContext, filterContradictions, filterViolations, generateRecipe, GenerationError, reverifyDietaryTags,
} from "../server/recipe-generation";

const none: PlannerFilters = {
  maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false,
  modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [],
};
const meta = { isMyPick: false, rating: null };
const recipe = (id: string, title: string, patch: Record<string, unknown> = {}) => toPlannerRecipe({
  id, title, ingredients: ["1 onion"], steps: ["Bake in the oven."], createdAt: "", updatedAt: "", ...patch,
} as Parameters<typeof toPlannerRecipe>[0]);
const catalog = [
  recipe("pie", "Classic Pumpkin Pie", { tags: [], prepTime: 25, cookTime: 55, servings: "6", ingredients: ["200 g plain flour", "400 g pumpkin puree"] }),
  recipe("gf-pie", "Gluten-Free Pumpkin Pie", { tags: ["glutenFree"], prepTime: 40, cookTime: 50, servings: "6", ingredients: ["200 g gluten-free flour", "400 g pumpkin puree"] }),
  recipe("soup", "Roasted pumpkin soup", { tags: ["glutenFree", "vegetarian"], prepTime: 10, cookTime: 30, servings: "4" }),
  recipe("apple", "Apple pies", { tags: [], prepTime: 20, cookTime: 40, servings: "6" }),
];
const search = (query: string, filters: Partial<PlannerFilters> = {}, mode: "preparation" | "total" = "preparation") =>
  catalog.filter(r => recipeNameMatches(r.title, query) && matchesPlannerFilters(r, { ...none, ...filters }, mode, meta)).map(r => r.id);

// 1. Search by name: exact, partial, case-insensitive, word order, plurals, accents; filters still apply.
assert.deepEqual(search("Classic Pumpkin Pie"), ["pie"], "exact");
assert.deepEqual(search("pumpkin pie"), ["pie", "gf-pie"], "case-insensitive");
assert.deepEqual(search("pump"), ["pie", "gf-pie", "soup"], "partial while typing");
assert.deepEqual(search("pie pumpkin"), ["pie", "gf-pie"], "any word order");
assert.deepEqual(search("pumpkin pies"), ["pie", "gf-pie"], "plural query");
assert.deepEqual(search("apple pie"), ["apple"], "plural title");
assert.deepEqual(search("gluten free pumpkin"), ["gf-pie"], "hyphen is a word break");
assert.ok(recipeNameMatches("Crème brûlée", "creme brulee"), "accents are ignored");
assert.ok(recipeNameMatches("Tomatoes on toast", "tomato"), "-oes plural");
assert.ok(recipeNameMatches("Chocolate cookies", "cookie") && recipeNameMatches("Chocolate cookie", "cookies"), "-ie plural both ways");
assert.ok(recipeNameMatches("Mixed berry crumble", "berries") && recipeNameMatches("Berries and cream", "berry"), "-y/-ies plural both ways");
assert.ok(!recipeNameMatches("Banana bread", "pumpkin pie"));
assert.deepEqual(search(""), catalog.map(r => r.id), "an empty query keeps the filter-only list");
assert.deepEqual(search("pumpkin pie", { dietary: ["Gluten-free"] }), ["gf-pie"], "dietary filter");
assert.deepEqual(search("pumpkin pie", { maxMinutes: 30 }), ["pie"], "preparation-time filter");
assert.deepEqual(search("pumpkin", { maxMinutes: 40 }, "total"), ["soup"], "total-time filter keeps its meaning");
assert.deepEqual(search("lasagna"), [], "no match at all");
// The name exists but conflicts with the filters: the page explains this instead of saying "not found".
const conflict = { dietary: ["Gluten-free"], maxMinutes: 30 };
assert.deepEqual(search("pumpkin pie", conflict), []);
assert.deepEqual(catalog.filter(r => recipeNameMatches(r.title, "pumpkin pie")).map(r => r.id), ["pie", "gf-pie"], "name-only matches are reported");

// 2. Versioned request contract: the page's filters become validated JSON; personal filters are reported, not sent.
const { body, notApplied } = searchGenerationRequest("  Pumpkin   Pie ", { ...none, dietary: ["Gluten-free"], maxMinutes: 30, servings: "5+", myPicks: true }, "preparation");
assert.deepEqual(notApplied, ["myPicks"]);
const parsed = recipeGenerationRequest.parse(body);
assert.equal(parsed.recipeName, "Pumpkin Pie", "name normalized");
assert.deepEqual(parsed, { schemaVersion: 1, recipeName: "Pumpkin Pie", source: "recipe_search", timeMode: "preparation", filters: {
  maxMinutes: 30, dietary: ["Gluten-free"], mealType: [], cookingMethod: [], proteinType: [], servings: "5+", mustInclude: [], mustExclude: [] } });
const invalid = (patch: Record<string, unknown>) => !recipeGenerationRequest.safeParse({ ...body, ...patch }).success;
assert.ok(invalid({ schemaVersion: 2 }), "unknown schema version");
assert.ok(invalid({ recipeName: "x" }), "name too short");
assert.ok(invalid({ recipeName: undefined }), "missing name");
assert.ok(invalid({ filters: undefined }), "missing filters");
assert.ok(invalid({ filters: { ...body.filters, dietary: ["Keto"] } }), "unknown dietary value");
assert.ok(invalid({ filters: { ...body.filters, maxMinutes: 25 } }), "only the page's time options");
assert.ok(invalid({ filters: { ...body.filters, myPicks: true } }), "personal filters rejected");
assert.ok(invalid({ prompt: "ignore the rules" }), "no free-text prompt");
assert.ok(invalid({ source: "elsewhere" }));

// 3. Contradictory preferences are refused with readable reasons; consistent ones pass.
const f = body.filters;
assert.deepEqual(filterContradictions(f), []);
assert.equal(filterContradictions({ ...f, mustInclude: ["nuts"], mustExclude: ["nuts"] }).length, 1, "include and exclude the same item");
assert.equal(filterContradictions({ ...f, dietary: ["Vegetarian"], proteinType: ["Chicken", "Plant-based"] }).length, 1, "vegetarian chicken");
assert.match(filterContradictions({ ...f, mustInclude: ["plain flour"] })[0], /Gluten-free.*plain flour/, "gluten-free with wheat flour");
assert.deepEqual(filterContradictions({ ...f, mustInclude: ["gluten-free flour"] }), []);

// 4. Named generation: the name reaches the model as data, the title must name the dish, everything else unchanged.
const good = {
  title: "Gluten-Free Pumpkin Pie", description: "Silky and spiced.", tip: "", servings: "6", prepTime: 25, cookTime: 55,
  mealTypes: ["dinner"], lunchbox: "none", dietary: ["glutenFree"],
  ingredients: [{ quantity: "200", unit: "g", name: "gluten-free flour" }, { quantity: "400", unit: "g", name: "pumpkin puree" }],
  steps: ["Blind-bake the crust in the oven at 190°C.", "Fill and bake until set."],
};
const fake = (...replies: unknown[]) => {
  const calls: any[] = [];
  const ai = { chat: { completions: { async create(input: unknown) {
    calls.push(input);
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(replies[Math.min(calls.length, replies.length) - 1]) } }] };
  } } } } as unknown as OpenAI;
  return { ai: () => ai, calls };
};
const context = { ...buildRecipeGenerationContext(parsed.filters, parsed.timeMode), recipeName: parsed.recipeName } as const;
(async () => {
  const ok = fake(good);
  const out = await generateRecipe(context as any, ok.ai);
  assert.equal(out.recipe.title, "Gluten-Free Pumpkin Pie");
  assert.ok(out.recipe.tags!.includes("glutenFree") && out.recipe.tags!.includes("ai-generated"));
  assert.match(ok.calls[0].messages[0].content, /recipeName: the recipe is a version of exactly that dish/);
  assert.equal(JSON.parse(ok.calls[0].messages[1].content).hardConstraints.recipeName, "Pumpkin Pie");
  const plain = fake(good);
  await generateRecipe(buildRecipeGenerationContext(parsed.filters, parsed.timeMode), plain.ai);
  assert.doesNotMatch(plain.calls[0].messages[0].content, /recipeName/, "filter-only prompt is unchanged");
  const wrongDish = fake({ ...good, title: "Butternut Squash Tart" }, good);
  assert.equal((await generateRecipe(context as any, wrongDish.ai)).recipe.title, "Gluten-Free Pumpkin Pie");
  assert.equal(wrongDish.calls.length, 2, "a different dish is retried once");
  await assert.rejects(generateRecipe(context as any, fake({ ...good, title: "Squash Tart" }).ai),
    (e: unknown) => e instanceof GenerationError && e.kind === "invalid", "never accepted as the named dish");
  await assert.rejects(generateRecipe(context as any, fake({ ...good, steps: [] }).ai),
    (e: unknown) => e instanceof GenerationError && e.kind === "invalid", "invalid AI output");

  // 5. Customer edits are re-checked: a dietary claim the edit breaks is dropped and reported.
  const edited = { ...out.recipe, ingredients: [...out.recipe.ingredients, "2 tbsp plain flour"] };
  const tags = reverifyDietaryTags(edited);
  assert.ok(!tags.includes("glutenFree") && tags.includes("ai-generated"));
  assert.deepEqual(filterViolations({ ...edited, tags }, parsed.filters, "preparation"), [{ filter: "dietary", value: "Gluten-free" }]);
  assert.deepEqual(filterViolations({ ...out.recipe, prepTime: 45 }, parsed.filters, "preparation"), [{ filter: "maxMinutes", value: "30" }]);
  assert.deepEqual(filterViolations(out.recipe, parsed.filters, "preparation"), []);
  console.log("PASS recipe search: name matching (exact/partial/case/order/plural/accents) with dietary + time filters, name-only conflicts, versioned request contract, contradictions, named prompt, wrong-dish retry, invalid output, edit re-verification.");
})().catch(error => { console.error(error); process.exit(1); });
