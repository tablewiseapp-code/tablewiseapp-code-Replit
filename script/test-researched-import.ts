import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { researchedDinners, researchedImportSQL } from "../server/seeds/researched-import";

async function main() {
  const pool = await openLocalTestDatabase(testSocketArgument());
  const client = await pool.connect();
  const name = `researched_import_${randomBytes(8).toString("hex")}`;
  const sql = researchedImportSQL();
  try {
    await client.query(`CREATE SCHEMA "${name}"`);
    await client.query(`SET search_path TO "${name}"`);
    await client.query(`CREATE TABLE recipes (
      id varchar PRIMARY KEY, title text NOT NULL, ingredients text[] NOT NULL,
      steps text[] NOT NULL, image text, source_url text, cook_time integer,
      credit_kind text, credit_name varchar(120),
      servings text, tags text[], created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now())`);
    for (let i = 1; i <= 3; i++) {
      await client.query("INSERT INTO recipes (id,title,ingredients,steps) VALUES ($1,$2,$3,$4)",
        [`existing-${i}`, `Preserved recipe ${i}`, ["1 original ingredient"], ["Original instructions."]]);
    }
    const snapshot = async () => (await client.query("SELECT to_jsonb(r) AS data FROM recipes r ORDER BY id")).rows.map(r => r.data);
    const baseline = await snapshot();
    await assert.rejects(client.query(sql), /Preparation-time storage is missing/);
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), baseline);
    await client.query("ALTER TABLE recipes ADD COLUMN prep_time integer CHECK (prep_time BETWEEN 0 AND 10080)");
    const originalWithColumn = await snapshot();
    await client.query(sql);
    const all = await snapshot();
    assert.equal(all.length, 15);
    assert.deepEqual(all.filter(r => r.id.startsWith("existing-")), originalWithColumn);
    for (const expected of researchedDinners) {
      const row = all.find(r => r.id === expected.id);
      assert.ok(row);
      assert.equal(row.prep_time, expected.prepTime);
      assert.equal(row.cook_time, expected.cookTime);
      assert.equal(row.source_url, expected.sourceUrl);
      assert.deepEqual(row.ingredients, expected.ingredients);
      assert.deepEqual(row.steps, expected.steps);
      assert.equal(row.servings, expected.servings);
    }
    await client.query(sql);
    assert.deepEqual(await snapshot(), all, "Repeat import must change no records or timestamps.");
    await client.query("UPDATE recipes SET title='Owner edited this recipe' WHERE id=$1", [researchedDinners[0].id]);
    await client.query("DELETE FROM recipes WHERE id=$1", [researchedDinners[1].id]);
    const edited = await snapshot();
    await assert.rejects(client.query(sql), /different existing content/);
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), edited, "A conflict must roll back every insert, not repair owner edits.");
    assert.equal(researchedDinners.every(r => r.prepTime! > 0 && r.cookTime! > 0), true);
    console.log("PASS real isolated database: missing-field rejection without writes, 12 complete sourced records, original 3 preserved, 15 total, exact quantities/steps/times, idempotence and all-or-nothing conflict rollback.");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
