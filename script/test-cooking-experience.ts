// My Cooking Experience over HTTP against a real, disposable PostgreSQL database.
// Usage: TABLEWISE_TEST_DATABASE_URL=postgresql://…/<name>_test npm run test:cooking-experience
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
import { DatabaseStorage } from "../server/storage";
import { databaseCookingStore, MAX_PHOTOS_PER_SESSION } from "../server/cooking-history";
import { registerRoutes } from "../server/routes";
import { apiErrorHandler } from "../server/security";

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database whose name ends in _test.");

const describe = (pool: pg.Pool) => pool.query(`
  SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
  WHERE table_name IN ('cooking_sessions','cooking_photos') ORDER BY 1, 2`).then(r => r.rows).then(async columns => ({
  columns,
  constraints: (await pool.query(`SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid::regclass::text IN ('cooking_sessions','cooking_photos') ORDER BY 1, 2`)).rows,
  indexes: (await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('cooking_sessions','cooking_photos') ORDER BY 1`)).rows,
}));

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "push", "--force"], { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  // The hand-written migration must recreate exactly what the Drizzle schema declares.
  const pushed = await describe(pool);
  await pool.query("DROP TABLE cooking_photos, cooking_sessions");
  await pool.query(readFileSync("migrations/0006_cooking_sessions.sql", "utf8"));
  assert.deepEqual(await describe(pool), pushed, "migration 0006 differs from shared/schema.ts");

  const db = drizzle(pool, { schema });
  const storage = new DatabaseStorage(db);
  const recipe = await storage.createRecipe({ title: "Banana bread", ingredients: ["3 bananas"], steps: ["Bake."], tags: [] });
  const recipeBefore = await storage.getRecipe(recipe.id);

  const app = express(), server = createServer(app);
  await registerRoutes(server, app, { storage, cooking: databaseCookingStore(db), nutrition: async r => r as any,
    config: { aiEnabled: false, production: false, publicCatalog: true } });
  app.use(apiErrorHandler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const request = async (method: string, path: string, { body, cookie, origin = true }: { body?: unknown; cookie?: string; origin?: boolean } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(body ? { "content-type": "application/json" } : {}), ...(origin ? { origin: base } : {}), ...(cookie ? { cookie } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer());
    const owner = response.headers.get("set-cookie")?.match(/tablewise_owner=([a-f0-9]{64})/)?.[1];
    return { status: response.status, data, type, owner };
  };
  const id = () => crypto.randomUUID();
  const jpeg = (size: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, 7)]).toString("base64");

  try {
    // One click records it; the browser receives a private owner cookie.
    const first = id();
    assert.equal((await request("POST", "/api/cooking-sessions", { body: { id: first, recipeId: recipe.id }, origin: false })).status, 403, "cross-origin write refused");
    const created = await request("POST", "/api/cooking-sessions", { body: { id: first, recipeId: recipe.id } });
    assert.equal(created.status, 201);
    assert.ok(created.owner, "owner cookie minted");
    assert.equal(created.data.ownerId, undefined, "owner identity never returned");
    assert.deepEqual([created.data.rating, created.data.notes, created.data.photoIds], [null, null, []]);
    const alice = `tablewise_owner=${created.owner}`;
    const bob = `tablewise_owner=${"b".repeat(64)}`;

    // A retried request with the same id is the same session, not a duplicate.
    assert.equal((await request("POST", "/api/cooking-sessions", { body: { id: first, recipeId: recipe.id }, cookie: alice })).status, 201);
    assert.equal((await request("GET", `/api/cooking-sessions?recipeId=${recipe.id}`, { cookie: alice })).data.length, 1);
    assert.equal((await request("POST", "/api/cooking-sessions", { body: { id: id(), recipeId: "missing" }, cookie: alice })).status, 404);
    assert.equal((await request("POST", "/api/cooking-sessions", { body: { id: "nope", recipeId: recipe.id }, cookie: alice })).status, 400);

    // Rating and notes save and change independently; invalid values are refused.
    assert.equal((await request("PATCH", `/api/cooking-sessions/${first}`, { body: { rating: 4 }, cookie: alice })).data.rating, 4);
    assert.equal((await request("PATCH", `/api/cooking-sessions/${first}`, { body: { rating: 5 }, cookie: alice })).data.rating, 5);
    for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { notes: "x".repeat(4001) }, {}, { recipeId: "x" }]) {
      assert.equal((await request("PATCH", `/api/cooking-sessions/${first}`, { body: bad, cookie: alice })).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    const noted = await request("PATCH", `/api/cooking-sessions/${first}`, { body: { notes: "Less salt.\nMore garlic." }, cookie: alice });
    assert.deepEqual([noted.data.notes, noted.data.rating], ["Less salt.\nMore garlic.", 5]);
    assert.equal((await request("PATCH", `/api/cooking-sessions/${first}`, { body: { notes: "   " }, cookie: alice })).data.notes, null, "blank notes clear");
    await request("PATCH", `/api/cooking-sessions/${first}`, { body: { notes: "Less salt." }, cookie: alice });

    // Photos: JPEG only, owner-only reads, bounded per session.
    const photo = await request("POST", `/api/cooking-sessions/${first}/photos`, { body: { image: jpeg(300_000), thumbnail: jpeg(1000) }, cookie: alice });
    assert.equal(photo.status, 201, "a ~400 KB base64 photo passes the larger photo body limit");
    assert.equal((await request("POST", `/api/cooking-sessions/${first}/photos`, { body: { image: Buffer.from("GIF89a....").toString("base64"), thumbnail: jpeg(10) }, cookie: alice })).status, 400);
    assert.equal((await request("POST", `/api/cooking-sessions/${first}/photos`, { body: { image: jpeg(1_600_000), thumbnail: jpeg(10) }, cookie: alice })).status, 400, "over the stored-photo size cap");
    const full = await request("GET", `/api/cooking-photos/${photo.data.id}`, { cookie: alice });
    assert.equal(full.status, 200); assert.equal(full.type, "image/jpeg");
    assert.equal(full.data.toString("base64"), jpeg(300_000));
    assert.equal((await request("GET", `/api/cooking-photos/${photo.data.id}?size=thumb`, { cookie: alice })).data.toString("base64"), jpeg(1000));
    for (let i = 1; i < MAX_PHOTOS_PER_SESSION; i++) {
      assert.equal((await request("POST", `/api/cooking-sessions/${first}/photos`, { body: { image: jpeg(10), thumbnail: jpeg(10) }, cookie: alice })).status, 201);
    }
    assert.equal((await request("POST", `/api/cooking-sessions/${first}/photos`, { body: { image: jpeg(10), thumbnail: jpeg(10) }, cookie: alice })).status, 409, "per-session photo limit");

    // Another owner sees and changes nothing of Alice's.
    assert.deepEqual((await request("GET", `/api/cooking-sessions?recipeId=${recipe.id}`, { cookie: bob })).data, []);
    assert.deepEqual((await request("GET", `/api/cooking-sessions?recipeId=${recipe.id}`, { origin: false })).data, [], "no cookie, no history");
    assert.equal((await request("PATCH", `/api/cooking-sessions/${first}`, { body: { rating: 1 }, cookie: bob })).status, 404);
    assert.equal((await request("DELETE", `/api/cooking-sessions/${first}`, { cookie: bob })).status, 404);
    assert.equal((await request("POST", "/api/cooking-sessions", { body: { id: first, recipeId: recipe.id }, cookie: bob })).status, 409);
    assert.equal((await request("POST", `/api/cooking-sessions/${first}/photos`, { body: { image: jpeg(10), thumbnail: jpeg(10) }, cookie: bob })).status, 404);
    assert.equal((await request("GET", `/api/cooking-photos/${photo.data.id}`, { cookie: bob })).status, 404);
    assert.equal((await request("DELETE", `/api/cooking-photos/${photo.data.id}`, { cookie: bob })).status, 404);

    // Cooking again adds an independent session; history is newest first with an accurate count.
    const second = id();
    assert.equal((await request("POST", "/api/cooking-sessions", { body: { id: second, recipeId: recipe.id }, cookie: alice })).status, 201);
    await request("PATCH", `/api/cooking-sessions/${second}`, { body: { rating: 3 }, cookie: alice });
    const history = (await request("GET", `/api/cooking-sessions?recipeId=${recipe.id}`, { cookie: alice })).data;
    assert.deepEqual(history.map((s: any) => [s.id, s.rating, s.notes, s.photoIds.length]),
      [[second, 3, null, 0], [first, 5, "Less salt.", MAX_PHOTOS_PER_SESSION]]);

    // Deleting a photo and undoing a session (photos cascade).
    assert.equal((await request("DELETE", `/api/cooking-photos/${photo.data.id}`, { cookie: alice })).status, 204);
    assert.equal((await request("GET", `/api/cooking-photos/${photo.data.id}`, { cookie: alice })).status, 404);
    assert.equal((await request("DELETE", `/api/cooking-sessions/${first}`, { cookie: alice })).status, 204);
    assert.equal(Number((await pool.query("SELECT count(*) FROM cooking_photos")).rows[0].count), 0);

    // The recipe itself is never modified; deleting the recipe removes its private history.
    assert.deepEqual(await storage.getRecipe(recipe.id), recipeBefore);
    await storage.deleteRecipe(recipe.id);
    assert.equal(Number((await pool.query("SELECT count(*) FROM cooking_sessions")).rows[0].count), 0);
    console.log("cooking experience: all checks passed");
  } finally {
    server.close(); await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
