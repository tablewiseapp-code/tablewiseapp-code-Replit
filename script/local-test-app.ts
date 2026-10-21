import { spawn } from "node:child_process";
import { userInfo } from "node:os";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

async function main() {
  const socket = testSocketArgument();
  const pool = await openLocalTestDatabase(socket);
  await pool.end();
  // Synthetic, credential-free local connection for this child process only.
  // The workspace's existing DATABASE_URL is neither read nor changed.
  const url = `postgresql://${userInfo().username}@localhost/tablewise_phase2?host=${encodeURIComponent(socket!)}`;
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: "development" },
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
