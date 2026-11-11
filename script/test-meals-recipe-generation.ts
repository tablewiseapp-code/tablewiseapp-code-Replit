// AI recipe generation from the Meals page (/meals) filters. All OpenAI calls are in-memory fakes: no network, no credentials.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import express from "express";
import type OpenAI from "openai";
import { registerRoutes, type RecipeStorage } from "../server/routes";
import { apiErrorHandler } from "../server/security";
import {
  buildRecipeGenerationContext, dietaryViolations, generateRecipe, generatedRecipeFromOutput, generationRequest, GenerationError,
} from "../server/recipe-generation";
import { matchesPlannerFilters, mealsGenerationFilters, type PlannerFilters } from "../client/src/lib/planner-filters";
import { toPlannerRecipe } from "../client/src/lib/planner-recipes";
import { mealsGenerationBody } from "../client/src/lib/recipe-generation";
import { scaleIngredient } from "../client/src/lib/ingredient-scale";

const none: PlannerFilters = {
  maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false,
  modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [],
};
const pf = (patch: Partial<PlannerFilters>): PlannerFilters => ({ ...none, ...patch });
const meta = { isMyPick: false, rating: null };
const stored = (patch: Record<string, unknown>) => toPlannerRecipe({
  id: "r", title: "Dish", ingredients: ["1 onion"], steps: ["Cook in a pan."], createdAt: "", updatedAt: "", ...patch,
} as Parameters<typeof toPlannerRecipe>[0]);

async function main() {
  // 1. The shared Meals filter keeps the page's previous behaviour (moved, not changed).
  const curry = stored({ tags: ["glutenFree", "meal:dinner"], prepTime: 10, cookTime: 20, ingredients: ["400 g chicken thighs"], steps: ["Bake in the oven."] });
  assert.equal(matchesPlannerFilters(curry, pf({ dietary: ["Gluten-free"], mealType: ["Dinner"], cookingMethod: ["Oven"], proteinType: ["Chicken"] }), "total", meta), true);
  assert.equal(matchesPlannerFilters(curry, pf({ dietary: ["Vegetarian"] }), "total", meta), false);
  assert.equal(matchesPlannerFilters(curry, pf({ maxMinutes: 20 }), "total", meta), false);
  assert.equal(matchesPlannerFilters(curry, pf({ maxMinutes: 20 }), "preparation", meta), true);
  assert.equal(matchesPlannerFilters(curry, pf({ mustInclude: ["chicken"] }), "total", meta), true);
  assert.equal(matchesPlannerFilters(curry, pf({ mustExclude: ["chicken"] }), "total", meta), false);
  assert.equal(matchesPlannerFilters(curry, pf({ myPicks: true }), "total", meta), false);
  assert.equal(matchesPlannerFilters(curry, pf({ myPicks: true, minRating: 4 }), "total", { isMyPick: true, rating: 5 }), true);
  assert.equal(matchesPlannerFilters(curry, pf({ cookingMethod: ["Air fryer"] }), "total", meta), false);

  // 2. Filter serialization: canonical names only; personal filters reported, never sent.
  const page = pf({ maxMinutes: 30, dietary: ["Gluten-free"], cookingMethod: ["Air fryer"], mealType: ["Dinner"], myPicks: true, minRating: 4, source: ["Imported"] });
  const { body, notApplied } = mealsGenerationBody(page, "preparation");
  assert.deepEqual(body, { filterSet: "meals", timeMode: "preparation", filters: {
    maxMinutes: 30, dietary: ["Gluten-free"], mealType: ["Dinner"], cookingMethod: ["Air fryer"], proteinType: [], servings: null, mustInclude: [], mustExclude: [],
  } });
  assert.deepEqual(notApplied, ["source", "myPicks", "minRating"]);
  assert.deepEqual(mealsGenerationFilters(none).notApplied, []);

  // 3. Request validation: strict and enumerated; the older filter set still validates.
  assert.equal(generationRequest.safeParse(body).success, true);
  assert.equal(generationRequest.safeParse({ ...body, filters: { ...body.filters, dietary: ["Keto"] } }).success, false);
  assert.equal(generationRequest.safeParse({ ...body, filters: { ...body.filters, maxMinutes: 25 } }).success, false);
  assert.equal(generationRequest.safeParse({ ...body, filters: { ...body.filters, myPicks: true } }).success, false, "personal filters are rejected");
  assert.equal(generationRequest.safeParse({ ...body, extra: 1 }).success, false);
  assert.equal(generationRequest.safeParse({ filters: { maxMinutes: 30, mustInclude: [], mustExclude: [], mealTypes: [], lunchbox: "any" }, timeMode: "total" }).success, true);

  // 4. Context builder: explicit filters only, normalised; userContext accepted and unused.
  const ctx = buildRecipeGenerationContext({ ...body.filters, mustInclude: ["  Rice ", "rice"], dietary: ["Gluten-free", "Gluten-free"] }, "preparation", { household: 4 });
  assert.equal(ctx.filterSet, "meals");
  assert.deepEqual(ctx.filters, { ...body.filters, mustInclude: ["rice"], dietary: ["Gluten-free"] });
  assert.equal(JSON.stringify(ctx).includes("household"), false, "user context is not sent yet");

  // 5. Valid generation and hard-filter compliance.
  const good = {
    title: "Air fryer lemon chicken", description: "Crisp and quick.", servings: "4", prepTime: 15, cookTime: 18,
    mealTypes: ["dinner"], lunchbox: "none", dietary: ["glutenFree"],
    ingredients: [{ quantity: "600", unit: "g", name: "chicken thighs" }, { quantity: "2", unit: "tbsp", name: "tamari" },
      { quantity: "1", unit: "", name: "lemon" }, { quantity: "200", unit: "g", name: "gluten-free pasta" }],
    steps: ["Toss the chicken with tamari.", "Cook in the air fryer at 200°C for 18 minutes.", "Squeeze lemon over and serve with the pasta."],
  };
  const context = buildRecipeGenerationContext(body.filters, "preparation");
  const out = generatedRecipeFromOutput(good, context);
  assert.deepEqual(out.recipe.tags, ["ai-generated", "meal:dinner", "glutenFree"]);
  assert.equal(out.recipe.sourceUrl, undefined, "no fabricated source");
  assert.equal(out.recipe.creditKind, undefined, "no chef credit");
  assert.equal((out.recipe as Record<string, unknown>).nutrition, undefined, "nutrition left unanalyzed");
  const asPlanned = toPlannerRecipe({ ...out.recipe, id: "x", createdAt: "", updatedAt: "" } as Parameters<typeof toPlannerRecipe>[0]);
  assert.equal(asPlanned.mealType, "Dinner"); assert.ok(asPlanned.tools.includes("Air fryer"));
  assert.equal(matchesPlannerFilters(asPlanned, page, "preparation", meta), false, "personal filters still hide it from the list…");
  assert.equal(matchesPlannerFilters(asPlanned, { ...page, myPicks: false, minRating: null, source: [] }, "preparation", meta), true, "…but every generatable filter is met");

  const violates = (patch: Record<string, unknown>, filters: Partial<typeof body.filters> = {}, mode: "preparation" | "total" = "preparation") => {
    try { generatedRecipeFromOutput({ ...good, ...patch }, buildRecipeGenerationContext({ ...body.filters, ...filters }, mode)); return "none"; }
    catch (error) { return error instanceof GenerationError ? error.kind : "other"; }
  };
  const ing = (...names: string[]) => names.map(name => ({ quantity: "1", unit: "", name }));
  assert.equal(violates({ ingredients: ing("chicken thighs", "soy sauce") }), "filters", "gluten in soy sauce");
  assert.equal(violates({ ingredients: ing("chicken thighs", "plain flour") }), "filters", "wheat flour");
  assert.equal(violates({ ingredients: ing("chicken thighs", "rolled oats") }), "filters", "oats are not assumed gluten-free");
  assert.equal(violates({ ingredients: ing("chicken thighs", "gluten-free oats", "cornflour") }), "none");
  assert.equal(violates({ dietary: [] }), "filters", "model did not declare the restriction");
  assert.equal(violates({ steps: ["Cook in a pan for 18 minutes."] }), "filters", "cooking method must be the air fryer");
  assert.equal(violates({ mealTypes: ["lunch"] }), "filters", "meal type");
  assert.equal(violates({ prepTime: 35 }), "filters", "time cap on preparation");
  assert.equal(violates({ prepTime: 15, cookTime: 18 }, {}, "total"), "filters", "time cap on total");
  assert.equal(violates({}, { mustExclude: ["lemon"] }), "filters", "excluded ingredient");
  assert.equal(violates({ steps: [...good.steps, "Garnish with parsley."] }, { mustExclude: ["parsley"] }), "filters", "excluded item hidden in steps");
  assert.equal(violates({}, { proteinType: ["Seafood"] }), "filters", "protein type");
  assert.equal(violates({ dietary: ["glutenFree", "vegetarian"] }, { dietary: ["Gluten-free", "Vegetarian"] }), "filters", "chicken is not vegetarian");
  const veggie = { title: "Air fryer crispy chickpeas", ingredients: ing("chickpeas", "tamari"), dietary: ["glutenFree", "vegetarian"],
    steps: ["Toss the chickpeas with tamari.", "Cook in the air fryer for 15 minutes."] };
  assert.equal(violates(veggie, { dietary: ["Gluten-free", "Vegetarian"], proteinType: [] }), "none");
  assert.equal(violates({ ...veggie, steps: [...veggie.steps, "Serve with grilled chicken."] }, { dietary: ["Gluten-free", "Vegetarian"] }), "filters", "meat in the steps");
  assert.equal(violates({ ingredients: ing("chicken thighs", "chilli flakes"), dietary: ["glutenFree", "kidFriendly"] }, { dietary: ["Gluten-free", "Kid friendly"] }), "filters", "not kid friendly");
  assert.equal(violates({ ingredients: [] }), "invalid", "missing ingredients");
  assert.equal(violates({ steps: [] }), "invalid", "missing instructions");
  assert.equal(violates({ title: "" }), "invalid");
  assert.deepEqual(dietaryViolations({ title: "Fish tacos", ingredients: ["corn tortillas"] }, ["Vegetarian", "Gluten-free"]), ["Vegetarian"]);

  // 6. Provider calls: structured output, one retry for rule-breaking output, no retry for timeouts.
  const fake = (...replies: unknown[]) => {
    const calls: any[] = [];
    const ai = { chat: { completions: { async create(input: unknown) {
      calls.push(input);
      const reply = replies[Math.min(calls.length, replies.length) - 1];
      if (reply instanceof Error) throw reply;
      return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] };
    } } } } as unknown as OpenAI;
    return { ai: () => ai, calls };
  };
  const retry = fake({ ...good, ingredients: ing("chicken thighs", "soy sauce") }, good);
  assert.equal((await generateRecipe(context, retry.ai)).recipe.title, good.title);
  assert.equal(retry.calls.length, 2);
  assert.equal(retry.calls[0].response_format.json_schema.strict, true);
  assert.equal(retry.calls[0].model, "gpt-5-nano", "cheapest structured-output model by default");
  assert.equal(retry.calls[0].temperature, undefined, "reasoning models reject a custom temperature");
  assert.equal(retry.calls[0].reasoning_effort, "minimal");
  assert.match(retry.calls[0].messages[0].content, /Gluten-free/);
  assert.equal(JSON.parse(retry.calls[0].messages[1].content).hardConstraints.filters.cookingMethod[0], "Air fryer");
  // If both attempts miss filters, the recipe is still returned, with every miss listed and no unverified labels.
  const bad = fake({ ...good, dietary: [] });
  const missed = await generateRecipe(context, bad.ai);
  assert.equal(bad.calls.length, 2, "retried once first");
  assert.deepEqual(missed.violations, [{ filter: "dietary", value: "Gluten-free" }]);
  assert.ok(!missed.recipe.tags!.includes("glutenFree"), "an unconfirmed dietary label is never attached");
  assert.equal((await generateRecipe(context, fake(good).ai)).violations, undefined, "compliant recipes carry no violations");
  const many = fake({ ...good, prepTime: 45, ingredients: ing("chicken thighs", "soy sauce"), steps: ["Fry in a pan for 10 minutes."], mealTypes: ["lunch"] },
    { ...good, prepTime: 45 });
  const closer = await generateRecipe(context, many.ai);
  assert.deepEqual(closer.violations, [{ filter: "maxMinutes", value: "30" }], "the closer of the two attempts is returned");
  const first = await generateRecipe(context, fake({ ...good, prepTime: 45 }, Object.assign(new Error("private"), { name: "APIConnectionTimeoutError" })).ai);
  assert.deepEqual(first.violations, [{ filter: "maxMinutes", value: "30" }], "a failed retry still returns the first recipe");
  const { mealsCandidate } = await import("../server/recipe-generation");
  const listed = mealsCandidate({ ...good, prepTime: 45, ingredients: ing("chicken thighs", "soy sauce"), steps: ["Fry in a pan with lemon."], mealTypes: ["lunch"] },
    buildRecipeGenerationContext({ ...body.filters, mustInclude: ["rice"], mustExclude: ["lemon"] }, "preparation"));
  assert.deepEqual(listed.violations!.map(v => `${v.filter}:${v.value}`).sort(),
    ["cookingMethod:Air fryer", "dietary:Gluten-free", "maxMinutes:30", "mealType:Dinner", "mustExclude:lemon", "mustInclude:rice"].sort());
  assert.ok(listed.recipe.tags!.includes("meal:lunch") && !listed.recipe.tags!.includes("meal:dinner"), "the model's own meal label is kept");
  const slow = fake(Object.assign(new Error("private"), { name: "APIConnectionTimeoutError" }));
  await assert.rejects(generateRecipe(context, slow.ai), (e: unknown) => e instanceof GenerationError && e.kind === "timeout");
  assert.equal(slow.calls.length, 1);

  // 7. HTTP: auth, validation, preview-only generation, saving, catalog, events; then grocery-ready ingredients.
  const token = randomBytes(32).toString("hex");
  const rows = new Map<string, any>();
  let writes = 0, mode: "ok" | "timeout" | "rate" = "ok";
  const storage: RecipeStorage = {
    async getAllRecipes() { return [...rows.values()]; },
    async getRecipe(id) { return rows.get(id); },
    async createRecipe(input) { writes++; const row = { image: null, sourceUrl: null, ...structuredClone(input), id: `saved-${writes}`, createdAt: new Date(), updatedAt: new Date() }; rows.set(row.id, row); return structuredClone(row); },
    async updateRecipe() { throw new Error("unused"); }, async updateRecipeCredit() { throw new Error("unused"); }, async deleteRecipe() { throw new Error("unused"); },
  };
  const ai = { chat: { completions: { async create() {
    if (mode === "timeout") throw Object.assign(new Error("private"), { name: "APIConnectionTimeoutError" });
    if (mode === "rate") throw Object.assign(new Error("private"), { status: 429 });
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(good) } }] };
  } } } } as unknown as OpenAI;
  const app = express(), server = createServer(app);
  await registerRoutes(server, app, { storage, ai: () => ai, nutrition: async r => r as any, config: { aiEnabled: true, operatorToken: token, production: false, publicCatalog: true } });
  app.use(apiErrorHandler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, payload: unknown, auth = true) => fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
  const logs: string[] = []; const log = console.log; console.log = (...args) => { logs.push(args.join(" ")); };
  try {
    assert.ok([401, 403].includes((await post("/api/recipes/generate", body, false)).status), "operators only");
    assert.equal((await post("/api/recipes/generate", { ...body, filters: { ...body.filters, dietary: ["Keto"] } })).status, 400);
    const generated = await post("/api/recipes/generate", body);
    assert.equal(generated.status, 200);
    const preview = await generated.json();
    assert.equal(preview.recipe.title, good.title);
    assert.equal(writes, 0, "generation never saves");
    mode = "timeout";
    const timedOut = await post("/api/recipes/generate", body);
    assert.equal(timedOut.status, 504); assert.equal((await timedOut.json()).retryable, true);
    mode = "rate";
    assert.equal((await post("/api/recipes/generate", body)).status, 429);
    mode = "ok";
    const saved = await post("/api/recipes", preview.recipe);
    assert.equal(saved.status, 201);
    const savedRecipe = await saved.json();
    const list = await (await fetch(`${base}/api/recipes`)).json();
    assert.equal(list.length, 1); assert.deepEqual(list[0].ingredients, preview.recipe.ingredients);
    assert.ok(list[0].tags.includes("ai-generated"));
    // The grocery list reads plain ingredient lines; servings scaling applies like any recipe.
    assert.equal(scaleIngredient(savedRecipe.ingredients[0], 0.5), "300 g chicken thighs");
    for (const name of ["generated_recipe_accepted", "generated_recipe_rejected", "generated_recipe_added_to_plan"]) {
      assert.equal((await post("/api/recipes/generate/events", { name })).status, 204);
    }
    assert.equal((await post("/api/recipes/generate/events", { name: "recipe_cooked" })).status, 400, "no 'cooked' claim");
    assert.equal((await post("/api/recipes/generate/events", { name: "generated_recipe_accepted", recipe: "x" })).status, 400, "no extra data");
    assert.ok(logs.some(line => line === "ai_event name=generated_recipe_added_to_plan"));
    assert.ok(logs.filter(line => line.startsWith("ai_event")).every(line => /^ai_event name=[a-z_]+$/.test(line)), "events carry no personal data");
  } finally {
    console.log = log;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }

  // 7b. Public AI mode (TABLEWISE_PUBLIC_AI): signed-out visitors may generate and save AI recipes only.
  for (const publicAI of [true, false]) {
    const rows2 = new Map<string, any>();
    const store2: RecipeStorage = { ...storage,
      async getAllRecipes() { return [...rows2.values()]; },
      async createRecipe(input) { const row = { ...structuredClone(input), id: `p-${rows2.size + 1}`, createdAt: new Date(), updatedAt: new Date() }; rows2.set(row.id, row); return row as any; } };
    const app2 = express(), server2 = createServer(app2);
    await registerRoutes(server2, app2, { storage: store2, ai: () => ai, nutrition: async r => r as any,
      config: { aiEnabled: true, operatorToken: token, production: false, publicCatalog: true, publicAI } });
    app2.use(apiErrorHandler);
    server2.listen(0, "127.0.0.1"); await once(server2, "listening");
    const base2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}`;
    const visitor = (path: string, payload: unknown, origin: string | null = base2) => fetch(`${base2}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(payload) });
    const quiet = console.log; console.log = () => {};
    try {
      const gen = await visitor("/api/recipes/generate", body);
      if (!publicAI) {
        assert.equal(gen.status, 403, "off by default: operator sign-in still required");
        assert.equal((await visitor("/api/recipes", out.recipe)).status, 403);
        continue;
      }
      assert.equal(gen.status, 200, "public visitors can generate");
      const recipe = (await gen.json()).recipe;
      assert.equal((await visitor("/api/recipes/generate", body, null)).status, 403, "same-origin only");
      assert.equal((await visitor("/api/recipes/generate", body, "http://evil.test")).status, 403, "cross-site blocked");
      assert.equal((await visitor("/api/recipes/generate/events", { name: "generated_recipe_accepted" })).status, 204);
      assert.equal((await visitor("/api/recipes", recipe)).status, 201, "accepted AI recipe can be saved");
      assert.equal((await visitor("/api/recipes", { ...recipe, tags: ["meal:dinner"] })).status, 403, "only AI-generated recipes");
      assert.equal(rows2.size, 1);
      assert.equal((await fetch(`${base2}/api/recipes/p-1`, { method: "DELETE", headers: { Origin: base2 } })).status, 403, "other writes still need sign-in");
      assert.equal((await visitor("/api/analyze-recipe", { title: "x" })).status, 403, "other AI tools still need sign-in");
      // The shared AI budget still caps spend for everyone (5 per minute).
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await visitor("/api/recipes/generate", body)).status);
      assert.ok(statuses.includes(429), `AI budget enforced: ${statuses}`);
    } finally {
      console.log = quiet;
      server2.closeAllConnections(); await new Promise<void>(resolve => server2.close(() => resolve()));
    }
  }

  // 8. Curated development catalog keeps accepted AI recipes visible after reload; other extra rows stay hidden.
  process.env.NODE_ENV = "development"; process.env.TABLEWISE_DEV_CURATED_CATALOG = "true";
  const { curatedDevelopmentIds, curateDevelopmentCatalog } = await import("../server/seeds/curated-development-catalog");
  const curated = curatedDevelopmentIds.map(id => ({ id, steps: ["Bake in the oven."], tags: [] as string[], servings: "4", prepTime: 5, cookTime: 10 }));
  const catalog = curateDevelopmentCatalog([...curated,
    { id: "ai-1", steps: ["Mix."], tags: ["ai-generated"], servings: "2", prepTime: 5, cookTime: 0 },
    { id: "other-1", steps: ["Mix."], tags: [], servings: "2", prepTime: 5, cookTime: 0 }]);
  assert.equal(catalog.length, curatedDevelopmentIds.length + 1);
  assert.equal(catalog.at(-1)!.id, "ai-1"); assert.equal((catalog.at(-1) as { developmentReadOnly?: boolean }).developmentReadOnly, false);
  assert.ok(!catalog.some(r => r.id === "other-1"));

  console.log("PASS meals AI generation: shared filter unchanged, serialization with personal filters reported, strict validation, context builder, compliant output + dietary/method/meal/time/protein/exclude violations, structured output and retry/timeout, HTTP auth/400/504/429/preview-only/save/list, events without personal data, public AI mode (opt-in, same-origin, AI-only saves, budget), curated catalog keeps accepted AI recipes. OpenAI mocked.");
}
main().catch(error => { console.error(error); process.exit(1); });
