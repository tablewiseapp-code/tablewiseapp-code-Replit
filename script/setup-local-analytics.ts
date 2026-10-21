import { readFile } from "node:fs/promises";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

// Explicit local-only additive setup. Never imported by server/startup/merge.
async function main() {
  const pool = await openLocalTestDatabase(testSocketArgument());
  try {
    const migration = await readFile(new URL("../migrations/0001_pilot_analytics.sql", import.meta.url), "utf8");
    await pool.query(`BEGIN;\n${migration}\nCOMMIT;`);
    console.log("Applied additive pilot_events migration to the verified socket-only local test database. Existing tables/rows were not altered.");
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Analytics setup failed; no default database fallback."); process.exitCode = 1; });
