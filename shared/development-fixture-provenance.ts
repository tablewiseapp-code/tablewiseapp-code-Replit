// Deliberately not a meal classification or an authorship claim.
export const developmentFixtureTag = "Synthetic test data";
export const developmentFixturePrefix = "tablewise:synthetic:v1:";
export function isDevelopmentFixture(recipe: { id: string; tags?: string[] | null }) {
  return recipe.id.startsWith(developmentFixturePrefix) ||
    Boolean(recipe.tags?.includes(developmentFixtureTag));
}
