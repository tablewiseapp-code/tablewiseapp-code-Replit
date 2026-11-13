import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  buildRecipeGenerationContext, generateRecipe, generatedRecipeFromOutput, generationRequest, GenerationError,
} from "../server/recipe-generation";
import { defaultMealFilters, matchesMealFilters, type MealFilters } from "../client/src/lib/meal-filters";
import { generationBody } from "../client/src/lib/recipe-generation";
import { assignDinner, confirmPlan, emptyPlan, toggleDinner } from "../client/src/lib/week-plan";
import { buildGroceries } from "../client/src/lib/grocery-engine";
import type { Recipe } from "../client/src/lib/storage";

// All OpenAI calls are in-memory fakes. No network, no credentials.
const good = {
  title: "Quick lemon chicken", description: "Weeknight chicken.", servings: "4", prepTime: 10, cookTime: 15,
  mealTypes: ["dinner"], lunchbox: "none",
  ingredients: [
    { quantity: "500", unit: "g", name: "chicken breast" }, { quantity: "1", unit: "", name: "lemon" },
    { quantity: "2", unit: "tbsp", name: "olive oil" },
  ],
  steps: ["Slice the chicken.", "Pan-fry with oil for 12 minutes.", "Squeeze lemon over the top."],
};
const filters = (patch: Partial<MealFilters> = {}): MealFilters => ({ ...defaultMealFilters(), ...patch });
const ctx = (patch: Partial<MealFilters> = {}, mode: "preparation" | "total" = "total") =>
  buildRecipeGenerationContext(filters(patch), mode);
const fake = (...replies: (object | Error | { content: string | null; refusal?: string; finish?: string })[]) => {
  const calls: any[] = [];
  const ai = { chat: { completions: { async create(body: unknown) {
    calls.push(body);
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (reply instanceof Error) throw reply;
    const r = "content" in reply ? reply : { content: JSON.stringify(reply) };
    return { choices: [{ finish_reason: (r as any).finish ?? "stop", message: { content: r.content, refusal: (r as any).refusal } }] };
  } } } } as unknown as OpenAI;
  return { ai: () => ai, calls };
};
const kind = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { return error instanceof GenerationError ? error.kind : "other"; }
  return "none";
};

// 1. Filter serialization: only canonical fields, normalized and deduplicated.
const body = generationBody(filters({ maxMinutes: 30, mustInclude: ["rice"], mealTypes: ["dinner"] }), "preparation");
assert.deepEqual(Object.keys(body.filters).sort(), ["lunchbox", "maxMinutes", "mealTypes", "mustExclude", "mustInclude"]);
assert.equal(body.timeMode, "preparation");
assert.deepEqual(ctx({ mustInclude: ["  Rice ", "rice", ""], mealTypes: ["dinner", "dinner"] }).filters.mustInclude, ["rice"]);
assert.deepEqual(ctx({ mealTypes: ["dinner", "dinner"] }).filters.mealTypes, ["dinner"]);

// 2. Request validation: strict, enumerated.
assert.equal(generationRequest.safeParse(body).success, true);
assert.equal(generationRequest.safeParse({ ...body, extra: 1 }).success, false);
assert.equal(generationRequest.safeParse({ ...body, filters: { ...body.filters, maxMinutes: 17 } }).success, false);
assert.equal(generationRequest.safeParse({ ...body, filters: { ...body.filters, mealTypes: ["snack"] } }).success, false);
assert.equal(generationRequest.safeParse({ filters: body.filters }).success, false);

// 3. Valid generation: existing recipe shape, AI provenance, no fabricated source, structured output requested.
const ok = fake(good);
const result = await generateRecipe(ctx({ mealTypes: ["dinner"], maxMinutes: 30 }), ok.ai);
assert.equal(ok.calls.length, 1);
assert.equal(ok.calls[0].response_format.type, "json_schema");
assert.equal(ok.calls[0].response_format.json_schema.strict, true);
assert.deepEqual(result.recipe.ingredients, ["500 g chicken breast", "1 lemon", "2 tbsp olive oil"]);
assert.ok(result.recipe.tags?.includes("ai-generated") && result.recipe.tags.includes("meal:dinner"));
assert.equal(result.recipe.sourceUrl, undefined);
assert.equal(result.recipe.creditKind, undefined);
assert.equal(result.recipe.stepAnalysis, undefined);
assert.equal((result.recipe as Record<string, unknown>).caloriesKcal, undefined);

// 4. Structured response validation: bad shapes never pass.
for (const bad of [
  { ...good, ingredients: [] }, { ...good, steps: [] }, { ...good, title: "" },
  { ...good, prepTime: -1 }, { ...good, extra: true }, { ...good, mealTypes: ["snack"] }, "not an object",
]) assert.throws(() => generatedRecipeFromOutput(bad, ctx()), (e: unknown) => e instanceof GenerationError && e.kind === "invalid");

// 5. Hard-filter compliance. A violating recipe is never returned, even after the retry.
const violating = async (patch: Partial<MealFilters>, output: object, mode: "preparation" | "total" = "total") => {
  const f = fake(output);
  return { kind: await kind(generateRecipe(ctx(patch, mode), f.ai)), calls: f.calls.length };
};
assert.deepEqual(await violating({ maxMinutes: 15 }, good), { kind: "filters", calls: 2 }); // 10 + 15 > 15
assert.equal((await violating({ maxMinutes: 15 }, good, "preparation")).kind, "none");
assert.equal((await violating({ mealTypes: ["breakfast"] }, good)).kind, "filters");
assert.equal((await violating({ mustInclude: ["salmon"] }, good)).kind, "filters");
assert.equal((await violating({ mustExclude: ["lemon"] }, good)).kind, "filters");
assert.equal((await violating({ mustExclude: ["garlic"] }, { ...good, steps: [...good.steps, "Finish with garlic."] })).kind, "filters");
assert.equal((await violating({ lunchbox: "lunchbox" }, good)).kind, "filters");
assert.equal((await violating({ lunchbox: "lunchbox" }, { ...good, lunchbox: "school-lunchbox" })).kind, "none");
// One retry recovers from a single violation.
const recover = fake({ ...good, ingredients: [...good.ingredients, { quantity: "", unit: "", name: "garlic" }] }, good);
assert.equal((await generateRecipe(ctx({ mustExclude: ["garlic"] }), recover.ai)).recipe.title, good.title);
assert.equal(recover.calls.length, 2);

// 6. Failed API requests are classified and not retried; refusals and truncation are invalid.
const err = (name: string, status?: number) => Object.assign(new Error("private provider detail"), { name, status });
assert.equal(await kind(generateRecipe(ctx(), fake(err("APIConnectionTimeoutError")).ai)), "timeout");
assert.equal(await kind(generateRecipe(ctx(), fake(err("RateLimitError", 429)).ai)), "rate_limited");
assert.equal(await kind(generateRecipe(ctx(), fake(err("InternalServerError", 500)).ai)), "unavailable");
assert.equal(await kind(generateRecipe(ctx(), () => { throw new Error("AI is not configured"); })), "unavailable");
const timeout = fake(err("APIConnectionTimeoutError"));
await kind(generateRecipe(ctx(), timeout.ai));
assert.equal(timeout.calls.length, 1);
assert.equal(await kind(generateRecipe(ctx(), fake({ content: null, refusal: "no" }).ai)), "invalid");
assert.equal(await kind(generateRecipe(ctx(), fake({ content: "{", finish: "length" }).ai)), "invalid");
assert.equal(await kind(generateRecipe(ctx(), fake({ content: "not json" }).ai)), "invalid");

// 7. Accepted recipe is an ordinary recipe: filterable, plannable and shoppable alongside existing ones.
const saved: Recipe = { ...result.recipe, id: "generated-1", createdAt: "", updatedAt: "" } as Recipe;
const manual: Recipe = {
  id: "manual-1", title: "Manual", ingredients: ["200 g rice", "1 lemon"], steps: ["Boil."], tags: ["meal:dinner"],
  prepTime: 5, cookTime: 20, createdAt: "", updatedAt: "",
};
assert.equal(matchesMealFilters(saved, filters({ mealTypes: ["dinner"], maxMinutes: 30 }), "total"), true);
assert.equal(matchesMealFilters(manual, filters({ mealTypes: ["dinner"], mustInclude: ["rice"] }), "total"), true);
const week = "2026-10-19";
let plan = emptyPlan(week);
const other: Recipe = { ...manual, id: "manual-2", title: "Other", ingredients: ["3 eggs"] };
for (const [index, recipe] of [manual, saved, other].entries()) {
  plan = assignDinner(toggleDinner(plan, recipe.id), recipe.id, `2026-10-${19 + index}`);
}
assert.deepEqual(plan.selectedRecipeIds, ["manual-1", "generated-1", "manual-2"]);
const groceries = buildGroceries(confirmPlan(plan), [manual, saved, other]);
assert.deepEqual(groceries.recipeTitles.sort(), ["Manual", "Other", "Quick lemon chicken"]);
assert.deepEqual(groceries.missingRecipeIds, []);
const text = JSON.stringify(groceries.items).toLowerCase();
for (const name of ["chicken", "olive oil", "rice", "lemon"]) assert.ok(text.includes(name), `grocery list includes ${name}`);

console.log("recipe generation tests passed");
