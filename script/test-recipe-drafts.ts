// Draft → approve → publish over HTTP against a real, disposable PostgreSQL database (OpenAI is an in-memory fake).
// Usage: TABLEWISE_TEST_DATABASE_URL=postgresql://…/<name>_test npm run test:recipe-drafts
// The database name must end in "_test"; it is reset by this script. DATABASE_URL is never used.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type OpenAI from "openai";
import * as schema from "../shared/schema";
import { DatabaseStorage } from "../server/storage";
import { databaseDraftStore } from "../server/recipe-drafts";
import { registerRoutes, OWNER_DAILY_GENERATIONS } from "../server/routes";
import { apiErrorHandler, type PilotConfig } from "../server/security";
import { recipeNameMatches } from "../client/src/lib/planner-filters";

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database whose name ends in _test.");

const good = {
  title: "Gluten-Free Pumpkin Pie", description: "Silky and spiced.", tip: "", servings: "6", prepTime: 25, cookTime: 55,
  mealTypes: ["dinner"], lunchbox: "none", dietary: ["glutenFree"],
  ingredients: [{ quantity: "200", unit: "g", name: "gluten-free flour" }, { quantity: "400", unit: "g", name: "pumpkin puree" }],
  steps: ["Blind-bake the crust in the oven at 190°C.", "Fill and bake until set."],
};
const request = {
  schemaVersion: 1, recipeName: "Pumpkin Pie", source: "recipe_search", timeMode: "preparation",
  filters: { maxMinutes: 30, dietary: ["Gluten-free"], mealType: [], cookingMethod: [], proteinType: [], servings: null, mustInclude: [], mustExclude: [] },
};

async function main() {
  // Fresh schema from shared/schema.ts, then the hand-written migration must recreate the new table on its own.
  const env = { ...process.env, DATABASE_URL: url };
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "push", "--force"], { env, stdio: "ignore" });
  await pool.query("DROP TABLE recipe_generations");
  await pool.query(readFileSync("migrations/0005_recipe_generations.sql", "utf8"));
  const db = drizzle(pool, { schema });
  const storage = new DatabaseStorage(db);
  const existing = await storage.createRecipe({ title: "Banana bread", ingredients: ["3 bananas"], steps: ["Bake."], tags: [] });

  let reply: unknown = good, failure: Error | null = null, aiCalls = 0, clock = Date.now();
  const ai = { chat: { completions: { async create() {
    aiCalls++;
    if (failure) throw failure;
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] };
  } } } } as unknown as OpenAI;
  const start = async (config: Partial<PilotConfig>) => {
    const app = express(), server = createServer(app);
    await registerRoutes(server, app, { storage, drafts: databaseDraftStore(db), ai: () => ai, nutrition: async r => r as any, now: () => clock,
      config: { aiEnabled: true, production: false, publicCatalog: true, publicAI: true, operatorToken: "t".repeat(40), ...config } });
    app.use(apiErrorHandler);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  };
  const { server, base } = await start({});
  const tick = () => { clock += 61_000; }; // keeps the shared per-minute AI budget out of the way
  // A browser: same-origin, keeps whatever owner cookie the server gives it.
  const browser = () => {
    let cookie = "";
    return async (method: string, path: string, body?: unknown, raw?: string) => {
      const res = await fetch(`${base}${path}`, { method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        headers: { Origin: base, ...(method === "GET" ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) } });
      const set = res.headers.get("set-cookie")?.match(/tablewise_owner=[a-f0-9]{64}/)?.[0];
      if (set) cookie = set;
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  };
  const alice = browser(), bob = browser(), carol = browser();
  const quiet = console.log, quietError = console.error;
  console.log = () => {}; console.error = () => {};
  try {
    // Generation: validation before any AI call.
    assert.equal((await alice("POST", "/api/recipe-generations", undefined, "{not json")).status, 400, "invalid JSON");
    assert.equal((await alice("POST", "/api/recipe-generations", { ...request, recipeName: undefined })).status, 400, "missing required field");
    const contradiction = await alice("POST", "/api/recipe-generations", { ...request, filters: { ...request.filters, mustInclude: ["plain flour"] } });
    assert.equal(contradiction.status, 400, "contradictory filters"); assert.equal(contradiction.body.conflicts.length, 1);
    assert.equal(aiCalls, 0, "nothing invalid reaches the model");

    // AI failure and invalid AI output: clear errors, nothing saved.
    tick(); failure = Object.assign(new Error("private"), { name: "APIConnectionTimeoutError" });
    assert.equal((await alice("POST", "/api/recipe-generations", request)).status, 504);
    tick(); failure = null; reply = { ...good, steps: [] };
    assert.equal((await alice("POST", "/api/recipe-generations", request)).status, 502);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM recipe_generations")).rows[0].n, 0);

    // Alice generates a private draft.
    tick(); reply = good;
    const created = await alice("POST", "/api/recipe-generations", request);
    assert.equal(created.status, 201);
    const draft = created.body;
    assert.equal(draft.status, "draft"); assert.equal(draft.recipeName, "Pumpkin Pie");
    assert.deepEqual(draft.request.filters.dietary, ["Gluten-free"], "original request preserved");
    assert.equal(draft.ownerId, undefined, "owner identity never sent to the browser");
    const [row] = (await pool.query("SELECT owner_id, model, prompt_version FROM recipe_generations")).rows;
    assert.match(row.owner_id, /^[a-f0-9]{64}$/, "only a hash of the owner cookie is stored");
    assert.equal(row.prompt_version, "recipe-generation/3+recipe-name/1");

    // Private before approval: not in the shared list, not readable or editable by anyone else.
    const titles = async () => ((await bob("GET", "/api/recipes")).body as { title: string }[]).map(r => r.title);
    assert.deepEqual(await titles(), ["Banana bread"]);
    assert.equal((await alice("GET", `/api/recipe-drafts/${draft.id}`)).status, 200);
    assert.equal((await bob("GET", `/api/recipe-drafts/${draft.id}`)).status, 404);
    assert.equal((await bob("PATCH", `/api/recipe-drafts/${draft.id}`, { title: "Hijacked pie" })).status, 404);
    assert.equal((await bob("POST", `/api/recipe-drafts/${draft.id}/approve`, {})).status, 404);
    tick(); assert.equal((await bob("POST", `/api/recipe-drafts/${draft.id}/regenerate`, {})).status, 404);

    // Alice edits: validated, and a broken dietary claim is dropped and shown.
    assert.equal((await alice("PATCH", `/api/recipe-drafts/${draft.id}`, { ingredients: [] })).status, 400, "invalid edit");
    assert.equal((await alice("PATCH", `/api/recipe-drafts/${draft.id}`, { tags: ["vegetarian"] })).status, 400, "tags are server-controlled");
    const flour = await alice("PATCH", `/api/recipe-drafts/${draft.id}`, { ingredients: [...draft.recipe.ingredients, "2 tbsp plain flour"] });
    assert.equal(flour.status, 200);
    assert.ok(!flour.body.recipe.tags.includes("glutenFree")); assert.deepEqual(flour.body.violations, [{ filter: "dietary", value: "Gluten-free" }]);
    const fixed = await alice("PATCH", `/api/recipe-drafts/${draft.id}`, { ingredients: draft.recipe.ingredients, title: "Gluten-Free Pumpkin Pie (no-roll crust)", description: "Easy." });
    assert.equal(fixed.status, 200); assert.equal(fixed.body.description, "Easy.");
    assert.ok(!fixed.body.recipe.tags.includes("glutenFree"), "a dropped claim is not restored by an edit");
    tick(); const regenerated = await alice("POST", `/api/recipe-drafts/${draft.id}/regenerate`, {});
    assert.equal(regenerated.status, 200); assert.equal(regenerated.body.attempts, 2);
    assert.ok(regenerated.body.recipe.tags.includes("glutenFree"), "regeneration re-verifies from scratch");

    // Approval: unauthenticated (no public AI, no operator) cannot publish.
    const closed = await start({ publicAI: false });
    const anon = await fetch(`${closed.base}/api/recipe-drafts/${draft.id}/approve`, { method: "POST", headers: { Origin: closed.base, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(anon.status, 403);
    closed.server.closeAllConnections(); closed.server.close();

    // Concurrent approvals: exactly one recipe, one 201, the same id everywhere. A slow recipe INSERT
    // (test-only trigger) holds the race window open, so this fails if approvals are not serialized.
    await pool.query(`CREATE FUNCTION slow_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
      CREATE TRIGGER slow_insert BEFORE INSERT ON recipes FOR EACH ROW EXECUTE FUNCTION slow_insert();`);
    const approvals = await Promise.all(Array.from({ length: 5 }, () => alice("POST", `/api/recipe-drafts/${draft.id}/approve`, {})));
    await pool.query("DROP TRIGGER slow_insert ON recipes; DROP FUNCTION slow_insert();");
    assert.deepEqual(approvals.map(a => a.status).sort(), [200, 200, 200, 200, 201]);
    const recipeId = approvals[0].body.recipe.id;
    assert.ok(approvals.every(a => a.body.recipe.id === recipeId));
    assert.equal((await alice("POST", `/api/recipe-drafts/${draft.id}/approve`, {})).body.recipe.id, recipeId, "repeat approval is idempotent");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM recipes WHERE title ILIKE '%pumpkin%'")).rows[0].n, 1);
    const [published] = (await pool.query("SELECT status, recipe_id, approved_by, approved_at, published_at FROM recipe_generations")).rows;
    assert.equal(published.status, "published"); assert.equal(published.recipe_id, recipeId);
    assert.equal(published.approved_by, row.owner_id); assert.ok(published.approved_at && published.published_at);
    assert.equal((await alice("PATCH", `/api/recipe-drafts/${draft.id}`, { title: "Changed" })).status, 409, "published content is read-only here");
    tick(); assert.equal((await alice("POST", `/api/recipe-drafts/${draft.id}/regenerate`, {})).status, 409);

    // Shared library: Bob finds it by name with the same filters, and generating again costs no AI call.
    const list = (await bob("GET", "/api/recipes")).body as { id: string; title: string; tags: string[]; prepTime: number }[];
    const found = list.find(r => r.id === recipeId)!;
    assert.ok(recipeNameMatches(found.title, "pumpkin pie") && found.tags.includes("glutenFree") && found.prepTime <= 30);
    assert.equal((await bob("GET", `/api/recipes/${recipeId}`)).status, 200, "works with the recipe detail screen");
    const before = aiCalls; tick();
    const again = await bob("POST", "/api/recipe-generations", request);
    assert.equal(again.status, 409); assert.equal(again.body.matches[0].id, recipeId); assert.equal(aiCalls, before, "no second AI request");
    assert.equal((await bob("PATCH", `/api/recipes/${recipeId}`, { title: "Mine now" })).status, 403, "public recipes are read-only for customers");
    assert.equal((await bob("GET", `/api/recipes/${existing.id}`)).body.title, "Banana bread", "existing recipes untouched");

    // Per-owner daily quota (regenerations count too); other owners are unaffected.
    clock += 3600_000;
    const other = { ...request, recipeName: "Pumpkin Bread" };
    reply = { ...good, title: "Gluten-Free Pumpkin Bread" };
    const statuses: number[] = [];
    for (let i = 0; i <= OWNER_DAILY_GENERATIONS; i++) { tick(); statuses.push((await carol("POST", "/api/recipe-generations", other)).status); }
    assert.deepEqual(statuses, [...Array(OWNER_DAILY_GENERATIONS).fill(201), 429]);
    tick(); assert.equal((await bob("POST", "/api/recipe-generations", other)).status, 201, "quota is per owner");
  } finally {
    console.log = quiet; console.error = quietError;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
  console.log("PASS recipe drafts (PostgreSQL): validation/contradictions before AI, AI failure + invalid output save nothing, private drafts (list/read/edit/approve/regenerate by others → 404), validated edits with dietary re-verification, regenerate, unauthenticated publish refused, 5 concurrent approvals → 1 recipe, idempotent re-approval, provenance, shared search + no second AI call, read-only public recipes, per-owner quota, migration SQL applies.");
}
main().catch(error => { console.error(error); process.exit(1); });
