import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { PilotEventStore } from "../server/pilot-analytics";

async function main() {
  const pool = await openLocalTestDatabase(testSocketArgument());
  try {
    console.log(JSON.stringify(await new PilotEventStore(async () => pool).summary(), null, 2));
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Aggregate summary unavailable; no default database fallback."); process.exitCode = 1; });
