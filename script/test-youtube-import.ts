// YouTube import against a disposable PostgreSQL database.
// Usage: TABLEWISE_TEST_DATABASE_URL=postgresql://…/<name>_test npm run test:youtube-import (database is reset).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { parseYouTubeUrl } from "../shared/youtube";
import { databaseYouTubeImportStore } from "../server/youtube-import";

const id = "dQw4w9WgXcQ";
for (const ok of [`https://www.youtube.com/watch?v=${id}&t=5`, `https://youtu.be/${id}?si=x`, `https://m.youtube.com/shorts/${id}`, `http://youtube.com/watch?v=${id}`])
  assert.equal(parseYouTubeUrl(ok)?.videoId, id, ok);
for (const bad of ["", "not a url", `https://evil.com/watch?v=${id}`, `https://youtube.com.evil.com/watch?v=${id}`, `https://notyoutu.be/${id}`,
  `https://www.youtube.com/watch?v=short`, `https://www.youtube.com/`, `javascript:alert(1)`, `https://user:pw@youtube.com/watch?v=${id}`])
  assert.equal(parseYouTubeUrl(bad), undefined, bad);

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database whose name ends in _test.");
const pool = new pg.Pool({ connectionString: url });
await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
execFileSync("npx", ["drizzle-kit", "push", "--force"], { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
// The hand-written migration must recreate the table on its own, and be re-runnable.
await pool.query("DROP TABLE recipe_sources");
await pool.query(readFileSync("migrations/0010_recipe_sources.sql", "utf8"));
await pool.query(readFileSync("migrations/0010_recipe_sources.sql", "utf8"));
const store = databaseYouTubeImportStore(undefined, drizzle(pool, { schema }));
const count = async (t: string) => (await pool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
const video = parseYouTubeUrl(`https://youtu.be/${id}`)!;

const first = await store.importVideo("operator", `https://youtu.be/${id}`, video);
assert.equal(first.existing, false);
assert.deepEqual([await count("recipes"), await count("recipe_sources")], [1, 1]);
const source = await store.forRecipe(first.recipeId);
assert.equal(source?.status, "mock"); assert.equal(source?.externalVideoId, id);
assert.equal((await pool.query("SELECT title FROM recipes")).rows[0].title, "YouTube recipe — preview");

// Same owner + same video: the existing recipe, no duplicate (even for concurrent clicks).
const again = await Promise.all([1, 2, 3].map(() => store.importVideo("operator", `https://www.youtube.com/watch?v=${id}`, video)));
for (const r of again) assert.equal(r.recipeId, first.recipeId);
assert.deepEqual([await count("recipes"), await count("recipe_sources")], [1, 1]);
// Another owner gets their own import.
assert.notEqual((await store.importVideo("other", `https://youtu.be/${id}`, video)).recipeId, first.recipeId);
assert.equal(await count("recipes"), 2);

// A failing source insert (owner id too long) must roll back the recipe too.
await assert.rejects(store.importVideo("x".repeat(65), "https://youtu.be/aaaaaaaaaaa", { videoId: "aaaaaaaaaaa", canonicalUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }));
assert.deepEqual([await count("recipes"), await count("recipe_sources")], [2, 2]);

// Deleting the recipe removes its source.
await pool.query("DELETE FROM recipes WHERE id = $1", [first.recipeId]);
assert.equal(await store.forRecipe(first.recipeId), undefined);
await pool.end();
console.log("youtube import ok");
