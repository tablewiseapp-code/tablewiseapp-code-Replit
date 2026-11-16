// Groceries "+ Add item" store against a real, disposable PostgreSQL database.
// Usage: TABLEWISE_TEST_DATABASE_URL=postgresql://…/<name>_test npm run test:grocery-extras
// The database name must end in "_test"; it is reset by this script. DATABASE_URL is never used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { databaseGroceryExtraStore } from "../server/grocery-extras";

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database whose name ends in _test.");

const describe = async (pool: pg.Pool) => ({
  columns: (await pool.query(`SELECT column_name, data_type, is_nullable, column_default, character_maximum_length FROM information_schema.columns WHERE table_name = 'grocery_extras' ORDER BY 1`)).rows,
  constraints: (await pool.query(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'grocery_extras'::regclass ORDER BY 1`)).rows,
  indexes: (await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'grocery_extras' ORDER BY 1`)).rows,
});

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "push", "--force"], { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  // The hand-written migration must recreate exactly what the Drizzle schema declares.
  const pushed = await describe(pool);
  await pool.query("DROP TABLE grocery_extras");
  await pool.query(readFileSync("migrations/0007_grocery_extras.sql", "utf8"));
  assert.deepEqual(await describe(pool), pushed, "migration 0007 differs from shared/schema.ts");

  const store = databaseGroceryExtraStore(drizzle(pool, { schema }));
  const onion = await store.add("owner-a", "Onion");
  assert.equal(onion?.text, "Onion");
  assert.deepEqual(await store.add("owner-a", "onion"), onion, "the same product again is the same row");
  await store.add("owner-a", "Cleaning stuff");
  assert.deepEqual((await store.list("owner-a")).map(item => item.text), ["Onion", "Cleaning stuff"]);
  assert.deepEqual(await store.list("owner-b"), [], "another owner sees nothing");
  assert.notEqual((await store.add("owner-b", "onion"))?.id, onion!.id, "owners do not share rows");
  assert.equal(await store.remove("owner-b", onion!.id), false, "another owner cannot remove it");
  assert.equal(await store.remove("owner-a", onion!.id), true);
  assert.deepEqual((await store.list("owner-a")).map(item => item.text), ["Cleaning stuff"]);
  await assert.rejects(pool.query("INSERT INTO grocery_extras (owner_id, text) VALUES ('x', '')"), "empty text is rejected by the table");
  await pool.end();
  console.log("grocery extras: ok");
}
main().catch(error => { console.error(error); process.exit(1); });
