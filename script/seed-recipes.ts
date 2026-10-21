import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { seedDinners } from "../server/seeds/seed-dinners";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

async function main() {
  const pool = await openLocalTestDatabase(testSocketArgument());
  try {
    const result = await seedDinners(drizzle(pool, { schema }));
    console.log(`Dinner catalog: inserted=${result.inserted}, skipped=${result.skipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Do not print connection/provider error objects, URLs or credentials.
  console.error(error instanceof Error && error.message.startsWith("Seed identifier conflict:")
    ? error.message : "Seed failed. Confirm the isolated local test cluster and recipe table are prepared; see docs/phase-2-catalog.md.");
  process.exitCode = 1;
});
