import { mkdir, writeFile } from "node:fs/promises";
import { researchedDinners, researchedImportSQL } from "../server/seeds/researched-import";

async function main() {
  await mkdir("imports", { recursive: true });
  await writeFile("imports/researched-dinners.sql", researchedImportSQL());
  await writeFile("imports/researched-dinners.json", JSON.stringify(researchedDinners, null, 2) + "\n");
  const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const columns = ["title", "servings", "preparation_minutes", "cooking_minutes", "total_minutes", "source"];
  const rows = researchedDinners.map(r =>
    [r.title, r.servings, r.prepTime, r.cookTime, r.prepTime! + r.cookTime!, r.sourceUrl].map(quote).join(","));
  await writeFile("imports/researched-dinners.csv", [columns.join(","), ...rows].join("\n") + "\n");
  console.log("Prepared 12 validated, sourced recipes: imports/researched-dinners.sql, .json and .csv. No database was changed.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
