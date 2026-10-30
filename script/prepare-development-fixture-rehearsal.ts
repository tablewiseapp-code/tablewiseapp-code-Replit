import assert from "node:assert/strict";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { researchedImportSQL } from "../server/seeds/researched-import";
import { importDevelopmentFixtures } from "./development-fixture-import";

// Explicit test preparation only. Not an app startup, hook, migration or
// application-database command. Refuses an existing catalog rather than reset it.
async function main() {
  const pool = await openLocalTestDatabase(testSocketArgument());
  try {
    const { rows: [row] } = await pool.query("SELECT to_regclass('public.recipes') AS existing");
    assert.equal(row.existing, null, "Rehearsal requires a fresh disposable catalog; never reset an existing one.");
    await pool.query(`CREATE TABLE public.recipes (
      id varchar PRIMARY KEY, title text NOT NULL, ingredients text[] NOT NULL,
      steps text[] NOT NULL, image text, source_url text, cook_time integer,
      prep_time integer, servings text, tags text[],
      credit_kind text, credit_name varchar(120),
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await pool.query(researchedImportSQL());
    const dry = await importDevelopmentFixtures(pool, { apply: false });
    const apply = await importDevelopmentFixtures(pool, {
      apply: true, verifiedDevelopmentTarget: dry.identity, reviewedSnapshot: dry.snapshot,
    });
    assert.equal(apply.before, 12); assert.equal(apply.after, 112);
    console.log("DISPOSABLE REHEARSAL ONLY; not the main import:", JSON.stringify({
      before: apply.before, after: apply.after, inserted: apply.inserted, preserved: apply.preserved,
    }));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
