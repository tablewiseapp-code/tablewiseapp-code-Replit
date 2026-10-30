import { userInfo } from "node:os";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";

// This wrapper never imports data. It only serves an explicitly prepared,
// verified disposable catalog for real-API browser tests on a separate port.
async function main() {
  const socket = testSocketArgument();
  const pool = await openLocalTestDatabase(socket);
  await pool.end();
  process.env.DATABASE_URL = `postgresql://${userInfo().username}@localhost/tablewise_phase2?host=${encodeURIComponent(socket!)}`;
  process.env.PORT = "5001";
  await import("./researched-preview");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
