// Grocery categories (shopping aisles): the fixed names stored with shared lists, their order, labels and the word map that sorts items.
export const groceryCategoryOrder = [
  "Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs",
  "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other",
];
export const groceryCategoryLabelKeys: Record<string, string> = {
  "Produce": "grocery.produce", "Meat & Poultry": "grocery.meatPoultry", "Seafood": "grocery.seafood", "Dairy & Eggs": "grocery.dairyEggs",
  "Grains & Pasta": "grocery.grainsPasta", "Canned & Jarred": "grocery.cannedJarred", "Spices & Seasonings": "grocery.spicesSeasonings", "Other": "grocery.other",
};

// The form of a product decides its aisle before its main word: "chicken stock" is jarred, "garlic powder" a spice.
const formRules: [RegExp, string][] = [
  [/\b(stock|broth|bouillon|sauce|paste|ketchup|vinegar|oil|canned|tinned|jarred|passata|salsa|dressing|syrup|pesto)\b/, "Canned & Jarred"],
  [/\b(powder|flakes|seasoning|spices?|extract)\b|\b(dried|ground)\s+(basil|oregano|thyme|rosemary|parsley|dill|sage|mint|coriander|ginger|cinnamon|cumin|nutmeg|cloves?)\b/, "Spices & Seasonings"],
];

// Singular words; a plural "s"/"es" also matches. The longest matching phrase wins ("bell pepper" over "pepper").
const ingredientCategories: Record<string, string[]> = {
  "Produce": ["apple", "avocado", "banana", "basil", "bean sprout", "beet", "bell pepper", "red pepper", "green pepper", "yellow pepper",
    "berries", "blueberries", "raspberries", "strawberries", "broccoli", "brussels sprout", "cabbage", "cabbage slaw", "carrot", "cauliflower",
    "celery", "chilli", "cilantro", "fresh coriander", "corn", "cucumber", "dill", "eggplant", "aubergine", "fennel", "garlic", "ginger", "grape",
    "green bean", "green onion", "scallion", "herbs", "jalapeño", "jalapeno", "kale", "leek", "lemon", "lettuce", "romaine lettuce", "lime", "mango",
    "mint", "mushroom", "onion", "orange", "parsley", "pea", "peach", "pear", "pineapple", "potato", "sweet potato", "pumpkin", "radish",
    "rosemary", "sage", "shallot", "spinach", "squash", "thyme", "tomato", "cherry tomato", "zucchini", "courgette", "arugula", "salad greens"],
  "Meat & Poultry": ["chicken", "chicken breast", "chicken thigh", "beef", "ground beef", "beef chuck", "pork", "pork mince", "lamb", "turkey", "bacon",
    "ham", "sausage", "mince", "steak", "veal", "duck", "chorizo", "prosciutto", "salami", "pancetta"],
  "Seafood": ["salmon", "shrimp", "prawn", "fish", "white fish", "cod", "tuna", "tilapia", "halibut", "haddock", "crab", "lobster", "mussel",
    "clam", "scallop", "squid", "anchovy", "anchovies", "sardine", "trout", "mackerel"],
  "Dairy & Eggs": ["egg", "milk", "cheese", "cheddar", "mozzarella", "parmesan", "feta", "ricotta", "cream cheese", "butter", "cream", "sour cream",
    "heavy cream", "yogurt", "yoghurt", "greek yogurt", "crème fraîche", "crema", "ghee", "buttermilk"],
  "Grains & Pasta": ["rice", "arborio rice", "pasta", "spaghetti", "penne", "noodle", "macaroni", "fusilli", "lasagna", "bread", "bun", "oat",
    "rolled oats", "quinoa", "couscous", "tortilla", "corn tortilla", "taco shell", "breadcrumb", "panko", "flour", "cornstarch", "crouton", "pita",
    "naan", "bagel", "cereal", "barley", "bulgur", "polenta", "cornmeal", "baguette", "wrap"],
  "Canned & Jarred": ["chickpea", "lentil", "kidney bean", "black bean", "white bean", "coconut milk", "peanut butter", "crushed tomato",
    "olive", "caper", "pickle", "honey", "jam", "tahini", "hummus", "wine", "white wine", "mustard", "mayonnaise", "mayo"],
  "Spices & Seasonings": ["salt", "pepper", "black pepper", "cumin", "paprika", "smoked paprika", "cinnamon", "nutmeg", "turmeric", "oregano",
    "cayenne", "coriander", "cardamom", "bay leaf", "bay leaves", "allspice", "vanilla", "za'atar", "sumac", "garam masala", "saffron",
    "star anise", "baking soda", "yeast"],
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrases = Object.entries(ingredientCategories)
  .flatMap(([category, words]) => words.map(word => ({ category, word, pattern: new RegExp(`(^|[^\\p{L}])${escape(word)}(e?s)?($|[^\\p{L}])`, "u") })))
  .sort((a, b) => b.word.length - a.word.length);

export function categorizeIngredient(ingredient: string): string {
  const text = ingredient.toLowerCase();
  for (const [pattern, category] of formRules) if (pattern.test(text)) return category;
  return phrases.find(phrase => phrase.pattern.test(text))?.category ?? "Other";
}
