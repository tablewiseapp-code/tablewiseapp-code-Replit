// Compares recipe rows read back from PostgreSQL (JSON array on stdin, produced by
// script/recipe-catalog-db.sh) with the canonical catalog JSON. Exit 1 on any difference.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { dbRow, contentHash, ID_PREFIX, type CatalogRecipe } from "./build-recipe-catalog";

const canonical = JSON.parse(readFileSync("data/catalog/tablewise-recipes-v1.json", "utf8"));
const expected = (canonical.recipes as CatalogRecipe[]).map(dbRow);
const stored = JSON.parse(readFileSync(0, "utf8")) as ReturnType<typeof dbRow>[];
const catalogRows = stored.filter(r => r.id.startsWith(ID_PREFIX));
const byId = new Map(catalogRows.map(r => [r.id, r]));
const problems = expected.filter(r => !isDeepStrictEqual(byId.get(r.id), r)).map(r => r.id);
if (catalogRows.length !== expected.length) problems.push(`count ${catalogRows.length} != ${expected.length}`);
const storedHash = contentHash(expected.map(r => byId.get(r.id)!).filter(Boolean));
const result = { storedCatalogRows: catalogRows.length, otherRows: stored.length - catalogRows.length,
  identicalToCanonical: problems.length === 0 && storedHash === canonical.contentSha256, storedContentSha256: storedHash, problems };
console.log(JSON.stringify(result));
if (!result.identicalToCanonical) process.exitCode = 1;
