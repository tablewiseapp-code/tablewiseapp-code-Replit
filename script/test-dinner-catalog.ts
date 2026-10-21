import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../shared/schema";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";
import { seedDinners } from "../server/seeds/seed-dinners";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

const exec = promisify(execFile);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  const socket = testSocketArgument();
  const pool = await openLocalTestDatabase(socket);
  const db = drizzle(pool, { schema });
  const seedIds = dinnerCatalog.map((r) => r.id);
  const fixtures = dinnerCatalog.map((r) => ({
    id: `phase2-test:${randomUUID()}`, title: r.title,
    ingredients: ["1 customer ingredient"], steps: ["Keep this customer recipe unchanged."],
    cookTime: 17, servings: "2", tags: ["Personal"],
  }));
  try {
    // Additive setup only, and only after the socket/server isolation check.
    await pool.query(`CREATE TABLE IF NOT EXISTS recipes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL, ingredients text[] NOT NULL, steps text[] NOT NULL,
      image text, source_url text, cook_time integer,
      prep_time integer CHECK (prep_time IS NULL OR prep_time BETWEEN 0 AND 10080),
      servings text, tags text[],
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
    assert.equal(dinnerCatalog.length, 12);
    assert.equal(new Set(seedIds).size, 12);
    for (const { id, ...recipe } of dinnerCatalog) {
      schema.insertRecipeSchema.parse(recipe);
      assert.match(id, /^tablewise:dinner:v1:/);
      assert.match(recipe.servings!, /^[1-9]\d*$/);
      assert.ok(Number.isInteger(recipe.cookTime) && recipe.cookTime! > 0);
      assert.ok(recipe.ingredients.length >= 5 && recipe.steps.length >= 3);
      for (const ingredient of recipe.ingredients) assert.match(ingredient, /^\d/);
      assert.deepEqual(recipe.tags, ["Dinner"]);
    }
    console.log("PASS: 12 typed, complete dinners with numeric servings and quantified ingredients.");
    const snapshot = () => db.select().from(schema.recipes).orderBy(schema.recipes.id);
    const baseline = await snapshot();
    assert.ok(!baseline.some((r) => seedIds.includes(r.id)),
      "Tests require a fresh catalog namespace; use a newly approved local cluster, not deletion of existing data.");
    console.log(`Baseline: ${baseline.length} rows; SHA256=${digest(baseline)}`);
    await db.insert(schema.recipes).values(fixtures);
    const customerRows = await snapshot();
    const collisionId = seedIds.at(-1)!;
    await db.insert(schema.recipes).values({ ...fixtures[0], id: collisionId });
    const collisionBefore = await snapshot();
    await assert.rejects(seedDinners(db), /Seed identifier conflict:/);
    assert.deepEqual(await snapshot(), collisionBefore);
    console.log(`PASS: occupied fixed ID rejected; entire transaction rolled back; SHA256=${digest(collisionBefore)}`);
    await db.delete(schema.recipes).where(eq(schema.recipes.id, collisionId));

    const seedCommand = async () => {
      return exec(process.execPath, ["--import", "tsx", "script/seed-recipes.ts", "--test-socket", socket!]);
    };
    const first = await seedCommand();
    assert.match(first.stdout, /inserted=12, skipped=0/);
    const afterFirst = await snapshot();
    const repeat = await seedCommand();
    assert.match(repeat.stdout, /inserted=0, skipped=12/);
    assert.deepEqual(await snapshot(), afterFirst);
    console.log("PASS: explicit command inserts 12; repeat skips 12 with every row and timestamp unchanged.");

    // Only remove rows created by this test, never baseline rows.
    await db.delete(schema.recipes).where(inArray(schema.recipes.id, seedIds));
    const parallel = await Promise.all([seedCommand(), seedCommand()]);
    assert.deepEqual(parallel.map((r) => r.stdout.match(/inserted=(\d+), skipped=(\d+)/)![0]).sort(),
      ["inserted=0, skipped=12", "inserted=12, skipped=0"].sort());
    const final = await snapshot();
    assert.equal(final.length, customerRows.length + 12);
    assert.deepEqual(final.filter((r) => !seedIds.includes(r.id)), customerRows);
    console.log(`PASS: concurrent fresh commands insert exactly 12; matching-title customer rows unchanged; SHA256=${digest(customerRows)}`);
    // Simulate an operator/customer edit to an existing seed; re-runs must not repair it.
    await db.update(schema.recipes).set({ title: "Edited locally" }).where(eq(schema.recipes.id, seedIds[0]));
    const edited = await snapshot();
    const rejected = await seedCommand().then(() => false, () => true);
    assert.equal(rejected, true);
    assert.deepEqual(await snapshot(), edited);
    // Restore only this test's edit to leave a usable catalog for API/browser verification.
    await db.update(schema.recipes).set({ title: dinnerCatalog[0].title }).where(eq(schema.recipes.id, seedIds[0]));
    console.log("PASS: edited seed content is rejected, not overwritten; command exits nonzero.");
    await db.delete(schema.recipes).where(inArray(schema.recipes.id, fixtures.map((r) => r.id)));
    const finalBaseline = (await snapshot()).filter((r) => !seedIds.includes(r.id));
    assert.deepEqual(finalBaseline, baseline);
    console.log(`PASS: all pre-existing rows unchanged; before/after SHA256=${digest(finalBaseline)}. Test fixtures removed; 12 dinners retained.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error : "Catalog tests failed; no default database was used.");
  process.exitCode = 1;
});
