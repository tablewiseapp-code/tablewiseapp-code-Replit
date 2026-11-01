import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import type OpenAI from "openai";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { recipes } from "../shared/schema";
import { createRecipeAnalyzer } from "../server/recipe-analysis";
import { registerRoutes, type RecipeStorage } from "../server/routes";
import { DatabaseStorage } from "../server/storage";
import { apiErrorHandler } from "../server/security";
import { recipeInput } from "../server/request-schemas";
import { analysisMatches, statedDuration, stepAnalysisSchema, stepDurationSchema, timingContext, timingContextSchema, type TimingContext, type StepAnalysis } from "../shared/step-timing";
import { currentAnalysis } from "../client/src/components/step-timing";
import { recipeStageMinutes } from "../client/src/lib/recipe-time";
import { recipeParseCache } from "../server/recipe-parse-cache";

export const example: TimingContext = {
  title: "Smoky Mountain Cheesy Crawfish Omelette",
  ingredients: ["450 g boneless fish fillets", "1 tbsp olive oil", "1 tbsp lemon juice",
    "2 garlic cloves, minced", "1 tsp paprika", "2 tbsp chopped parsley", "Salt and pepper, to taste"],
  steps: ["Pat fish dry and season with salt, pepper and paprika.",
    "Heat oil in a nonstick frying pan over medium heat.",
    "Cook fish until opaque and it flakes easily; use safe internal temperature guidance.",
    "Finish with garlic, lemon and parsley; serve."],
  prepTime: 10, cookTime: 15, servings: "2",
};
export const outputFor = (recipe: TimingContext) => ({
  steps: recipe.steps.map(text => ({ text, min: 2, max: 4, unit: "minutes", provenance: "estimate" })),
  warnings: ["Title mentions crawfish and omelette, but the ingredients and instructions use fish fillets. Review the supplied recipe."],
});

export async function fixture(aiEnabled = true, externalStorage?: RecipeStorage) {
  let calls = 0, writes = 0, now = 100000;
  let mode = "ok";
  const releases: (() => void)[] = [];
  const token = randomBytes(32).toString("hex");
  const rows = new Map<string, any>();
  const storage: RecipeStorage = externalStorage ?? {
    async getAllRecipes() { return [...rows.values()]; },
    async getRecipe(id) { return rows.get(id); },
    async createRecipe(input) {
      if (mode === "storage") throw { code: "42703", message: "column step_analysis does not exist" };
      writes++;
      const row = { image: null, sourceUrl: null, cookTime: null, servings: null, tags: null,
        ...structuredClone(input), id: "imported", createdAt: new Date(), updatedAt: new Date() };
      rows.set(row.id, row); return structuredClone(row);
    },
    async updateRecipe() { throw new Error("Unused"); },
    async updateRecipeCredit() { throw new Error("Unused"); },
    async deleteRecipe() { throw new Error("Unused"); },
  };
  const ai = { audio: { transcriptions: { async create() { return { text: "Dictated example recipe" }; } } },
    chat: { completions: { async create(input: any, options: any) {
    calls++;
    if (!input.response_format) return { choices: [{ message: { content: "Dictated example recipe" } }] };
    if (input.model === "gpt-4o") return { choices: [{ message: { content: JSON.stringify(example) } }] };
    assert.equal(options.timeout, 20000);
    assert.equal(options.maxRetries, 0);
    assert.match(input.messages[0].content, /UNTRUSTED DATA/);
    assert.ok(input.max_completion_tokens <= 8192);
    if (mode === "hold") await new Promise<void>(resolve => { releases.push(resolve); });
    if (mode === "timeout") throw new Error("PRIVATE_PROVIDER_ERROR");
    const recipe = JSON.parse(input.messages[1].content);
    const output = outputFor(recipe);
    if (mode === "coverage") output.steps.pop();
    if (mode === "order") output.steps.reverse();
    if (mode === "zero") output.steps[0].min = 0;
    if (mode === "unit") output.steps[0].unit = "days";
    return { choices: [{ finish_reason: mode === "truncated" ? "length" : "stop", message: {
      content: mode === "malformed" ? "not json" : JSON.stringify(output),
      refusal: mode === "refusal" ? "Cannot analyze" : undefined,
    } }] };
  } } } } as unknown as OpenAI;
  const app = express(), server = createServer(app);
  await registerRoutes(server, app, { storage, ai: () => ai, now: () => now,
    config: { aiEnabled, operatorToken: token, production: false, publicCatalog: true } });
  app.use(apiErrorHandler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { app, server, base, ai, storage, token, rows,
    get calls() { return calls; }, get writes() { return writes; },
    mode(value: string) { mode = value; }, advance(ms = 61000) { now += ms; },
    release() { mode = "ok"; releases.splice(0).forEach(fn => fn()); },
    async request(path: string, body: unknown, auth = true) {
      return fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

async function main() {
  for (const [text, expected] of [
    ["Stir for 30 seconds.", { min: 30, max: 30, unit: "seconds" }],
    ["Cook 5–8 minutes.", { min: 5, max: 8, unit: "minutes" }],
    ["Rest 1 to 2 hours.", { min: 1, max: 2, unit: "hours" }],
    ["Stir 1.5 minutes.", { min: 90, max: 90, unit: "seconds" }],
  ] as const) assert.deepEqual(statedDuration(text), expected);
  for (const min of [0, -1, 0.5, Infinity, 604801]) {
    assert.equal(stepDurationSchema.safeParse({ text: "Cook", min, max: min, unit: "seconds", provenance: "source" }).success, false);
  }
  assert.equal(stepDurationSchema.safeParse({ text: "Cook", min: 8, max: 5, unit: "minutes", provenance: "source" }).success, false);
  assert.equal(stepDurationSchema.safeParse({ text: "Cook", min: 169, max: 169, unit: "hours", provenance: "estimate" }).success, false);
  assert.equal(timingContextSchema.safeParse({ ...example, steps: ["x".repeat(2001)] }).success, false);
  assert.equal(timingContextSchema.safeParse({ ...example, ingredients: Array(100).fill("x".repeat(1000)) }).success, false);
  const f = await fixture();
  try {
    assert.equal((await f.request("/api/analyze-recipe", example, false)).status, 403);
    assert.equal(f.calls, 0);
    const response = await f.request("/api/analyze-recipe", example);
    assert.equal(response.status, 200);
    const analysis: StepAnalysis = await response.json();
    assert.equal(analysis.steps.length, 4);
    assert.match(analysis.warnings[0], /crawfish.*fish fillets/);
    assert.equal(analysisMatches(example, analysis), true);
    for (const changed of [{ title: "New" }, { ingredients: ["new"] }, { steps: [...example.steps].reverse() },
      { prepTime: 0 }, { cookTime: 0 }, { servings: "9" }]) {
      assert.equal(currentAnalysis({ ...example, ...changed }, analysis), null);
      assert.equal((await f.request("/api/import-recipe", { ...example, ...changed, stepAnalysis: analysis })).status, 409);
    }
    f.advance();
    assert.equal((await f.request("/api/analyze-recipe", example)).status, 200);
    assert.equal(f.calls, 1, "Unchanged analysis reused");
    assert.equal((await f.request("/api/import-recipe", example)).status, 409);
    const forged = structuredClone(analysis); forged.steps[0].max = 9;
    assert.equal((await f.request("/api/import-recipe", { ...example, stepAnalysis: forged })).status, 409);
    assert.equal((await f.request("/api/import-recipe", { ...example, stepAnalysis: analysis, tags: ["seafood"] })).status, 201);
    const saved = await (await fetch(`${f.base}/api/recipes/imported`)).json();
    assert.deepEqual(saved.stepAnalysis, analysis);
    assert.deepEqual(saved.steps, example.steps);
    assert.deepEqual(saved.tags, ["seafood"]);
    assert.equal(saved.prepTime, 10); assert.equal(saved.cookTime, 15);
    assert.equal(recipeStageMinutes(saved, "total"), 25);
    assert.equal(f.writes, 1);
    f.mode("storage");
    const failedSave = await f.request("/api/import-recipe", { ...example, stepAnalysis: analysis });
    assert.equal(failedSave.status, 503); assert.equal(f.writes, 1);
    f.advance(600001);
    assert.equal((await f.request("/api/import-recipe", { ...example, stepAnalysis: analysis })).status, 409);
    console.log("PASS analysis coverage, supplied inconsistency, stale context, server-validated import, persisted mock round trip, safe storage errors, expiry, unchanged totals");
  } finally { await f.close(); }
  const disabled = await fixture(false);
  try {
    assert.equal((await disabled.request("/api/analyze-recipe", example)).status, 503);
    assert.equal(disabled.calls, 0);
  } finally { await disabled.close(); }
  const failures = await fixture();
  try {
    for (const mode of ["coverage", "order", "zero", "unit", "malformed", "refusal", "truncated", "timeout"]) {
      failures.advance(); failures.mode(mode);
      const response = await failures.request("/api/analyze-recipe", example);
      assert.equal(response.status, 502, mode);
      assert.doesNotMatch(await response.text(), /PRIVATE_PROVIDER/);
      assert.equal(failures.writes, 0);
    }
    failures.mode("ok"); failures.advance();
    assert.equal((await failures.request("/api/analyze-recipe", example)).status, 200);
    console.log("PASS malformed/refused/truncated/timeout/invalid values and coverage failures; retry preserves draft; operator and disabled-AI gates");
  } finally { await failures.close(); }
  const quota = await fixture();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await quota.request("/api/analyze-recipe", example)).status, 200);
    assert.equal((await quota.request("/api/analyze-recipe", example)).status, 429);
    assert.equal(quota.calls, 1);
  } finally { await quota.close(); }
  const concurrency = await fixture();
  try {
    concurrency.mode("hold");
    const pending = [
      concurrency.request("/api/analyze-recipe", example),
      concurrency.request("/api/analyze-recipe", { ...example, title: "Other recipe" }),
    ];
    for (let i = 0; i < 100 && concurrency.calls < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(concurrency.calls, 2);
    assert.equal((await concurrency.request("/api/analyze-recipe", { ...example, title: "Third" })).status, 429);
    concurrency.release();
    assert.deepEqual((await Promise.all(pending)).map(response => response.status), [200, 200]);
  } finally { concurrency.release(); await concurrency.close(); }
  const direct = await fixture();
  try {
    direct.mode("hold");
    const analyzer = createRecipeAnalyzer();
    const first = analyzer.analyze(example, () => direct.ai);
    const second = analyzer.analyze(example, () => direct.ai);
    assert.equal(first, second); assert.equal(direct.calls, 1);
    direct.release(); await first;
    const timed = { ...example, steps: ["Stir 30 seconds.", "Cook 5–8 minutes.", "Rest 1 to 2 hours.", "Serve."] };
    const analysis = await analyzer.analyze(timed, () => direct.ai);
    assert.deepEqual(analysis.steps.map(s => s.provenance), ["source", "source", "source", "estimate"]);
    assert.equal(analysis.steps[1].max, 8);
    console.log("PASS in-flight coalescing, seconds/minutes/hours and ranges retained, missing durations estimated, quotas");
  } finally { await direct.close(); }
  let parseCalls = 0;
  const cache = recipeParseCache<number>();
  assert.deepEqual(await Promise.all([cache("same", async () => ++parseCalls), cache("same", async () => ++parseCalls)]), [1, 1]);
  const sqlQueries: string[] = [];
  const dialect = new PgDialect();
  const oldRow = { ...example, id: "legacy", stepAnalysis: null };
  let row: any = oldRow;
  const storedUpdates: any[] = [];
  const mockDB = { select(columns: any) {
    const query = dialect.sqlToQuery(columns.stepAnalysis);
    sqlQueries.push(query.sql);
    return { from() { return { where() { return [structuredClone(row)]; }, orderBy() { return [structuredClone(row)]; } }; } };
  },
    async execute(query: any) {
      const compiled = dialect.sqlToQuery(query);
      const names = compiled.sql.match(/INSERT INTO "recipes" \(([^)]+)\)/)![1].split(",").map(name => name.trim().replaceAll('"', ""));
      const columns = getTableColumns(recipes);
      for (const [index, name] of names.entries()) {
        const [key, column] = Object.entries(columns).find(([, col]) => col.name === name)!;
        row[key] = column.mapFromDriverValue(compiled.params[index]);
      }
      return { rows: [structuredClone(row)] };
    },
    update() { return { set(values: any) {
      storedUpdates.push(structuredClone(values));
      return { where() { return { returning() {
        row = { ...row, ...structuredClone(values) }; return [structuredClone(row)];
      } }; } };
    } }; },
  };
  const storage = new DatabaseStorage(mockDB as any);
  assert.equal((await storage.getRecipe("legacy"))?.stepAnalysis, null);
  assert.equal((await storage.getAllRecipes())[0].stepAnalysis, null);
  assert.ok(sqlQueries.every(sql => sql.includes("to_jsonb") && !sql.includes('."step_analysis"')));
  await storage.updateRecipe("legacy", { prepTime: 12 });
  assert.equal("stepAnalysis" in storedUpdates.at(-1), false, "Legacy update must not reference missing additive timing column.");
  const analysis = stepAnalysisSchema.parse({ ...outputFor(example), version: 1, context: timingContext(example) });
  await storage.createRecipe({ ...example, stepAnalysis: analysis });
  assert.deepEqual((await storage.getRecipe("legacy"))?.stepAnalysis, analysis);
  await assert.rejects(storage.updateRecipe("legacy", { title: "Changed", stepAnalysis: analysis }), /stale/);
  await storage.updateRecipe("legacy", { steps: ["Changed instruction"] });
  assert.equal(storedUpdates.at(-1).stepAnalysis, null);
  assert.equal((await storage.getRecipe("legacy"))?.stepAnalysis, null);
  assert.equal(recipeInput.safeParse({ ...example, steps: ["Changed"], stepAnalysis: analysis }).success, false);
  assert.equal(recipeInput.safeParse(example).success, true);
  const migration = await readFile("migrations/0004_recipe_step_analysis.sql", "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  console.log("PASS DatabaseStorage mock create/read round trip, context-edit invalidation, stale timing rejection, legacy read SQL/update compatibility; additive migration inspected. No application DB writes or paid provider calls.");
}
if (process.argv[1]?.endsWith("test-step-analysis.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
