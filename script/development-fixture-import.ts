import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import { developmentFixtures } from "../server/seeds/development-fixtures";
import { developmentFixturePrefix } from "../shared/development-fixture-provenance";

export type TargetIdentity = { systemIdentifier: string; database: string };
export type RecipeSnapshot = Array<Record<string, unknown> & { id: string }>;
export const snapshotHash = (rows: RecipeSnapshot) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex");

export async function readIdentity(client: PoolClient): Promise<TargetIdentity> {
  const { rows: [row] } = await client.query(
    "SELECT system_identifier::text AS system, current_database() AS database FROM pg_control_system()");
  return { systemIdentifier: row.system, database: row.database };
}

async function snapshot(client: PoolClient): Promise<RecipeSnapshot> {
  // PostgreSQL constructs the JSON, retaining full timestamp precision and all
  // columns, including columns this importer knows nothing about.
  const { rows } = await client.query("SELECT to_jsonb(r) AS row FROM recipes r ORDER BY id COLLATE \"C\"");
  return rows.map(result => result.row);
}
const columns: Record<string, string> = {
  id: "id", title: "title", ingredients: "ingredients", steps: "steps", image: "image",
  sourceUrl: "source_url", prepTime: "prep_time", cookTime: "cook_time", servings: "servings", tags: "tags",
};
function matches(row: Record<string, unknown>, expected: typeof developmentFixtures[number]) {
  return Object.entries(columns).every(([field, column]) =>
    isDeepStrictEqual(row[column], expected[field as keyof typeof expected]));
}
function inspect(rows: RecipeSnapshot) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const known = new Set(developmentFixtures.map(recipe => recipe.id));
  for (const row of rows) {
    if (row.id.startsWith(developmentFixturePrefix) && !known.has(row.id)) {
      throw new Error(`Unrecognized fixture ID ${row.id}; nothing imported.`);
    }
  }
  for (const recipe of developmentFixtures) {
    const existing = byId.get(recipe.id);
    if (existing && !matches(existing, recipe)) {
      throw new Error(`Conflicting batch content at ${recipe.id}; nothing imported.`);
    }
  }
  return developmentFixtures.filter(recipe => !byId.has(recipe.id));
}

export async function importDevelopmentFixtures(pool: Pool, options: {
  apply: boolean;
  verifiedDevelopmentTarget?: TargetIdentity;
  reviewedSnapshot?: string;
}) {
  if (options.apply && (!options.verifiedDevelopmentTarget ||
    !/^[a-f0-9]{64}$/.test(options.reviewedSnapshot ?? ""))) {
    throw new Error("Apply requires an independently verified development identity and reviewed snapshot.");
  }
  const client = await pool.connect();
  try {
    await client.query(options.apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    const identity = await readIdentity(client);
    if (options.apply && !isDeepStrictEqual(identity, options.verifiedDevelopmentTarget)) {
      throw new Error("Target does not match the independently verified development identity.");
    }
    if (options.apply) await client.query("LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE");
    const { rows: schema } = await client.query(
      "SELECT attname FROM pg_attribute WHERE attrelid = to_regclass('recipes') AND attnum > 0 AND NOT attisdropped");
    const names = new Set(schema.map(row => row.attname));
    if (![...Object.values(columns), "created_at", "updated_at"].every(name => names.has(name))) {
      throw new Error("Required recipe schema is missing; no schema changes or imports performed.");
    }
    const before = await snapshot(client);
    const beforeHash = snapshotHash(before);
    if (options.apply && beforeHash !== options.reviewedSnapshot) {
      throw new Error("Catalog changed since dry-run. Review a new snapshot before applying.");
    }
    const missing = inspect(before);
    if (options.apply) {
      // One bounded batch; values are bound separately, never interpolated.
      await client.query(`INSERT INTO recipes
        (id,title,ingredients,steps,image,source_url,prep_time,cook_time,servings,tags)
        SELECT id,title,ingredients,steps,image,"sourceUrl","prepTime","cookTime",servings,tags
        FROM jsonb_to_recordset($1::jsonb) AS incoming(
          id text,title text,ingredients text[],steps text[],image text,
          "sourceUrl" text,"prepTime" integer,"cookTime" integer,servings text,tags text[])`,
      [JSON.stringify(missing)]);
    }
    const after = options.apply ? await snapshot(client) : before;
    const afterById = new Map(after.map(row => [row.id, row]));
    if (!before.every(row => isDeepStrictEqual(afterById.get(row.id), row)) ||
      after.length !== before.length + (options.apply ? missing.length : 0)) {
      throw new Error("Existing records or timestamps changed; rolling back the entire import.");
    }
    if (options.apply && inspect(after).length) throw new Error("Incomplete batch; rolling back.");
    await client.query("COMMIT");
    return {
      mode: options.apply ? "apply" : "dry-run", identity, before: before.length,
      after: after.length, wouldInsert: missing.length, inserted: options.apply ? missing.length : 0,
      matched: developmentFixtures.length - missing.length, preserved: before.length,
      snapshot: beforeHash, afterSnapshot: snapshotHash(after),
      newIds: missing.map(recipe => recipe.id), baseline: before,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}
