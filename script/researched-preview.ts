import assert from "node:assert/strict";
import { db, pool } from "../server/db";
import { DatabaseStorage } from "../server/storage";
import { researchedDinners } from "../server/seeds/researched-import";

async function main() {
  try {
    const rows = await new DatabaseStorage(db).getAllRecipes();
    assert.equal(rows.length, researchedDinners.length, "Preview must contain only the twelve owner-approved researched dinners.");
    for (const expected of researchedDinners) {
      const stored = rows.find(row => row.id === expected.id);
      assert.ok(stored);
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(stored[key as keyof typeof stored], value);
      }
    }
    console.log("Verified managed DEVELOPMENT catalog: 12 complete, source-checked dinners. No production connection is used by this preview.");
  } catch (error) { await pool.end(); throw error; }
  // Start in this process: a detached server child can survive workflow removal
  // and keep port 5000 bound. Keep the verified pool alive for the server.
  process.env.NODE_ENV = "development";
  process.env.TABLEWISE_PUBLIC_CATALOG_REVIEWED = "true";
  process.env.TABLEWISE_AI_ENABLED = "false";
  process.env.TABLEWISE_ANALYTICS_ENABLED = "false";
  process.env.TABLEWISE_OPERATOR_TOKEN = "";
  await import("../server/index");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
