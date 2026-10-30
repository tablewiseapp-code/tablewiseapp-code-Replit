import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { userInfo } from "node:os";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { developmentFixtures, developmentFixtureManifest, parseFixtureSource, readFixtureSource, fixtureSourceSHA256 } from "../server/seeds/development-fixtures";
import { researchedDinners } from "../server/seeds/researched-import";
import { verifyPreviewCatalog } from "../server/seeds/preview-catalog";
import { importDevelopmentFixtures, readIdentity, snapshotHash, type RecipeSnapshot } from "./development-fixture-import";

async function main() {
  const sourceText = readFixtureSource();
  assert.equal(createHash("sha256").update(sourceText).digest("hex"), fixtureSourceSHA256);
  assert.deepEqual(parseFixtureSource(sourceText), developmentFixtureManifest.entries);
  assert.equal(developmentFixtures.length, 100);
  assert.equal(new Set(developmentFixtures.map(row => row.id)).size, 100);
  assert.ok(new Set(developmentFixtures.map(row => row.sourceUrl)).size < 100);
  // Independent extraction from the numbered Markdown, not the importer's own
  // representation: check every ordered line, title, URL and reference label.
  const sections = [...sourceText.matchAll(/^## (\d{3}) — ([^\n]+)\n([\s\S]*?)(?=^## \d{3} — |$(?![\s\S]))/gm)];
  assert.equal(sections.length, 100);
  sections.forEach((section, i) => {
    const entry = developmentFixtureManifest.entries[i];
    const blocks = [...section[3].matchAll(/```text\n([\s\S]*?)\n```/g)].map(block => block[1].split("\n"));
    assert.equal(entry.number, section[1]);
    assert.equal(entry.recipe.title, section[2]);
    assert.equal(entry.recipe.sourceUrl, section[3].match(/\*\*Source link:\*\* (.+)/)![1].trimEnd());
    assert.equal(entry.referenceChef, section[3].match(/\*\*Chef \(reference only\):\*\* (.+)/)![1].trimEnd());
    assert.equal(entry.sourceType, section[3].match(/\*\*Source type:\*\* (.+)/)![1]);
    assert.deepEqual(entry.recipe.ingredients, blocks[0]);
    assert.deepEqual(entry.recipe.steps, blocks[1]);
    for (const field of ["prepTime", "cookTime", "servings", "image"] as const) assert.equal(entry.recipe[field], null);
    assert.ok(entry.recipe.tags?.includes("Synthetic test data"));
    assert.ok(entry.recipe.tags?.every(tag => !/^(Dinner|Lunch|Breakfast|meal:|suitability:)/i.test(tag)));
  });
  for (const malformed of [
    sourceText.replace("## 002 —", "## 003 —"),
    sourceText.replace("**Title:** Pressure cooker Bolognese", "**Title:** Different"),
    sourceText.replace("https://www.jamieoliver.com/recipes/pasta/", "javascript:alert(1)"),
    sourceText.replace("300 g ground beef", " 300 g ground beef"),
    sourceText.replace("300 g ground beef", "x".repeat(1001)),
    sourceText.replace("TEST DATA, NOT OFFICIAL CHEF RECIPES.", "Recipes"),
    sourceText.slice(0, sourceText.indexOf("## 100 —")),
  ]) assert.throws(() => parseFixtureSource(malformed));

  assert.deepEqual(verifyPreviewCatalog(researchedDinners), { total: 12, researched: 12, synthetic: 0, other: 0 });
  assert.deepEqual(verifyPreviewCatalog([...researchedDinners, ...developmentFixtures, { id: "unrelated" }]),
    { total: 113, researched: 12, synthetic: 100, other: 1 });
  assert.throws(() => verifyPreviewCatalog([...researchedDinners, ...developmentFixtures.slice(1)]), /Incomplete/);
  assert.throws(() => verifyPreviewCatalog([...researchedDinners.slice(1), ...developmentFixtures]), /differs/);
  assert.throws(() => verifyPreviewCatalog([...researchedDinners, ...developmentFixtures.map((r, i) => i ? r : { ...r, title: "edited" })]), /differs/);

  const pool = await openLocalTestDatabase(testSocketArgument());
  const client = await pool.connect();
  const name = `development_fixtures_${randomBytes(8).toString("hex")}`;
  // Dedicated verified disposable database only; no DATABASE_URL fallback.
  // Fix search_path on every checkout, including the importer's own sessions.
  await pool.query(`SET search_path TO "${name}"`);
  const originalConnect = pool.connect.bind(pool);
  const scopedPool = {
    connect: async () => {
      const connection = await originalConnect();
      await connection.query(`SET search_path TO "${name}"`);
      return connection;
    },
  } as typeof pool;
  try {
    await client.query(`CREATE SCHEMA "${name}"`);
    await client.query(`SET search_path TO "${name}"`);
    await client.query(`CREATE TABLE recipes (
      id varchar PRIMARY KEY, title text NOT NULL, ingredients text[] NOT NULL,
      steps text[] NOT NULL, image text, source_url text, cook_time integer,
      credit_kind text, credit_name varchar(120),
      servings text, tags text[], created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(), owner_note text DEFAULT 'preserve additional columns')`);
    const snap = async (): Promise<RecipeSnapshot> => (await client.query('SELECT to_jsonb(r) AS row FROM recipes r ORDER BY id COLLATE "C"')).rows.map(row => row.row);
    const identity = await readIdentity(client);
    let baseline = await snap();
    await assert.rejects(importDevelopmentFixtures(scopedPool, { apply: false }), /schema is missing/);
    assert.deepEqual(await snap(), baseline);
    await client.query("ALTER TABLE recipes ADD COLUMN prep_time integer");
    for (const recipe of researchedDinners) {
      await client.query(`INSERT INTO recipes
        (id,title,ingredients,steps,image,source_url,cook_time,prep_time,servings,tags,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2020-01-02 03:04:05.123456','2021-02-03 04:05:06.654321')`,
      [recipe.id,recipe.title,recipe.ingredients,recipe.steps,recipe.image,recipe.sourceUrl,recipe.cookTime,recipe.prepTime,recipe.servings,recipe.tags]);
    }
    baseline = await snap();
    const dry = await importDevelopmentFixtures(scopedPool, { apply: false });
    assert.equal(dry.before, 12); assert.equal(dry.after, 12); assert.equal(dry.wouldInsert, 100);
    assert.deepEqual(dry.baseline, baseline);
    assert.deepEqual(await snap(), baseline, "Dry-run is read-only.");
    await assert.rejects(importDevelopmentFixtures(scopedPool, { apply: true }), /requires/);
    await assert.rejects(importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: { ...identity, systemIdentifier: "1234567890123456789" }, reviewedSnapshot: dry.snapshot,
    }), /does not match/);
    await assert.rejects(importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: identity, reviewedSnapshot: "0".repeat(64),
    }), /changed since dry-run/);
    assert.deepEqual(await snap(), baseline);
    const applied = await importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: identity, reviewedSnapshot: dry.snapshot,
    });
    assert.equal(applied.before, 12); assert.equal(applied.after, 112); assert.equal(applied.inserted, 100);
    const imported = await snap();
    assert.deepEqual(imported.filter(row => researchedDinners.some(r => r.id === row.id)), baseline);
    for (const recipe of developmentFixtures) {
      const stored = imported.find(row => row.id === recipe.id)!;
      assert.equal(stored.title, recipe.title); assert.equal(stored.source_url, recipe.sourceUrl);
      assert.deepEqual(stored.ingredients, recipe.ingredients); assert.deepEqual(stored.steps, recipe.steps);
      assert.deepEqual(stored.tags, recipe.tags);
      assert.equal(stored.prep_time, null); assert.equal(stored.cook_time, null); assert.equal(stored.servings, null);
    }
    const repeat = await importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: identity, reviewedSnapshot: snapshotHash(imported),
    });
    assert.equal(repeat.inserted, 0); assert.equal(repeat.matched, 100);
    assert.equal(repeat.snapshot, repeat.afterSnapshot);
    assert.deepEqual(await snap(), imported, "Repeat preserves every timestamp, including microseconds.");
    await client.query("UPDATE recipes SET title='Owner edit' WHERE id=$1", [developmentFixtures[99].id]);
    await client.query("DELETE FROM recipes WHERE id=$1", [developmentFixtures[0].id]);
    const conflict = await snap();
    await assert.rejects(importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: identity, reviewedSnapshot: snapshotHash(conflict),
    }), /Conflicting batch content/);
    assert.deepEqual(await snap(), conflict, "Conflict commits no partial repair or insert.");
    // Make a database-side mutation during INSERT: preservation check must
    // reject it and roll back all 100 inserts, not merely detect input conflicts.
    await client.query("DELETE FROM recipes WHERE id LIKE 'tablewise:synthetic:v1:%'");
    await client.query(`INSERT INTO recipes(id,title,ingredients,steps,tags)
      VALUES ('unrelated','Unrelated preserved recipe',ARRAY['original'],ARRAY['original'],ARRAY['Lunch'])`);
    await client.query(`CREATE FUNCTION mutate_original() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE recipes SET updated_at = now() WHERE id='unrelated'; RETURN NEW; END $$`);
    await client.query(`CREATE TRIGGER mutation_test AFTER INSERT ON recipes FOR EACH ROW EXECUTE FUNCTION mutate_original()`);
    const beforeTrigger = await snap();
    await assert.rejects(importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: identity, reviewedSnapshot: snapshotHash(beforeTrigger),
    }), /Existing records or timestamps changed/);
    assert.deepEqual(await snap(), beforeTrigger, "Post-insert preservation failure rolls back the whole batch.");
    await client.query("DROP TRIGGER mutation_test ON recipes");
    const extra = await importDevelopmentFixtures(scopedPool, {
      apply: true, verifiedDevelopmentTarget: identity, reviewedSnapshot: snapshotHash(beforeTrigger),
    });
    assert.equal(extra.before, 13); assert.equal(extra.after, 113);
    assert.deepEqual((await snap()).filter(row => beforeTrigger.some(r => r.id === row.id)), beforeTrigger);
    // Exercise the public CLI itself against this same verified disposable
    // schema, overriding only the child process's connection with a
    // credential-free local socket URL. Never read/print the workspace URL.
    const url = new URL(`postgresql://${userInfo().username}@localhost/tablewise_phase2`);
    url.searchParams.set("host", testSocketArgument()!);
    url.searchParams.set("options", `-c search_path=${name}`);
    const environment = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: "development" };
    const cli = (args: string[], env = environment) => promisify(execFile)(
      process.execPath, ["--import", "tsx", "script/import-development-fixtures.ts", ...args],
      { env, timeout: 15_000 });
    await mkdir("generated-artifacts", { recursive: true });
    const baselineFile = `generated-artifacts/${name}.json`;
    const beforeCLI = await snap();
    await cli(["--dry-run", "--baseline-file", baselineFile]);
    const cliBaseline = JSON.parse(await readFile(baselineFile, "utf8"));
    assert.deepEqual(cliBaseline.baseline, beforeCLI);
    const result = await cli(["--apply", "--verified-development-system-id", identity.systemIdentifier,
      "--verified-development-database", identity.database, "--snapshot", cliBaseline.snapshot]);
    assert.match(result.stdout, /"inserted": 0/);
    await assert.rejects(cli(["--apply"]), /requires independently verified/);
    await assert.rejects(cli(["--apply", "--dry-run"]), /exactly one/);
    await assert.rejects(cli(["--dry-run"], { ...environment, NODE_ENV: "production" }), /outside production/);
    await assert.rejects(cli(["--dry-run", "--baseline-file", baselineFile]), /EEXIST/);
    await assert.rejects(cli(["--dry-run", "--baseline-file", "baseline-outside-generated.json"]), /under generated-artifacts/);
    assert.deepEqual(await snap(), beforeCLI, "CLI no-op and rejected invocations change nothing.");
    console.log("PASS isolated rehearsal ONLY: all 100 exact entries and provenance; malformed input; missing schema; identity/snapshot guards; read-only dry-run; 12→112 and 13→113; preservation of all fields and microsecond timestamps; repeat no-op; conflict and post-insert rollback; expanded catalog validation. No application database writes.");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
