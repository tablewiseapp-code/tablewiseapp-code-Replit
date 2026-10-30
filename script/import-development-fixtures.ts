import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentFixtureManifest } from "../server/seeds/development-fixtures";
import { importDevelopmentFixtures } from "./development-fixture-import";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--manifest") {
    console.log(JSON.stringify(developmentFixtureManifest, null, 2)); return;
  }
  const flags = new Map<string, string>();
  let apply = false, dryRun = false;
  const allowed = new Set(["--verified-development-system-id", "--verified-development-database", "--snapshot", "--baseline-file"]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--apply" && !apply) { apply = true; continue; }
    if (key === "--dry-run" && !dryRun) { dryRun = true; continue; }
    if (!allowed.has(key) || flags.has(key) || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("Unknown, duplicate or incomplete arguments. See docs/development-test-recipes.md.");
    }
    flags.set(key, args[++i]);
  }
  if (apply === dryRun || process.env.NODE_ENV === "production") {
    throw new Error("Choose exactly one of --dry-run or --apply, outside production.");
  }
  const systemIdentifier = flags.get("--verified-development-system-id");
  const database = flags.get("--verified-development-database");
  const reviewedSnapshot = flags.get("--snapshot");
  if (apply && (!/^\d{10,30}$/.test(systemIdentifier ?? "") || !database || !reviewedSnapshot)) {
    throw new Error("Apply requires independently verified development system ID, database and reviewed --snapshot.");
  }
  if (dryRun && (systemIdentifier || database || reviewedSnapshot)) throw new Error("Identity/apply flags are not dry-run flags.");
  const baselineFile = flags.get("--baseline-file");
  let file: string | undefined;
  if (baselineFile) {
    file = resolve(baselineFile);
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "generated-artifacts");
    if (!file.startsWith(`${root}/`) || !file.endsWith(".json")) throw new Error("Save baselines under generated-artifacts/ as .json.");
    // Reserve before any connection/write. Never overwrite a prior baseline.
    await writeFile(file, "", { flag: "wx", mode: 0o600 });
  }
  if (dryRun && !file) throw new Error("Dry-run requires --baseline-file generated-artifacts/NAME.json.");
  const { pool } = await import("../server/db");
  try {
    const result = await importDevelopmentFixtures(pool, {
      apply, reviewedSnapshot,
      verifiedDevelopmentTarget: apply ? { systemIdentifier: systemIdentifier!, database: database! } : undefined,
    });
    if (file) await writeFile(file, JSON.stringify(result, null, 2), { mode: 0o600 });
    const { baseline: _baseline, ...report } = result;
    console.log(JSON.stringify(report, null, 2));
    console.log("This identity is not proof of development. Obtain independent provisioning evidence before apply. No import is run by startup/build/merge/deploy.");
  } finally { await pool.end(); }
}
main().catch(error => {
  // Connection errors can contain infrastructure details; do not print URLs.
  const message = error instanceof Error ? error.message : "Import failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database URL]"));
  process.exitCode = 1;
});
