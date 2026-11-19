// Real PostgreSQL + HTTP checks for the Week plan. Only a disposable *_test database is accepted.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { databaseWeekPlanStore } from "../server/week-plans";
import { registerRoutes } from "../server/routes";
import { apiErrorHandler } from "../server/security";

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database ending in _test.");

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  const app = express(), server = createServer(app);
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    const describe = async () => ({
      columns: (await pool.query("SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name='week_plans' ORDER BY 1")).rows,
      constraints: (await pool.query("SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='week_plans'::regclass ORDER BY 1")).rows,
    });
    const pushed = await describe();
    await pool.query("DROP TABLE week_plans");
    await pool.query(readFileSync("migrations/0013_week_plans.sql", "utf8"));
    await pool.query(`INSERT INTO week_plans (owner_id, selected_ids, plan_assignments) VALUES ('old', '[]', '[]')`);
    await pool.query(readFileSync("migrations/0020_week_plans_by_week.sql", "utf8"));
    assert.equal((await pool.query("SELECT week_start = date_trunc('week', now())::date AS ok FROM week_plans")).rows[0].ok, true, "an existing plan becomes this week");
    await pool.query("DELETE FROM week_plans");
    assert.deepEqual(await describe(), pushed, "migrations match Drizzle schema");

    await registerRoutes(server, app, { storage: {} as any, weekPlans: databaseWeekPlanStore(drizzle(pool, { schema })),
      nutrition: async r => r as any, config: { aiEnabled: false, production: false, publicCatalog: true } });
    app.use(apiErrorHandler);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const request = async (method: string, body?: unknown, cookie?: string, origin = true, week = "2026-11-16") => {
      const response = await fetch(base + "/api/week-plan" + (method === "GET" ? `?week=${week}` : ""), { method, headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}), ...(origin ? { origin: base } : {}),
      }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = response.headers.get("content-type")?.includes("json") ? await response.json() : undefined;
      return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
    };
    const plan = { weekStart: "2026-11-16", proposed: true, selectedIds: ["r1"], planAssignments: [{ recipeId: "r1", mealType: "Dinner", startDay: 2, spanDays: 2, servings: 4 }], locked: false };

    assert.equal((await request("GET")).data, null, "no owner: no plan");
    assert.equal((await request("PUT", plan, undefined, false)).status, 403, "same-origin only");
    for (const bad of [{ ...plan, extra: 1 }, { ...plan, planAssignments: [{ ...plan.planAssignments[0], startDay: 6 }] },
      { ...plan, weekStart: "2026-11-17" }, { ...plan, weekStart: "2026-02-30" }, { ...plan, proposed: undefined },
      { ...plan, selectedIds: Array.from({ length: 13 }, (_, i) => `r${i}`) }, { ...plan, planAssignments: [{ ...plan.planAssignments[0], mealType: "Snack" }] }])
      assert.equal((await request("PUT", bad)).status, 400, JSON.stringify(bad));

    const saved = await request("PUT", plan);
    assert.equal(saved.status, 204);
    const cookie = saved.cookie!;
    assert.deepEqual((await request("GET", undefined, cookie)).data, plan);
    const locked = { ...plan, locked: true };
    assert.equal((await request("PUT", locked, cookie)).status, 204, "replace whole plan");
    assert.deepEqual((await request("GET", undefined, cookie)).data, locked);

    assert.equal((await request("GET", undefined, cookie, true, "2026-11-23")).data, null, "each week is its own plan");
    const next = { ...plan, weekStart: "2026-11-23", locked: false, planAssignments: [] };
    assert.equal((await request("PUT", next, cookie)).status, 204);
    assert.deepEqual((await request("GET", undefined, cookie, true, "2026-11-23")).data, next);
    assert.deepEqual((await request("GET", undefined, cookie)).data, locked, "saving next week leaves this week alone");
    assert.equal((await request("GET", undefined, cookie, true, "2026-11-17")).status, 400, "a week starts on Monday");
    const stranger = await request("PUT", { weekStart: "2026-11-16", proposed: false, selectedIds: [], planAssignments: [], locked: false });
    assert.notEqual(stranger.cookie, cookie);
    assert.deepEqual((await request("GET", undefined, cookie)).data, locked, "another owner's save does not touch mine");
    console.log("week plan db: ok");
  } finally {
    server.close();
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
