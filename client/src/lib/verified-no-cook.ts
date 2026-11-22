// Catalog recipes reviewed as needing no cooking appliance (2026-11-21, docs/PRODUCT.md → Known gaps). Rule: no heat and no
// electric appliance at any required step (a fridge or freezer is fine; bought bread, mayonnaise and granola count as
// ingredients). Steps that name no device are missing data, not proof: only these ids match "No cooking appliances".
// Kept here, not as a catalog tag, because the catalog import is additive and refuses changed rows (build-recipe-catalog.ts).
// Reviewed and left out: slow-cooker-pulled-pork (slow cooker), couscous-feta-mint-salad (hot stock), eggless-tiramisu
// (freshly brewed coffee), berry-smoothie, mango-chia-pudding, banana-nice-cream, date-nut-energy-balls,
// hummus-vegetable-sticks (blender or food processor).
const reviewed: Record<string, string> = {
  "chickpea-salad-sandwich": "mash, mix, assemble on bought bread",
  "greek-salad-chickpeas": "whisk dressing, slice, toss",
  "tuna-sweetcorn-sandwich": "mix canned tuna and sweetcorn, assemble",
  "bircher-muesli": "stir, grate, soak in the fridge overnight",
  "greek-yogurt-parfait": "stir and layer with bought granola",
  "overnight-oats": "stir, soak in the fridge overnight",
  "fruit-salad-honey-lime": "slice fruit, whisk dressing",
  "apple-peanut-butter-dip": "whisk dip, slice apples",
  "cucumber-cream-cheese-bites": "slice, beat cream cheese, fill",
  "frozen-yogurt-bark": "spread on a tray and freeze",
  "tomato-salsa": "dice and stir",
};
export const verifiedNoCookIds: ReadonlySet<string> = new Set(Object.keys(reviewed).map(slug => `tablewise:catalog:v1:${slug}`));
