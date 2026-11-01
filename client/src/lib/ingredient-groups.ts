export const ingredientGroupOrder = [
  "protein", "carbs", "vegetables", "dairy", "fats", "seasonings", "other",
] as const;

export type IngredientGroup = (typeof ingredientGroupOrder)[number];

// Common food types, not a calculation of nutritional/macronutrient content.
// Prefer the first food named; compound terms resolve ties before generic words.
const rules: Array<[IngredientGroup, RegExp]> = [
  ["seasonings", /\b(?:(?:chicken|beef|vegetable|fish)\s+(?:stock|broth)|(?:soy|fish|oyster|tomato)\s+sauce|(?:lemon|lime)\s+juice|cream of tartar|stock|broth|sauce|passata|tomato puree|salt|pepper|paprika|cumin|curry|turmeric|oregano|basil|parsley|coriander|cilantro|thyme|rosemary|cinnamon|spice|spices|herbs|vinegar|mustard|ketchup|mayonnaise|miso|baking powder|baking soda|yeast)\b/i],
  ["protein", /\b(?:butter beans|chicken|turkey|beef|pork|lamb|duck|bacon|ham|sausage|sausages|fish|salmon|tuna|cod|haddock|trout|prawns?|shrimp|sardines?|anchovies|eggs?|tofu|tempeh|seitan|lentils?|chickpeas?|beans?|edamame)\b/i],
  ["dairy", /\b(?:(?:almond|soy|soya|oat|coconut|rice)\s+milk|milk|buttermilk|cream|yogh?urt|cheese|cheddar|mozzarella|parmesan|feta|ricotta|quark)\b/i],
  ["fats", /\b(?:(?:olive|vegetable|sunflower|sesame|coconut|rapeseed|canola)\s+oil|oil|butter|ghee|lard|margarine|avocado|nuts?|almonds?|walnuts?|peanuts?|cashews?|seeds?|tahini|coconut)\b/i],
  ["carbs", /\b(?:sweet potato(?:es)?|corn flour|corn starch|pasta|fusilli|spaghetti|penne|macaroni|noodles?|rice|bread|breadcrumbs?|flour|cornflour|cornstarch|potato(?:es)?|oats?|oatmeal|quinoa|couscous|bulgur|barley|tortillas?|pitta|pita|sugar|honey|syrup)\b/i],
  ["vegetables", /\b(?:(?:red|green|yellow|orange|bell)\s+peppers?|peas?|sweetcorn|corn|tomato(?:es)?|onions?|shallots?|garlic|carrots?|broccoli|cauliflower|spinach|kale|cabbage|lettuce|cucumber|courgettes?|zucchini|aubergine|eggplant|mushrooms?|celery|leeks?|squash|pumpkin|beetroot|asparagus|green beans|olives?|lemon|lime|oranges?|apples?|bananas?|berries|blueberries|strawberries|fruit)\b/i],
];

export function ingredientGroup(ingredient: string): IngredientGroup {
  let category: IngredientGroup = "other";
  let firstMatch = Infinity;
  for (const [candidate, pattern] of rules) {
    const match = pattern.exec(ingredient);
    if (match && match.index < firstMatch) {
      category = candidate;
      firstMatch = match.index;
    }
  }
  return category;
}

export function groupIngredients(ingredients: readonly string[]) {
  const groups = new Map<IngredientGroup, string[]>(
    ingredientGroupOrder.map(category => [category, []]),
  );
  for (const ingredient of ingredients) {
    groups.get(ingredientGroup(ingredient))!.push(ingredient);
  }
  return ingredientGroupOrder
    .map(category => ({ category, ingredients: groups.get(category)! }))
    .filter(group => group.ingredients.length > 0);
}
