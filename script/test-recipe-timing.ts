import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { DatabaseStorage, isMissingPreparationColumn } from "../server/storage";
import { registerRoutes } from "../server/routes";
import { recipeInput, recipePatch } from "../server/request-schemas";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

async function main() {
  for (const invalid of [-1, 1.5, 10081, "10"]) {
    assert.equal(recipePatch.safeParse({ prepTime: invalid }).success, false);
  }
  assert.equal(recipePatch.safeParse({ prepTime: 0 }).success, true);
  assert.equal(recipePatch.safeParse({ prepTime: null }).success, true);
  const input = { title: "Timing test", ingredients: ["1 test ingredient"], steps: ["Prepare.", "Cook."], cookTime: 50 };
  assert.equal(recipeInput.safeParse({ ...input, prepTime: 10 }).success, true);
  const pool = await openLocalTestDatabase(testSocketArgument());
  const client = await pool.connect();
  const namespace = `timing_test_${randomUUID().replaceAll("-", "")}`;
  const app = express();
  const server = createServer(app);
  let created = false;
  try {
    await client.query(`CREATE SCHEMA "${namespace}"`);
    created = true;
    await client.query(`SET search_path TO "${namespace}", public`);
    await client.query(`CREATE TABLE recipes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL, ingredients text[] NOT NULL, steps text[] NOT NULL,
      image text, source_url text, cook_time integer, servings text, tags text[],
      credit_kind text, credit_name varchar(120),
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
    await client.query("INSERT INTO recipes(id,title,ingredients,steps,cook_time) VALUES($1,$2,$3,$4,$5)",
      ["legacy", input.title, input.ingredients, input.steps, 50]);
    const storage = new DatabaseStorage(drizzle(client, { schema }));
    assert.equal((await storage.getAllRecipes())[0].prepTime, null);
    assert.equal((await storage.getRecipe("legacy"))?.cookTime, 50);
    const before = await storage.getRecipe("legacy");
    await assert.rejects(storage.updateRecipe("legacy", { prepTime: 10 }), isMissingPreparationColumn);
    assert.deepEqual(await storage.getRecipe("legacy"), before);
    console.log("PASS real PostgreSQL: old-schema recipe reads remain available; preparation writes fail without partial changes before migration.");

    const operator = randomBytes(32).toString("hex");
    await registerRoutes(server, app, {
      storage,
      config: { operatorToken: operator, publicCatalog: true, production: false, aiEnabled: false, analyticsEnabled: false },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const patch = (data: unknown, authorized = true) => fetch(`${base}/api/recipes/legacy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: `Bearer ${operator}` } : {}) },
      body: JSON.stringify(data),
    });
    assert.equal((await fetch(`${base}/api/recipes`)).status, 200);
    assert.equal((await patch({ prepTime: 10 }, false)).status, 403);
    assert.equal((await patch({ prepTime: 10 })).status, 503);
    const migration = (await readFile("migrations/0002_recipe_preparation_time.sql", "utf8"))
      .replace("public.recipes", `"${namespace}".recipes`);
    await client.query(migration);
    await client.query(migration);
    assert.equal((await storage.getRecipe("legacy"))?.title, input.title);
    const updated = await patch({ prepTime: 10, cookTime: 50 });
    assert.equal(updated.status, 200);
    const saved = await updated.json();
    assert.equal(saved.prepTime, 10);
    assert.equal(saved.cookTime, 50);
    const reread = await (await fetch(`${base}/api/recipes/legacy`)).json();
    assert.equal(reread.prepTime, 10);
    assert.equal(reread.cookTime, 50);
    for (const invalid of [-1, 1.5, 10081, "10"]) {
      assert.equal((await patch({ prepTime: invalid })).status, 400);
    }
    assert.equal((await storage.getRecipe("legacy"))?.prepTime, 10);
    assert.equal((await patch({ prepTime: 0 })).status, 200);
    assert.equal((await storage.getRecipe("legacy"))?.prepTime, 0);
    assert.equal((await patch({ prepTime: null })).status, 200);
    assert.equal((await storage.getRecipe("legacy"))?.prepTime, null);
    const create = await fetch(`${base}/api/recipes`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${operator}` },
      body: JSON.stringify({ ...input, prepTime: 10 }),
    });
    assert.equal(create.status, 201);
    assert.equal((await create.json()).prepTime, 10);
    console.log("PASS real PostgreSQL/API: additive migration is repeat-safe; protected create/edit/read persist independent 10/50 timings; invalid values rejected; zero and clearing are preserved.");
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await client.query("SET search_path TO public");
    if (created) await client.query(`DROP SCHEMA "${namespace}" CASCADE`);
    client.release();
    await pool.end();
  }
}
main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message : "Recipe timing verification failed.");
  process.exitCode = 1;
});
