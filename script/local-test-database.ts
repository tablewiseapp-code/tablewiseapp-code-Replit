import { realpath } from "node:fs/promises";
import { userInfo } from "node:os";
import pg from "pg";

// Deliberately no DATABASE_URL fallback. These tools only target a freshly
// prepared local cluster, never the application's configured database.
export async function openLocalTestDatabase(socket: string | undefined) {
  if (!socket || !/^\/tmp\/tablewise-phase2(?:-[a-zA-Z0-9_-]+)?\/socket$/.test(socket)) {
    throw new Error("Supply --test-socket /tmp/tablewise-phase2/socket for an approved isolated local cluster.");
  }
  if (await realpath(socket) !== socket) throw new Error("Test socket must not be a symbolic link.");
  const pool = new pg.Pool({
    host: socket, port: 5432, database: "tablewise_phase2", user: userInfo().username,
    password: "", connectionTimeoutMillis: 5000,
  });
  try {
    const { rows: [settings] } = await pool.query<{
      data: string; listen: string; socket: string; database: string;
    }>(`SELECT current_setting('data_directory') AS data,
       current_setting('listen_addresses') AS listen,
       current_setting('unix_socket_directories') AS socket,
       current_database() AS database`);
    if (settings.data !== socket.replace(/\/socket$/, "/data")
      || settings.listen !== "" || settings.socket !== socket
      || settings.database !== "tablewise_phase2") {
      throw new Error("Target is not the dedicated socket-only Phase 2 test cluster.");
    }
    console.log(`Verified isolated local database: ${settings.database}; data=${settings.data}; TCP disabled.`);
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

export function testSocketArgument() {
  const index = process.argv.indexOf("--test-socket");
  return index < 0 ? undefined : process.argv[index + 1];
}
