import { db, pool } from "../server/db";
import { DatabaseStorage } from "../server/storage";
import { verifyPreviewCatalog } from "../server/seeds/preview-catalog";

async function main() {
  try {
    const rows = await new DatabaseStorage(db).getAllRecipes();
    const counts = verifyPreviewCatalog(rows);
    console.log(`Validated preview content: ${counts.total} recipes; ${counts.researched} researched, ${counts.synthetic} synthetic test fixtures, ${counts.other} other records. Content validation does not establish database isolation. No records imported or migrated.`);
  } catch (error) { await pool.end(); throw error; }
  // Start in this process: a detached server child can survive workflow removal
  // and keep port 5000 bound. Keep the verified pool alive for the server.
  process.env.NODE_ENV = "development";
  process.env.TABLEWISE_DEV_CURATED_CATALOG ??= "true";
  process.env.TABLEWISE_PUBLIC_CATALOG_REVIEWED = "true";
  process.env.TABLEWISE_AI_ENABLED = "false";
  process.env.TABLEWISE_ANALYTICS_ENABLED = "false";
  process.env.TABLEWISE_OPERATOR_TOKEN = "";
  await import("../server/index");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
