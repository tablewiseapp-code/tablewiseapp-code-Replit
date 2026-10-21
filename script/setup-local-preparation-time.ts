import { readFile } from "node:fs/promises";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

async function main() {
  const pool = await openLocalTestDatabase(testSocketArgument());
  try {
    const migration = await readFile("migrations/0002_recipe_preparation_time.sql", "utf8");
    await pool.query(migration);
    console.log("Optional preparation-time column installed in the verified local test database only.");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("Local preparation-time setup failed; no alternative database was used.");
  process.exitCode = 1;
});
