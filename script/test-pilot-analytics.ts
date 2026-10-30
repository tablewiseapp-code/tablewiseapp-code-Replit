import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { registerRoutes, type RecipeStorage } from "../server/routes";
import { apiErrorHandler } from "../server/security";
import { PilotEventStore } from "../server/pilot-analytics";
import { analyticsBatchSchema, type AnalyticsBatch, type ClientEventName } from "../shared/pilot-analytics";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { testAnalyticsClient } from "./test-pilot-analytics-client";

const operator = randomBytes(32).toString("hex"); // Test-only credential, never printed.
const now = Date.now();
const event = (name: ClientEventName, week = "2026-10-19", offset = 0) => ({
  name, week, eventId: randomUUID(), occurredAt: new Date(now + offset).toISOString(),
  ...(name === "meal_selected" ? { recipeId: "fixture-dinner" } : {}),
});
const batch = (pilotId: string, events: ReturnType<typeof event>[]) => analyticsBatchSchema.parse({ pilotId, events });

async function fixture(analytics: Pick<PilotEventStore, "record" | "summary">, enabled = true) {
  const app = express(), server = createServer(app);
  let mutations = 0, aiCalls = 0;
  const forbidden = async () => { mutations++; throw new Error("Unexpected recipe write"); };
  const recipes: RecipeStorage = { getAllRecipes: async () => [], getRecipe: async () => undefined,
    createRecipe: forbidden, updateRecipe: forbidden, updateRecipeCredit: forbidden, deleteRecipe: forbidden };
  await registerRoutes(server, app, {
    storage: recipes, analytics, now: () => now,
    config: { operatorToken: operator, publicCatalog: true, production: false, aiEnabled: false, analyticsEnabled: enabled },
    ai: () => { aiCalls++; throw new Error("Unexpected paid AI"); },
  });
  app.use(apiErrorHandler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = "POST", body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Origin: base, ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
  return { request, base, mutations: () => mutations, aiCalls: () => aiCalls,
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }) };
}
async function apiTests() {
  let calls = 0;
  const fake = { record: async (_batch: AnalyticsBatch) => { calls++; },
    summary: async () => ({ events: {}, completedPilots: 0, returningPilots: 0, returnRate: null, cohorts: [] }) };
  const f = await fixture(fake);
  const valid = batch(randomUUID(), [event("planner_opened")]);
  try {
    assert.equal((await f.request("/api/analytics/events", "POST", valid)).status, 204);
    assert.equal(calls, 1);
    assert.equal((await f.request("/api/analytics/events", "POST", valid, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await f.request("/api/analytics/events", "POST", valid, { Origin: "" })).status, 403);
    assert.equal((await f.request("/api/analytics/events", "POST", valid, { "Content-Type": "text/plain" })).status, 415);
    for (const value of [
      { ...valid, email: "must-not-store" },
      { ...valid, events: [{ ...valid.events[0], name: "next_week_plan_created" }] },
      { ...valid, events: [{ ...valid.events[0], ip: "must-not-store" }] },
      { ...valid, events: [{ ...valid.events[0], week: "2026-10-20" }] },
      { ...valid, events: [{ ...valid.events[0], week: "2026-02-30" }] },
      { ...valid, events: [{ ...valid.events[0], occurredAt: new Date(now + 360_000).toISOString() }] },
      { ...valid, events: [{ ...valid.events[0], occurredAt: new Date(now - 91 * 86_400_000).toISOString() }] },
      { ...valid, events: Array.from({ length: 21 }, () => valid.events[0]) },
      { ...valid, pilotId: "not-a-uuid" },
    ]) assert.equal((await f.request("/api/analytics/events", "POST", value)).status, 400);
    assert.equal((await f.request("/api/analytics/events", "POST", { ...valid, text: "x".repeat(17_000) })).status, 413);
    for (const path of ["/api/analytics", "/api/analytics/events", "/api/analytics/summary"]) {
      assert.equal((await f.request(path, "GET")).status, 403);
    }
    const summary = await f.request("/api/analytics/summary", "GET", undefined, { Authorization: `Bearer ${operator}` });
    assert.equal(summary.status, 200);
    assert.equal(JSON.stringify(await summary.json()).includes(valid.pilotId), false);
    for (const [path, method] of [["/api/recipes", "POST"], ["/api/recipes/fixture", "PATCH"], ["/api/recipes/fixture", "DELETE"],
      ["/api/parse-recipe", "POST"], ["/api/transcribe-audio", "POST"], ["/api/analytics/other", "POST"]]) {
      assert.equal((await f.request(path, method, {})).status, 403);
    }
    assert.equal(f.mutations(), 0); assert.equal(f.aiCalls(), 0);
    assert.equal(calls, 1);
  } finally { await f.close(); }
  const disabled = await fixture(fake, false);
  try { assert.equal((await disabled.request("/api/analytics/events", "POST", valid)).status, 503); }
  finally { await disabled.close(); }
  const limited = await fixture(fake);
  try {
    for (let i = 0; i < 20; i++) assert.equal((await limited.request("/api/analytics/events", "POST", valid)).status, 204);
    const rejected = await limited.request("/api/analytics/events", "POST", valid);
    assert.equal(rejected.status, 429); assert.ok(Number(rejected.headers.get("Retry-After")) > 0);
  } finally { await limited.close(); }
  const failed = await fixture({ ...fake, record: async () => { throw new Error("PRIVATE_FAULT_NOT_LOGGED"); } });
  try {
    const res = await failed.request("/api/analytics/events", "POST", valid);
    assert.equal(res.status, 500);
    assert.equal((await res.text()).includes("PRIVATE_FAULT"), false);
    assert.equal((await failed.request("/api/analytics/summary", "GET")).status, 403);
  } finally { await failed.close(); }
  console.log("PASS fixture APIs: exact anonymous POST only; feature flag, same-origin, strict schema/time/body limits, rate limit, sanitized failure, protected aggregates and blocked mutations/paid AI.");
}
async function databaseTests() {
  const socket = testSocketArgument();
  if (!socket) { console.log("Real PostgreSQL checks skipped: no explicit test socket; no default database access."); return; }
  const pool = await openLocalTestDatabase(socket);
  const namespace = `phase5_test_${randomBytes(6).toString("hex")}`;
  let created = false;
  try {
    const before = await pool.query("SELECT md5(string_agg(row_to_json(r)::text, '' ORDER BY id)) AS hash FROM recipes r");
    await pool.query(`CREATE SCHEMA "${namespace}"`); created = true;
    const sql = (await readFile(new URL("../migrations/0001_pilot_analytics.sql", import.meta.url), "utf8"))
      .replaceAll('"public"."pilot_events"', `"${namespace}"."pilot_events"`);
    await pool.query(sql);
    const store = new PilotEventStore(async () => pool, namespace);
    const pilots = Array.from({ length: 4 }, randomUUID);
    const a = batch(pilots[0], [event("planner_opened"), event("meal_selected"), event("plan_completed", "2026-10-19", -5000), event("grocery_list_opened")]);
    await Promise.all([store.record(a), store.record(a), store.record(a)]);
    await store.record(batch(pilots[0], [event("plan_completed", "2026-10-19", -4000)]));
    assert.equal((await store.summary()).events.plan_completed.events, 1);
    assert.equal((await store.summary()).returningPilots, 0);
    await store.record(batch(pilots[0], [event("planner_opened", "2026-10-26")]));
    assert.equal((await store.summary()).returningPilots, 0);
    await store.record(batch(pilots[0], [event("plan_completed", "2026-10-26", -3000)]));
    await store.record(batch(pilots[0], [event("plan_completed", "2026-11-02", -2000)]));
    assert.equal((await store.summary()).events.next_week_plan_created.events, 2);
    assert.equal((await store.summary()).returningPilots, 1);
    await store.record(batch(pilots[1], [event("plan_completed", "2026-10-26", -5000), event("plan_completed", "2026-10-19", -4000)]));
    assert.equal((await store.summary()).returningPilots, 1); // Earlier calendar week is not conversion.
    await store.record(batch(pilots[2], [event("plan_completed", "2026-10-26", -3000)]));
    await store.record(batch(pilots[2], [event("plan_completed", "2026-10-19", -5000)])); // Out-of-order delivery.
    assert.equal((await store.summary()).returningPilots, 2);
    await store.record(batch(pilots[3], [event("plan_completed", "2026-10-19", -4000), event("plan_completed", "2026-10-26", -3000)]));
    assert.equal((await store.summary()).returningPilots, 3);
    await store.record(batch(pilots[3], [event("plan_completed", "2026-11-02", -5000)])); // Delayed actual first completion.
    const aggregate = await store.summary();
    assert.equal(aggregate.completedPilots, 4);
    assert.equal(aggregate.returningPilots, 2);
    assert.equal(aggregate.returnRate, 0.5);
    assert.ok(pilots.every(id => !JSON.stringify(aggregate).includes(id)));
    const realApi = await fixture(store);
    try {
      const payload = batch(randomUUID(), [event("planner_opened"), event("meal_selected"), event("plan_completed", "2026-10-19", -2000), event("grocery_list_opened"), event("plan_completed", "2026-10-26", -1000)]);
      assert.equal((await realApi.request("/api/analytics/events", "POST", payload)).status, 204);
      assert.equal((await realApi.request("/api/analytics/events", "POST", payload)).status, 204);
      const response = await realApi.request("/api/analytics/summary", "GET", undefined, { Authorization: `Bearer ${operator}` });
      const actual = await response.json();
      assert.equal(actual.completedPilots, 5); assert.equal(actual.returningPilots, 3);
      assert.equal(actual.returnRate, 0.6);
      assert.equal(actual.events.next_week_plan_created.events, 4);
      assert.ok(!JSON.stringify(actual).includes(payload.pilotId));
    } finally { await realApi.close(); }
    const after = await pool.query("SELECT md5(string_agg(row_to_json(r)::text, '' ORDER BY id)) AS hash FROM recipes r");
    assert.deepEqual(after.rows, before.rows);
    console.log("PASS real PostgreSQL/API: persisted events, concurrent/semantic dedupe, later-week conversion only, out-of-order correction, protected aggregate counts/rate, recipes unchanged.");
  } finally {
    if (created) await pool.query(`DROP SCHEMA "${namespace}" CASCADE`); // Only this freshly created test schema.
    await pool.end();
  }
}
async function main() { await testAnalyticsClient(); await apiTests(); await databaseTests(); }
main().catch(error => { console.error(error instanceof assert.AssertionError ? error : "Analytics verification failed; no default database fallback."); process.exitCode = 1; });
