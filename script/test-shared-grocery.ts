// Grocery share links and item notes over HTTP against a real, disposable PostgreSQL database.
// Usage: TABLEWISE_TEST_DATABASE_URL=postgresql://…/<name>_test npm run test:shared-grocery
// The database name must end in "_test"; it is reset by this script. DATABASE_URL is never used.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { databaseGroceryStore } from "../server/shared-grocery";
import { registerRoutes } from "../server/routes";
import { apiErrorHandler } from "../server/security";

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database whose name ends in _test.");

const tables = "('shared_grocery_lists','shared_grocery_items','grocery_notes')";
const describe = async (pool: pg.Pool) => ({
  columns: (await pool.query(`SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns WHERE table_name IN ${tables} ORDER BY 1, 2`)).rows,
  constraints: (await pool.query(`SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid::regclass::text IN ${tables} ORDER BY 1, 2`)).rows,
  indexes: (await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ${tables} ORDER BY 1`)).rows,
});

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "push", "--force"], { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  // The hand-written migration must recreate exactly what the Drizzle schema declares.
  const pushed = await describe(pool);
  await pool.query("DROP TABLE shared_grocery_items, shared_grocery_lists, grocery_notes");
  await pool.query(readFileSync("migrations/0008_shared_grocery.sql", "utf8"));
  assert.deepEqual(await describe(pool), pushed, "migration 0008 differs from shared/schema.ts");

  const app = express(), server = createServer(app);
  await registerRoutes(server, app, { storage: {} as any, grocery: databaseGroceryStore(drizzle(pool, { schema })), nutrition: async r => r as any,
    config: { aiEnabled: false, production: false, publicCatalog: true } });
  app.use(apiErrorHandler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const request = async (method: string, path: string, { body, cookie, origin = true }: { body?: unknown; cookie?: string; origin?: boolean } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(body ? { "content-type": "application/json" } : {}), ...(origin ? { origin: base } : {}), ...(cookie ? { cookie } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    const data = (response.headers.get("content-type") ?? "").includes("json") ? await response.json() : undefined;
    return { status: response.status, data, owner: response.headers.get("set-cookie")?.match(/tablewise_owner=([a-f0-9]{64})/)?.[1] };
  };
  const items = [
    { category: "Produce", text: "2 carrots", recipes: "Soup", checked: false, note: "small ones" },
    { category: "Other", text: "1 tsp salt", recipes: "", checked: true, note: null },
  ];
  const share = async (role: string, cookie?: string) => request("POST", "/api/shared-lists", { body: { role, items }, cookie });

  try {
    // Creating a link saves a copy and gives the browser an owner cookie.
    assert.equal((await request("POST", "/api/shared-lists", { body: { role: "view", items }, origin: false })).status, 403, "cross-origin write refused");
    for (const bad of [{ role: "admin", items }, { role: "view", items: [] }, { role: "view" }, { role: "view", items: [{ text: "x" }] }]) {
      assert.equal((await request("POST", "/api/shared-lists", { body: bad })).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    const first = await share("view");
    assert.equal(first.status, 201);
    assert.match(first.data.token, /^[a-f0-9]{64}$/);
    const alice = `tablewise_owner=${first.owner}`;
    const view = `/api/shared-lists/${first.data.token}`;
    const add = `/api/shared-lists/${(await share("add", alice)).data.token}`;
    const edit = `/api/shared-lists/${(await share("edit", alice)).data.token}`;
    const guest = `tablewise_owner=${"b".repeat(64)}`;

    // Anyone with the link reads the copy; nobody learns who owns it.
    const seen = await request("GET", view, { cookie: guest });
    assert.deepEqual([seen.status, seen.data.access, seen.data.role, seen.data.items.length], [200, "view", "view", 2]);
    assert.equal(JSON.stringify(seen.data).includes("owner"), false, "owner identity never returned");
    assert.equal((await request("GET", view)).data.access, "view", "no cookie needed");
    assert.equal((await request("GET", view, { cookie: alice })).data.access, "owner");
    assert.equal((await request("GET", `/api/shared-lists/${"0".repeat(64)}`)).status, 404);
    assert.equal((await request("GET", "/api/shared-lists/nope")).status, 404);
    const item = (path: string, text: string) => request("GET", path).then(r => r.data.items.find((i: any) => i.text === text));

    // View: read only.
    const carrot = await item(view, "2 carrots");
    assert.deepEqual([carrot.note, carrot.recipes, carrot.checked], ["small ones", "Soup", false]);
    assert.equal((await request("PATCH", `${view}/items/${carrot.id}`, { body: { checked: true }, cookie: guest })).status, 403);
    assert.equal((await request("PATCH", `${view}/items/${carrot.id}`, { body: { note: "x" }, cookie: guest })).status, 403);
    assert.equal((await request("POST", `${view}/items`, { body: { text: "milk", category: "Other" }, cookie: guest })).status, 403);
    assert.equal((await request("DELETE", `${view}/items/${carrot.id}`, { cookie: guest })).status, 403);

    // Can add: tick, add items, write notes; not change text or delete.
    const addCarrot = await item(add, "2 carrots");
    assert.equal((await request("PATCH", `${add}/items/${addCarrot.id}`, { body: { checked: true }, cookie: guest })).data.checked, true);
    assert.equal((await request("PATCH", `${add}/items/${addCarrot.id}`, { body: { note: " organic " }, cookie: guest })).data.note, "organic");
    assert.equal((await request("PATCH", `${add}/items/${addCarrot.id}`, { body: { note: "  " }, cookie: guest })).data.note, null, "blank note clears");
    const milk = await request("POST", `${add}/items`, { body: { text: "milk", category: "Dairy & Eggs" }, cookie: guest });
    assert.deepEqual([milk.status, milk.data.text, milk.data.checked, milk.data.note], [201, "milk", false, null]);
    assert.equal((await request("PATCH", `${add}/items/${addCarrot.id}`, { body: { text: "9 carrots" }, cookie: guest })).status, 403);
    assert.equal((await request("PATCH", `${add}/items/${addCarrot.id}`, { body: { checked: false, text: "9 carrots" }, cookie: guest })).status, 403, "text cannot ride along with a tick");
    assert.equal((await request("DELETE", `${add}/items/${addCarrot.id}`, { cookie: guest })).status, 403);
    for (const bad of [{}, { checked: "yes" }, { note: "x".repeat(501) }, { category: "Other" }]) {
      assert.equal((await request("PATCH", `${add}/items/${addCarrot.id}`, { body: bad, cookie: guest })).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    assert.equal((await request("PATCH", `${add}/items/nope`, { body: { checked: true }, cookie: guest })).status, 400);
    // An item id from another list does not work through this link.
    assert.equal((await request("PATCH", `${add}/items/${carrot.id}`, { body: { checked: true }, cookie: guest })).status, 404);
    assert.equal((await item(view, "2 carrots")).checked, false, "each link is its own copy");

    // Can edit: also change and delete items.
    const editCarrot = await item(edit, "2 carrots");
    assert.equal((await request("PATCH", `${edit}/items/${editCarrot.id}`, { body: { text: "3 carrots" }, cookie: guest })).data.text, "3 carrots");
    assert.equal((await request("DELETE", `${edit}/items/${editCarrot.id}`, { cookie: guest })).status, 204);
    assert.equal((await request("GET", edit)).data.items.length, 1);

    // Only the owner changes the role or turns the link off, and only the owner sees their links.
    assert.equal((await request("PATCH", edit, { body: { role: "view" }, cookie: guest })).status, 403);
    assert.equal((await request("DELETE", edit, { cookie: guest })).status, 403);
    assert.deepEqual((await request("GET", "/api/shared-lists", { cookie: guest })).data, []);
    assert.deepEqual((await request("GET", "/api/shared-lists", { cookie: alice })).data.map((l: any) => l.role).sort(), ["add", "edit", "view"]);
    assert.equal((await request("PATCH", view, { body: { role: "add" }, cookie: alice })).status, 204);
    assert.equal((await request("PATCH", `${view}/items/${carrot.id}`, { body: { checked: true }, cookie: guest })).status, 200, "the new role applies at once");
    assert.equal((await request("PATCH", `${view}/items/${carrot.id}`, { body: { text: "owner edit" }, cookie: alice })).status, 200, "the owner can do everything");
    assert.equal((await request("DELETE", view, { cookie: alice })).status, 204);
    assert.equal((await request("GET", view, { cookie: guest })).status, 404, "a turned-off link is gone");
    assert.equal(Number((await pool.query("SELECT count(*) FROM shared_grocery_items")).rows[0].count), 4, "its items go with it");

    // Notes on the owner's own list are private to that owner.
    assert.equal((await request("PUT", "/api/grocery-notes", { body: { key: "2 carrots", note: "ripe" }, cookie: alice })).status, 204);
    assert.equal((await request("PUT", "/api/grocery-notes", { body: { key: "2 carrots", note: "very ripe" }, cookie: alice })).status, 204);
    assert.equal((await request("PUT", "/api/grocery-notes", { body: { key: "salt", note: "x" }, cookie: alice, origin: false })).status, 403);
    assert.deepEqual((await request("GET", "/api/grocery-notes", { cookie: alice })).data, { "2 carrots": "very ripe" });
    assert.deepEqual((await request("GET", "/api/grocery-notes", { cookie: guest })).data, {});
    assert.equal((await request("PUT", "/api/grocery-notes", { body: { key: "2 carrots", note: "" }, cookie: alice })).status, 204);
    assert.deepEqual((await request("GET", "/api/grocery-notes", { cookie: alice })).data, {}, "an empty note removes it");
    assert.equal((await request("PUT", "/api/grocery-notes", { body: { key: "x", note: "y".repeat(501) }, cookie: alice })).status, 400);
    console.log("shared grocery: all checks passed");
  } finally {
    server.close(); await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
