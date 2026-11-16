// Real PostgreSQL + HTTP regression checks. Only a disposable *_test database is accepted.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { databaseGroceryItemPhotoStore, MAX_GROCERY_ITEM_PHOTOS } from "../server/grocery-item-photos/store";
import { databaseGroceryExtraStore } from "../server/grocery-extras";
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
      columns: (await pool.query("SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name='grocery_item_photos' ORDER BY 1")).rows,
      constraints: (await pool.query("SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='grocery_item_photos'::regclass ORDER BY 1")).rows,
    });
    const pushed = await describe();
    await pool.query("DROP TABLE grocery_item_photos");
    await pool.query(readFileSync("migrations/0010_grocery_item_photos.sql", "utf8"));
    assert.deepEqual(await describe(), pushed, "migration matches Drizzle schema");
    const db = drizzle(pool, { schema });
    const photos = databaseGroceryItemPhotoStore(db);
    const extras = databaseGroceryExtraStore(db);
    const image = "data:image/jpeg;base64,/9j/2Q==";
    await photos.save("alice", "2 onions", image);
    assert.equal((await photos.list("alice"))["2 onions"], image);
    assert.deepEqual(await photos.list("bob"), {});
    await photos.save("alice", "2 onions", null);
    assert.deepEqual(await photos.list("alice"), { "2 onions": null }, "removal hides legacy photos without deleting the item");
    // Even a full owner can replace/remove an existing photo. Concurrent new writes respect the cap.
    await pool.query("INSERT INTO grocery_item_photos(owner_id,item_key,image) SELECT 'full', 'item-' || i, NULL FROM generate_series(1,$1) i", [MAX_GROCERY_ITEM_PHOTOS - 1]);
    const writes = await Promise.all([photos.save("full", "last-a", image), photos.save("full", "last-b", image)]);
    assert.equal(writes.filter(Boolean).length, 1);
    assert.equal(await photos.save("full", "item-1", image), true);
    assert.equal(await photos.save("full", "item-1", null), true);

    await registerRoutes(server, app, { storage: {} as any, groceryItemPhotos: photos, groceryExtras: extras,
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
    const path = "/api/grocery-item-photos";
    assert.deepEqual((await request("GET", path)).data, {});
    assert.equal((await request("PUT", path, { key: "milk", image }, undefined, false)).status, 403);
    for (const body of [{ key: "milk" }, { key: "", image }, { key: "Milk", image }, { key: "milk", image: "https://example.com/x.png" }, { key: "milk", image: "data:image/svg+xml;base64,PHN2Zz4=" }, { key: "milk", image: image + "x" }, { key: "milk", image, ownerId: "alice" }]) {
      assert.equal((await request("PUT", path, body)).status, 400);
    }
    const added = await request("POST", "/api/grocery-extras", { text: "Milk", image });
    const cookie = added.cookie!;
    assert.equal(added.status, 201);
    // A valid resized payload larger than the normal 64 KB JSON limit must pass.
    const bytes = Buffer.alloc(100_000); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
    const larger = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    assert.equal((await request("PUT", path, { key: "milk", image: larger }, cookie)).status, 204);
    assert.equal((await request("GET", path, undefined, cookie)).data.milk, larger);
    assert.deepEqual((await request("GET", path)).data, {}, "other visitors cannot see pictures");
    assert.equal((await request("PUT", path, { key: "milk", image: null }, cookie)).status, 204);
    assert.equal((await request("GET", path, undefined, cookie)).data.milk, null);
    assert.equal((await request("GET", "/api/grocery-extras", undefined, cookie)).data.length, 1, "removing a photo keeps the item");
    // Re-adding with a new photo clears the legacy-image override.
    assert.equal((await request("POST", "/api/grocery-extras", { text: "milk", image }, cookie)).status, 201);
    assert.deepEqual((await request("GET", path, undefined, cookie)).data, {});
    const recipeKey = "1 cup " + "chopped onions ".repeat(10);
    assert.equal((await request("PUT", path, { key: recipeKey, image }, cookie)).status, 204);
    assert.equal((await request("GET", "/api/grocery-extras", undefined, cookie)).data.length, 1, "recipe pictures do not add household products");
    console.log("grocery item photos: migration, owner privacy, limits/concurrency, validation, large uploads, replace/remove, re-add and recipe ingredients passed");
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
