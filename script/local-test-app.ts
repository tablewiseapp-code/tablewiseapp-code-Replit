import { spawn } from "node:child_process";
import { userInfo } from "node:os";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { DatabaseStorage } from "../server/storage";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";

async function main() {
  const socket = testSocketArgument();
  const pool = await openLocalTestDatabase(socket);
  try {
    const rows = await new DatabaseStorage(drizzle(pool, { schema })).getAllRecipes();
    assert.equal(rows.length, dinnerCatalog.length);
    for (const expected of dinnerCatalog) {
      const actual = rows.find(row => row.id === expected.id);
      assert.ok(actual);
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(actual[key as keyof typeof actual], value);
      }
    }
    console.log("Reviewed local catalog: exactly 12 approved dinners, no other rows.");
  } finally { await pool.end(); }
  // Synthetic, credential-free local connection for this child process only.
  // The workspace's existing DATABASE_URL is neither read nor changed.
  const url = `postgresql://${userInfo().username}@localhost/tablewise_phase2?host=${encodeURIComponent(socket!)}`;
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    env: {
      ...process.env, DATABASE_URL: url, NODE_ENV: "development",
      TABLEWISE_PUBLIC_CATALOG_REVIEWED: "true", TABLEWISE_AI_ENABLED: "false",
      TABLEWISE_OPERATOR_TOKEN: "",
      TABLEWISE_ANALYTICS_ENABLED: "true",
    },
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
  child.on("error", () => { console.error("Local test app could not start."); process.exitCode = 1; });
}

main().catch(() => {
  console.error("Local test app refused: prepare the isolated cluster and pass --test-socket.");
  process.exitCode = 1;
});
