import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import type OpenAI from "openai";
import type { Recipe } from "../shared/schema";
import { registerRoutes, type RecipeStorage } from "../server/routes";
import { apiErrorHandler, RequestBudget, type PilotConfig } from "../server/security";
import { maxAudioBytes } from "../server/request-schemas";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { DatabaseStorage } from "../server/storage";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";

const token = randomBytes(32).toString("hex"); // Synthetic test credential, never printed.
const sample = { title: "Test dinner", ingredients: ["1 cup rice"], steps: ["Cook the rice."] };
const stored = (id: string): Recipe => ({
  ...sample, id, image: null, sourceUrl: null, cookTime: null, servings: null, tags: null,
  createdAt: new Date(), updatedAt: new Date(),
});
const quietLogs: string[] = [];
const savedLog = console.log;
const savedError = console.error;
const secretMarker = "PRIVATE_PROVIDER_PAYLOAD_DO_NOT_LOG";

async function fixture(overrides: Partial<PilotConfig> = {}, externalStore?: RecipeStorage) {
  let now = 100_000;
  let writes = 0, aiCalls = 0;
  let failProvider = false, failDB = false, invalidAI = false, holdAI = false;
  const releases: (() => void)[] = [];
  const rows = new Map([["fixture", stored("fixture")]]);
  const store: RecipeStorage = externalStore ?? {
    async getAllRecipes() { if (failDB) throw new Error(secretMarker); return [...rows.values()]; },
    async getRecipe(id) { return rows.get(id); },
    async createRecipe(value) {
      writes++;
      const row = { ...stored(randomUUID()), ...value };
      rows.set(row.id, row); return row;
    },
    async updateRecipe(id, value) {
      writes++;
      const row = rows.get(id);
      if (!row) return undefined;
      Object.assign(row, value); return row;
    },
    async deleteRecipe(id) { writes++; return rows.delete(id); },
  };
  async function provider() {
    aiCalls++;
    if (holdAI) await new Promise<void>(resolve => releases.push(resolve));
    if (failProvider) throw new Error(secretMarker);
  }
  const fakeAI = {
    chat: { completions: { async create(input: { model: string; max_completion_tokens?: number }) {
      await provider();
      assert.ok(input.max_completion_tokens && input.max_completion_tokens <= 2048);
      return { choices: [{ message: { content: input.model === "gpt-4o-mini" ? "Corrected rice recipe" :
        JSON.stringify(invalidAI ? { title: "Incomplete" } : sample) } }] };
    } } },
    audio: { transcriptions: { async create() { await provider(); return { text: "Cook rice." }; } } },
  } as unknown as OpenAI;
  const app = express(), server = createServer(app);
  await registerRoutes(server, app, {
    config: { operatorToken: token, publicCatalog: true, aiEnabled: false, production: false, ...overrides },
    storage: store, ai: () => fakeAI, now: () => now,
  });
  app.use(apiErrorHandler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base, store, rows,
    get writes() { return writes; }, get aiCalls() { return aiCalls; },
    advance(ms: number) { now += ms; },
    failProvider() { failProvider = true; }, failDB() { failDB = true; },
    invalidAI() { invalidAI = true; },
    holdAI() { holdAI = true; }, releaseAI() { holdAI = false; releases.splice(0).forEach(fn => fn()); },
    async request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
      return fetch(`${base}${path}`, {
        method, redirect: "manual", headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    async close() { this.releaseAI(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const auth = { Authorization: `Bearer ${token}` };
let groups = 0;
async function check(name: string, test: (f: Fixture) => Promise<void>, config: Partial<PilotConfig> = {}) {
  const f = await fixture(config);
  try { await test(f); groups++; savedLog(`PASS: ${name}`); } finally { await f.close(); }
}
const status = async (response: Promise<Response>, expected: number) => {
  const r = await response; assert.equal(r.status, expected, await r.text()); return r;
};

async function main() {
  console.log = (...args) => { quietLogs.push(args.join(" ")); };
  console.error = (...args) => { quietLogs.push(args.join(" ")); };
  try {
    await check("anonymous reads work; POST/PATCH/DELETE and every paid route reject before side effects", async f => {
      await status(f.request("/api/recipes"), 200);
      await status(f.request("/api/recipes/fixture"), 200);
      for (const [path, method] of [
        ["/api/recipes", "POST"], ["/api/recipes/fixture", "PATCH"], ["/api/recipes/fixture", "DELETE"],
        ["/api/parse-recipe", "POST"], ["/api/transcribe-audio", "POST"],
        ["/API/recipes/", "POST"], ["/api/generate-image", "POST"], ["/api/future-write", "POST"],
      ]) await status(f.request(path, method, sample), 403);
      await status(f.request("/api/recipes", "POST", sample, { Authorization: "Bearer wrong" }), 403);
      await status(f.request("/api/recipes", "POST", sample, { Cookie: "operator=true", "X-Operator": "true", "X-Forwarded-For": "127.0.0.1" }), 403);
      assert.equal(f.writes, 0); assert.equal(f.aiCalls, 0);
    });
    await check("without operator configuration, writes stay disabled even in development", async f => {
      await status(f.request("/api/recipes", "POST", sample, auth), 403);
      assert.equal(f.writes, 0);
    }, { operatorToken: undefined });
    await check("catalog exposure requires review; operator can inspect unapproved catalog", async f => {
      await status(f.request("/api/recipes"), 503);
      await status(f.request("/api/recipes/fixture"), 503);
      await status(f.request("/api/recipes", "GET", undefined, auth), 200);
    }, { publicCatalog: false });
    await check("operator create/update/delete retain behavior; malformed and mass-assignment data never reaches storage", async f => {
      const r = await f.request("/api/recipes", "POST", sample, auth);
      assert.equal(r.status, 201); const created = await r.json() as Recipe;
      await status(f.request(`/api/recipes/${created.id}`, "PATCH", { title: "Updated" }, auth), 200);
      for (const body of [{}, { id: "hijack" }, { createdAt: "fake" }, { updatedAt: "fake" }, { title: "" },
        { cookTime: -1 }, { ingredients: [] }, { image: "javascript:alert(1)" }, { image: "not-a-url" }, { tags: ["x".repeat(51)] },
        { title: "x".repeat(201) }, { sourceUrl: "https://user:pass@example.com" }]) {
        await status(f.request(`/api/recipes/${created.id}`, "PATCH", body, auth), 400);
      }
      await status(f.request("/api/recipes", "POST", { ...sample, ingredients: Array(101).fill("rice") }, auth), 400);
      await status(f.request("/api/recipes", "POST", { ...sample, unknown: "field" }, auth), 400);
      await status(f.request(`/api/recipes/${created.id}`, "DELETE", undefined, auth), 200);
      assert.equal(f.writes, 3);
      await status(f.request("/api/recipes/missing"), 404);
      await status(f.request(`/api/recipes/${"x".repeat(151)}`), 400);
    });
    await check("bounded JSON, invalid JSON, wrong content types and errors do not crash server", async f => {
      await status(f.request("/api/recipes", "POST", { ...sample, title: "x".repeat(70000) }, auth), 413);
      const malformed = await fetch(`${f.base}/api/recipes`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{" });
      assert.equal(malformed.status, 400);
      assert.deepEqual(await malformed.json(), { error: "Invalid request body." });
      await status(fetch(`${f.base}/api/recipes`, { method: "POST", headers: { ...auth, "Content-Type": "text/plain" }, body: "text" }), 415);
      await status(fetch(`${f.base}/api/recipes`, { method: "POST", headers: { ...auth, "Content-Type": "application/json", "Content-Encoding": "gzip" }, body: "compressed" }), 415);
      assert.equal(f.writes, 0);
      await status(f.request("/api/recipes"), 200);
    });
    await check("AI remains disabled with valid operator credentials until separately enabled", async f => {
      await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 503);
      await status(f.request("/api/transcribe-audio", "POST", { audio: "YQ==" }, auth), 503);
      assert.equal(f.aiCalls, 0);
    });
    await check("enabled AI works only for operator, enforces input/output bounds and never returns provider errors", async f => {
      await status(f.request("/api/parse-recipe", "POST", { transcript: "Cook rice" }, auth), 200);
      await status(f.request("/api/parse-recipe", "POST", { transcript: "x".repeat(12001) }, auth), 400);
      await status(f.request("/api/parse-recipe", "POST", { transcript: " " }, auth), 400);
      f.invalidAI();
      await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 502);
      f.failProvider();
      const error = await f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth);
      assert.equal(error.status, 502); assert.doesNotMatch(await error.text(), /PRIVATE_PROVIDER/);
      assert.equal(f.aiCalls, 3);
      await status(f.request("/api/recipes"), 200);
    }, { aiEnabled: true });
    await check("audio validates base64/type/language/decoded size and retains transcription plus optional verification", async f => {
      for (const body of [
        { audio: "!@#$" }, { audio: "YQ==", mimeType: "text/plain" },
        { audio: "YQ==", language: "arbitrary" },
        { audio: Buffer.alloc(maxAudioBytes + 1).toString("base64") },
      ]) {
        f.advance(61_000);
        await status(f.request("/api/transcribe-audio", "POST", body, auth), 400);
      }
      assert.equal(f.aiCalls, 0);
      f.advance(61_000);
      await status(f.request("/api/transcribe-audio", "POST", { audio: "YQ==", mimeType: "audio/webm;codecs=opus", language: "en" }, auth), 200);
      assert.equal(f.aiCalls, 2);
      await status(f.request("/api/transcribe-audio", "POST", { audio: "YQ==", verifyText: false }, auth), 200);
      assert.equal(f.aiCalls, 3);
      await status(f.request("/api/transcribe-audio", "POST", { audio: "A".repeat(6 * 1024 * 1024 + 1) }, auth), 413);
    }, { aiEnabled: true });
    await check("operator browser session: login, CSRF rejection, no JS-readable credential, expiry and logout", async f => {
      await status(f.request("/operator"), 200);
      await status(f.request("/api/operator/session", "POST", { token }), 403);
      const login = await f.request("/api/operator/session", "POST", { token }, { Origin: f.base });
      assert.equal(login.status, 303);
      const setCookie = login.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
      assert.doesNotMatch(setCookie, new RegExp(token));
      const cookie = { Cookie: setCookie.split(";")[0] };
      await status(f.request("/api/recipes", "POST", sample, cookie), 403);
      await status(f.request("/api/recipes", "POST", sample, { ...cookie, Origin: "https://evil.example" }), 403);
      await status(f.request("/api/recipes", "POST", sample, { ...cookie, Origin: f.base }), 201);
      await status(f.request("/api/operator/logout", "POST", undefined, { ...cookie, Origin: f.base }), 303);
      await status(f.request("/api/recipes", "POST", sample, { ...cookie, Origin: f.base }), 403);
      const second = await f.request("/api/operator/session", "POST", { token }, { Origin: f.base });
      const expiredCookie = { Cookie: second.headers.get("set-cookie")!.split(";")[0], Origin: f.base };
      f.advance(3600_001);
      await status(f.request("/api/recipes", "POST", sample, expiredCookie), 403);
    });
    await check("production browser sessions require HTTPS origin and set Secure cookies", async f => {
      await status(f.request("/api/operator/session", "POST", { token }, { Origin: f.base }), 403);
      const r = await f.request("/api/operator/session", "POST", { token }, { Origin: f.base.replace("http:", "https:") });
      assert.equal(r.status, 303); assert.match(r.headers.get("set-cookie")!, /; Secure/);
    }, { production: true });
    await check("login brute-force throttling ignores spoofed forwarding headers", async f => {
      for (let i = 0; i < 5; i++) await status(f.request("/api/operator/session", "POST", { token: "x".repeat(64) }, { Origin: f.base }), 403);
      const response = await f.request("/api/operator/session", "POST", { token }, { Origin: f.base, "X-Forwarded-For": "8.8.8.8" });
      assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0);
    });
    await check("AI daily/minute budgets and concurrent work are capped", async f => {
      for (let i = 0; i < 5; i++) await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 200);
      await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 429);
      assert.equal(f.aiCalls, 5);
      f.advance(61_000); f.holdAI();
      const one = f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth);
      const two = f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth);
      for (let i = 0; i < 100 && f.aiCalls < 7; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(f.aiCalls, 7);
      await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 429);
      f.releaseAI();
      await status(one, 200); await status(two, 200);
      f.advance(86400_001);
      for (let i = 0; i < 40; i++) {
        // 5/minute, at most 20/hour, 40/day; advance enough to avoid smaller windows.
        if (i && i % 20 === 0) f.advance(3600_001);
        else if (i && i % 5 === 0) f.advance(61_000);
        await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 200);
        if (i === 19) {
          f.advance(61_000);
          await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 429);
        }
      }
      f.advance(3600_001);
      await status(f.request("/api/parse-recipe", "POST", { transcript: "Rice" }, auth), 429);
    }, { aiEnabled: true });
    await check("database failures are sanitized and analytics inspection is protected before future registration", async f => {
      f.failDB();
      const r = await f.request("/api/recipes");
      assert.equal(r.status, 500); assert.doesNotMatch(await r.text(), /PRIVATE_PROVIDER/);
      for (const path of ["/api/analytics", "/api/analytics/events", "/api/analytics/results", "/api/analytics/raw"]) {
        await status(f.request(path), 403);
        await status(f.request(path, "GET", undefined, auth), 404);
      }
      await status(f.request("/api/unknown"), 404);
    });
    await check("operator write quota limits bulk changes independently of public traffic", async f => {
      for (let i = 0; i < 30; i++) await status(f.request("/api/recipes/fixture", "PATCH", { title: "Operator" }, auth), 200);
      await status(f.request("/api/recipes/fixture", "PATCH", { title: "Over budget" }, auth), 429);
      assert.equal(f.writes, 30);
    });
    await check("general request limits bound untrusted traffic regardless of X-Forwarded-For", async f => {
      for (let i = 0; i < 120; i++) await status(f.request("/api/operator/session"), 200);
      await status(f.request("/api/operator/session", "GET", undefined, { "X-Forwarded-For": "9.9.9.9" }), 429);
      f.advance(60_001); await status(f.request("/api/operator/session"), 200);
    });
    let clock = 0;
    const capped = new RequestBudget(() => clock, 2);
    assert.equal(capped.take("a", 1, 1000), 0);
    assert.equal(capped.take("b", 1, 1000), 0);
    assert.equal(capped.take("c", 1, 1000), 1);
    clock = 1001; assert.equal(capped.take("c", 1, 1000), 0);
    assert.ok(!quietLogs.some(line => line.includes(secretMarker) || line.includes(token) || line.includes(sample.title) || line.includes("Corrected rice")));
    savedLog("PASS: bounded limiter memory; logs contain no bodies, provider details or credentials.");
    groups++;

    const socket = testSocketArgument();
    if (socket) {
      const pool = await openLocalTestDatabase(socket);
      // Read/write tests only after helper verifies local storage, private socket, no TCP.
      const baseline = (await pool.query("SELECT * FROM recipes ORDER BY id")).rows;
      const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
      assert.equal(baseline.length, 12, "Only the reviewed catalog should be present.");
      assert.deepEqual(baseline.map(row => row.id).sort(), dinnerCatalog.map(row => row.id).sort());
      const dbStore = new DatabaseStorage(drizzle(pool, { schema }));
      for (const expected of dinnerCatalog) {
        const actual = await dbStore.getRecipe(expected.id);
        assert.ok(actual);
        for (const [key, value] of Object.entries(expected)) {
          assert.deepEqual(actual[key as keyof Recipe], value, "Reviewed seed contents must match.");
        }
      }
      let id: string | undefined;
      const f = await fixture({}, dbStore);
      try {
        await status(f.request("/api/recipes"), 200);
        await status(f.request("/api/recipes", "POST", sample), 403);
        await status(f.request(`/api/recipes/${baseline[0].id}`, "PATCH", { title: "Unauthorized" }), 403);
        await status(f.request(`/api/recipes/${baseline[0].id}`, "DELETE"), 403);
        assert.equal(hash((await pool.query("SELECT * FROM recipes ORDER BY id")).rows), hash(baseline));
        const created = await f.request("/api/recipes", "POST", sample, auth);
        assert.equal(created.status, 201);
        id = (await created.json() as Recipe).id;
        await status(f.request(`/api/recipes/${id}`, "PATCH", { title: "Operator update" }, auth), 200);
        assert.equal((await pool.query("SELECT title FROM recipes WHERE id=$1", [id])).rows[0].title, "Operator update");
        await status(f.request(`/api/recipes/${id}`, "DELETE", undefined, auth), 200);
        assert.equal(hash((await pool.query("SELECT * FROM recipes ORDER BY id")).rows), hash(baseline));
        savedLog(`PASS: isolated database permission checks; reviewed baseline unchanged (${baseline.length} rows).`);
        groups++;
      } finally {
        await f.close();
        if (id) await pool.query("DELETE FROM recipes WHERE id=$1", [id]); // This test's unique fixture only.
        await pool.end();
      }
    } else savedLog("Isolated database integration not requested; no database was opened.");
    savedLog(`Completed ${groups} security test groups. No real AI calls.`);
  } finally { console.log = savedLog; console.error = savedError; }
}
main().catch(error => { savedError(error); process.exitCode = 1; });
