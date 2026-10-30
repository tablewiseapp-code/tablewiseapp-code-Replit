import { isDeepStrictEqual } from "node:util";
import { researchedDinners } from "./researched-import";
import { developmentFixtures } from "./development-fixtures";
import { developmentFixturePrefix } from "../../shared/development-fixture-provenance";

export function verifyPreviewCatalog(rows: Array<{ id: string }>) {
  const byId = new Map(rows.map(row => [row.id, row]));
  if (byId.size !== rows.length) throw new Error("Duplicate recipe IDs in preview.");
  const verify = (expected: { id: string }) => {
    const stored = byId.get(expected.id);
    if (!stored || !Object.entries(expected).every(([key, value]) =>
      isDeepStrictEqual((stored as Record<string, unknown>)[key], value))) {
      throw new Error(`Preview content differs for ${expected.id}; no records were changed.`);
    }
  };
  researchedDinners.forEach(verify);
  const synthetic = rows.filter(row => row.id.startsWith(developmentFixturePrefix));
  if (synthetic.length) {
    if (synthetic.length !== developmentFixtures.length) throw new Error("Incomplete or unrecognized synthetic fixture batch.");
    developmentFixtures.forEach(verify);
  }
  return { total: rows.length, researched: researchedDinners.length, synthetic: synthetic.length,
    other: rows.length - researchedDinners.length - synthetic.length };
}
