// A recipe without its own photo shows one of three example photos of its main protein
// (client/public/protein-photos, CC0), always the same one for the same recipe, labelled "Example photo".
// ponytail: main protein is guessed from English ingredient words; a recipe in another language gets
// "vegetables" until it has an English translation or a stored protein field.
export const proteinPhotoGroups = ["chicken", "beef", "pork", "fish", "shellfish", "tofu", "beans", "eggs", "cheese", "vegetables"] as const;
export type ProteinPhotoGroup = typeof proteinPhotoGroups[number];

const patterns: [ProteinPhotoGroup, RegExp][] = [
  ["chicken", /\b(?:chicken|turkey)/],
  ["beef", /\b(?:beef|steak|veal|lamb|mince)\b/],
  ["pork", /\b(?:pork|bacon|ham|sausages?|chorizo|prosciutto|pancetta)\b/],
  ["fish", /\b(?:salmon|tuna|cod|tilapia|trout|fish|halibut|sardines?|anchov\w*|mackerel|haddock|sea bass)\b/],
  ["shellfish", /\b(?:shrimps?|prawns?|crab|lobster|mussels?|scallops?|clams?)\b/],
  ["tofu", /\b(?:tofu|tempeh|seitan)\b/],
  ["beans", /\b(?:lentils?|chickpeas?|beans?|edamame|hummus)\b/],
  ["eggs", /\beggs?\b/],
  ["cheese", /\b(?:cheese|paneer|ricotta|feta|halloumi|mozzarella|parmesan|cheddar)\b/],
];

export function proteinPhotoGroup(ingredients: readonly string[]): ProteinPhotoGroup {
  const text = ingredients.join("\n").toLowerCase();
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "vegetables";
}

export function recipePhoto(recipe: { id: string; image?: string | null; ingredients: readonly string[] }) {
  if (recipe.image) return { src: recipe.image, example: false };
  let hash = 0;
  for (const char of recipe.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { src: `/protein-photos/${proteinPhotoGroup(recipe.ingredients)}-${hash % 3 + 1}.jpg`, example: true };
}
