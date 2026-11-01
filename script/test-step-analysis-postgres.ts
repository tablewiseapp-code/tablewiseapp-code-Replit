import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { DatabaseStorage } from "../server/storage";
import * as schema from "../shared/schema";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { example, fixture } from "./test-step-analysis";

async function main() {
  // No DATABASE_URL fallback. The helper proves private socket/data location and
  // TCP-disabled server settings before the first CREATE/INSERT.
  const pool = await openLocalTestDatabase(testSocketArgument());
  const client = await pool.connect();
  const namespace = `step_analysis_${randomUUID().replaceAll("-", "")}`;
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    await client.query(`CREATE SCHEMA "${namespace}"`);
    await client.query(`SET search_path TO "${namespace}", public`);
    await client.query(`CREATE TABLE recipes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL, ingredients text[] NOT NULL, steps text[] NOT NULL,
      image text, source_url text, cook_time integer, servings text, tags text[],
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
    const storage = new DatabaseStorage(drizzle(client, { schema }));
    f = await fixture(true, storage);
    const legacy = { title: "Legacy create", ingredients: ["1 test ingredient"], steps: ["Prepare."] };
    const ordinary = await f.request("/api/recipes", legacy);
    assert.equal(ordinary.status, 201, await ordinary.clone().text());
    const first = await ordinary.json();
    assert.deepEqual(first.ingredients, legacy.ingredients);
    assert.deepEqual(first.steps, legacy.steps);
    assert.equal(first.stepAnalysis, null);
    assert.equal(first.prepTime, null);
    assert.equal(first.creditKind, null);
    assert.ok(first.createdAt && first.updatedAt);
    assert.equal((await storage.getAllRecipes()).length, 1);
    assert.deepEqual(await storage.getRecipe(first.id), {
      ...first, createdAt: new Date(first.createdAt), updatedAt: new Date(first.updatedAt),
    });
    for (const name of ["0002_recipe_preparation_time.sql", "0003_recipe_credit.sql"]) {
      const migration = (await readFile(`migrations/${name}`, "utf8")).replaceAll("public.recipes", `"${namespace}".recipes`);
      await client.query(migration);
    }
    // This is the actual pre-0004 schema, including existing prep/credit columns.
    const currentLegacy = await f.request("/api/recipes", { ...example, creditKind: "mine", creditName: null });
    assert.equal(currentLegacy.status, 201, await currentLegacy.clone().text());
    assert.equal((await currentLegacy.json()).stepAnalysis, null);
    const response = await f.request("/api/analyze-recipe", example);
    assert.equal(response.status, 200);
    const analysis = await response.json();
    const timed = { ...example, stepAnalysis: analysis, tags: ["seafood"] };
    const failedImport = await f.request("/api/import-recipe", timed);
    assert.equal(failedImport.status, 503);
    assert.match((await failedImport.json()).error, /timing storage needs setup/);
    assert.equal((await storage.getAllRecipes()).length, 2, "No partial insert on absent timing column");
    assert.deepEqual((await storage.getRecipe(first.id))?.steps, legacy.steps);
    const migration = (await readFile("migrations/0004_recipe_step_analysis.sql", "utf8"))
      .replaceAll("public.recipes", `"${namespace}".recipes`);
    await client.query(migration);
    await client.query(migration);
    const imported = await f.request("/api/import-recipe", timed);
    assert.equal(imported.status, 201, await imported.clone().text());
    const saved = await imported.json();
    const loaded = await (await fetch(`${f.base}/api/recipes/${saved.id}`)).json();
    assert.deepEqual(loaded, saved);
    assert.deepEqual(loaded.stepAnalysis, analysis);
    assert.deepEqual(loaded.steps, example.steps);
    assert.deepEqual(loaded.ingredients, example.ingredients);
    assert.deepEqual(loaded.tags, ["seafood"]);
    assert.equal(loaded.prepTime, 10); assert.equal(loaded.cookTime, 15);
    await storage.updateRecipe(saved.id, { title: "Edited context" });
    assert.equal((await storage.getRecipe(saved.id))?.stepAnalysis, null);
    assert.deepEqual((await storage.getRecipe(saved.id))?.steps, example.steps);
    assert.equal((await storage.getRecipe(first.id))?.stepAnalysis, null);
    console.log("PASS isolated PostgreSQL/API: ordinary creates on oldest/pre-0004 schemas, safe pre-migration timed-import failure without partial insert, repeat-safe additive migration, timed save/read round trip, context-edit invalidation, unchanged legacy reads. Fake provider only.");
  } finally {
    await f?.close();
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    client.release(); await pool.end();
  }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : error); process.exitCode = 1; });
