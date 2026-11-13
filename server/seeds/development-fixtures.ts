import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { recipeId, recipeInput } from "../request-schemas";
import { developmentFixturePrefix, developmentFixtureTag } from "../../shared/development-fixture-provenance";
import savedManifest from "./development-fixtures.json";

export const fixtureSourceFile = "attached_assets/tablewise_100_recipes_manual_import_1793384956849.md";
export const fixtureSourceSHA256 = "d1d34ee39ac224835b0d62c169d883949d43ccf8d65240bfb07de3f48c032e9b";
export const fixtureDisclaimer = "Synthetic illustrative test recipes; not transcriptions, verified recreations or endorsements by the referenced chefs. Source links are unverified; collection pages are not individual recipe sources.";
export function readFixtureSource() {
  const text = readFileSync(new URL(`../../${fixtureSourceFile}`, import.meta.url), "utf8");
  if (createHash("sha256").update(text).digest("hex") !== fixtureSourceSHA256) {
    throw new Error("Fixture attachment differs from the reviewed batch. Stop and review; do not silently regenerate it.");
  }
  return text;
}

export function parseFixtureSource(text: string) {
  if (!text.includes("TEST DATA, NOT OFFICIAL CHEF RECIPES.") ||
    !text.includes("95 URLs") || !text.includes("not direct links")) {
    throw new Error("Fixture provenance disclaimer is missing.");
  }
  const sections = text.split(/^## (?=\d{3} — )/m).slice(1);
  if (sections.length !== 100) throw new Error("Expected exactly 100 numbered fixture sections.");
  return sections.map((section, index) => {
    const match = section.match(/^(\d{3}) — ([^\n]+)\n\n\*\*Title:\*\* ([^\n]+?) *\n\*\*Source link:\*\* ([^\n]+?) *\n\*\*Chef \(reference only\):\*\* ([^\n]+?) *\n\*\*Source type:\*\* ([^\n]+)\n\n\*\*Ingredients \(copy all lines\):\*\*\n```text\n([\s\S]+?)\n```\n\n\*\*Steps \(copy all lines\):\*\*\n```text\n([\s\S]+?)\n```\s*(?:---\s*)?$/);
    if (!match || Number(match[1]) !== index + 1 || match[2] !== match[3]) {
      throw new Error(`Malformed or out-of-order fixture section ${index + 1}.`);
    }
    const [, number, , title, sourceUrl, referenceChef, sourceType, ingredientText, stepText] = match;
    if (!["Jamie Oliver", "Gordon Ramsay", "Aviv Moshe"].includes(referenceChef) ||
      !["collection (collection page, not a direct recipe)",
        "direct (recipe-specific URL from original list; not revalidated)"].includes(sourceType)) {
      throw new Error(`Unrecognized reference metadata in section ${number}.`);
    }
    const input = {
      title, sourceUrl, ingredients: ingredientText.split("\n"), steps: stepText.split("\n"),
      image: null, prepTime: null, cookTime: null, servings: null,
      tags: [developmentFixtureTag, sourceType.startsWith("collection") ? "Unverified collection link" : "Unverified source link"],
    };
    const parsed = recipeInput.parse(input);
    // Validation must not trim, correct or otherwise rewrite the supplied prose.
    if (!isDeepStrictEqual(input, parsed)) throw new Error(`Validation would change fixture ${number}.`);
    return {
      number, referenceChef, sourceType,
      recipe: { id: recipeId.parse(`${developmentFixturePrefix}${number}`), ...parsed },
    };
  });
}

// A checked-in manifest makes startup/import independent of ignored uploads.
// Attachment-to-manifest equality is checked exhaustively by the isolated test.
if (createHash("sha256").update(JSON.stringify(savedManifest)).digest("hex") !==
  "2e09cb25567017bc7c80a46641e7166256076c0067d0c14ac0d0c6e2b5f45f09" ||
  savedManifest.sourceSHA256 !== fixtureSourceSHA256 || savedManifest.disclaimer !== fixtureDisclaimer) {
  throw new Error("Fixture manifest differs from the reviewed batch.");
}
export const developmentFixtureManifest = savedManifest;
// ponytail: curated 20-recipe subset of the 100 supplied; numbers keep their original source numbering.
export const developmentFixtures = developmentFixtureManifest.entries.map(entry => {
  const { id, ...input } = entry.recipe;
  if (id !== `${developmentFixturePrefix}${entry.number}` ||
    !isDeepStrictEqual(input, recipeInput.parse(input))) throw new Error("Invalid manifest recipe.");
  recipeId.parse(id);
  return entry.recipe;
});
if (developmentFixtures.length !== 20) throw new Error("Expected all 20 manifest entries.");
if (developmentFixtures.some(r => !r.servings || r.prepTime == null || r.cookTime == null)) throw new Error("Every fixture needs servings, prep and cook time.");
