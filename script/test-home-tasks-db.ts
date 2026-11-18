// Real PostgreSQL + HTTP checks for Home Tasks. Only a disposable *_test database is accepted.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { databaseHomeTaskStore } from "../server/home-tasks";
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
    const describe = async (table: string) => ({
      columns: (await pool.query("SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name=$1 ORDER BY 1", [table])).rows,
      constraints: (await pool.query("SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY 1", [table])).rows,
      indexes: (await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename=$1 ORDER BY 1", [table])).rows,
    });
    const pushed = [await describe("home_tasks"), await describe("household_tasks")];
    await pool.query("DROP TABLE home_tasks, household_tasks");
    await pool.query(readFileSync("migrations/0012_home_tasks.sql", "utf8"));
    assert.deepEqual([await describe("home_tasks"), await describe("household_tasks")], pushed, "migration matches Drizzle schema");
    assert.ok((await pool.query("SELECT count(*)::int n FROM household_tasks")).rows[0].n >= 30, "catalog seeded");

    await registerRoutes(server, app, { storage: {} as any, homeTasks: databaseHomeTaskStore(drizzle(pool, { schema })),
      nutrition: async r => r as any, config: { aiEnabled: false, production: false, publicCatalog: true } });
    app.use(apiErrorHandler);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const request = async (method: string, path: string, body?: unknown, cookie?: string, origin = true) => {
      const response = await fetch(base + path, { method, headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}), ...(origin ? { origin: base } : {}),
      }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = response.headers.get("content-type")?.includes("json") ? await response.json() : undefined;
      return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
    };
    const catalog = await request("GET", "/api/household-tasks");
    assert.ok(catalog.data.some((t: any) => t.names.en === "Fold laundry" && t.names.he && t.names.ru));

    const id = "6b0f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
    const bytes = Buffer.alloc(100_000); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
    const image = `data:image/jpeg;base64,${bytes.toString("base64")}`; // larger than the normal 64 KB JSON limit
    const body = { name: "Pay electricity bill", dueDate: "2026-11-17", priority: "high", image, completedAt: null };
    assert.equal((await request("PUT", `/api/home-tasks/${id}`, body, undefined, false)).status, 403, "same-origin only");
    assert.equal((await request("PUT", `/api/home-tasks/not-a-uuid`, body)).status, 400);
    assert.equal((await request("PUT", `/api/home-tasks/${id}`, { ...body, name: "  " })).status, 400);
    const created = await request("PUT", `/api/home-tasks/${id}`, body);
    assert.equal(created.status, 200);
    const cookie = created.cookie!;
    const task = created.data;
    assert.equal(task.image, image);
    assert.ok(Math.abs(Date.parse(task.createdAt) - Date.now()) < 60_000, "creation time set by the server");

    // Another visitor sees nothing and cannot overwrite or delete the task.
    assert.deepEqual((await request("GET", "/api/home-tasks")).data, []);
    const stranger = await request("PUT", `/api/home-tasks/${id}`, { ...body, name: "Mine now" });
    assert.equal(stranger.status, 409);
    assert.equal((await request("DELETE", `/api/home-tasks/${id}`, undefined, stranger.cookie)).status, 204);
    assert.equal((await request("GET", "/api/home-tasks", undefined, cookie)).data[0].name, "Pay electricity bill");

    // Complete keeps the photo; editing never changes the creation time.
    const done = await request("PUT", `/api/home-tasks/${id}`, { ...body, completedAt: "2026-11-17T10:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z" }, cookie);
    assert.equal(done.data.image, image);
    assert.equal(done.data.completedAt, "2026-11-17T10:00:00.000Z");
    assert.equal(done.data.createdAt, task.createdAt);

    // Delete, then Undo writes the original back with its creation time, due date, priority and photo.
    assert.equal((await request("DELETE", `/api/home-tasks/${id}`, undefined, cookie)).status, 204);
    assert.deepEqual((await request("GET", "/api/home-tasks", undefined, cookie)).data, []);
    const { id: _id, ...original } = task;
    assert.equal((await request("PUT", `/api/home-tasks/${id}`, original, cookie)).status, 200);
    assert.deepEqual((await request("GET", "/api/home-tasks", undefined, cookie)).data, [task]);
    console.log("home tasks db: ok");
  } finally {
    server.close();
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
