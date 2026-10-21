import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

// Test the actual production bundle with an allowlisted environment, not the
// workspace's database, API credentials, operator token or dotenv configuration.
async function main() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const child = spawn(process.execPath, ["dist/index.cjs"], {
    env: { PATH: process.env.PATH, NODE_ENV: "production", PORT: String(port), DOTENV_CONFIG_PATH: "/dev/null" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => { output += String(data); });
  child.stderr.on("data", data => { output += String(data); });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
  try {
    let started = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error("Credential-free startup failed.");
      if (output.includes("serving on port")) { started = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(started, "Server must start without database or AI credentials.");
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/operator`)).status, 200);
    assert.equal((await fetch(`${base}/api/recipes`)).status, 503);
    for (const path of ["/api/recipes", "/api/parse-recipe", "/api/transcribe-audio"]) {
      assert.equal((await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403);
    }
    assert.equal((await fetch(`${base}/api/analytics/results`)).status, 403);
    assert.equal((await fetch(`${base}/recipes`)).status, 200);
    assert.equal(child.exitCode, null);
    console.log("PASS: real production bundle starts without database, operator or AI credentials; all sensitive routes fail closed.");
  } finally {
    clearTimeout(timeout);
    child.kill("SIGTERM");
    if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
  }
}
main().catch(() => { console.error("Credential-free production startup check failed."); process.exitCode = 1; });
