// Grocery categories: the fixed names stored with shared lists, their order, labels and the word map that sorts items.
export const groceryCategoryOrder = [
  "Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs",
  "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other",
];
export const groceryCategoryLabelKeys: Record<string, string> = {
  "Produce": "grocery.produce", "Meat & Poultry": "grocery.meatPoultry", "Seafood": "grocery.seafood", "Dairy & Eggs": "grocery.dairyEggs",
  "Grains & Pasta": "grocery.grainsPasta", "Canned & Jarred": "grocery.cannedJarred", "Spices & Seasonings": "grocery.spicesSeasonings", "Other": "grocery.other",
};

const ingredientCategories: Record<string, string[]> = {
  "Produce": ["broccoli", "bell pepper", "ginger", "lemon", "dill", "cucumber", "tomato", "olives", "lettuce", "spinach", "carrot", "celery", "onion", "garlic", "mushrooms", "rosemary", "thyme", "parsley", "potatoes", "cabbage slaw", "lime", "avocado", "romaine lettuce", "berries"],
  "Meat & Poultry": ["chicken", "chicken breast", "grilled chicken", "whole chicken", "ground beef", "beef chuck", "bacon"],
  "Seafood": ["salmon", "shrimp", "white fish"],
  "Dairy & Eggs": ["eggs", "cheese", "feta", "parmesan", "butter", "milk", "yogurt", "sour cream", "crema"],
  "Grains & Pasta": ["rice", "arborio rice", "pasta", "bread", "oats", "quinoa", "tortilla", "corn tortillas", "taco shells", "breadcrumbs", "flour", "croutons"],
  "Canned & Jarred": ["soy sauce", "olive oil", "vegetable broth", "beef broth", "hummus", "chickpeas", "lentils", "caesar dressing", "lemon tahini dressing", "white wine"],
  "Spices & Seasonings": ["cumin", "black pepper", "red pepper flakes"],
  "Other": ["honey", "lemon juice"],
};

export function categorizeIngredient(ingredient: string): string {
  const lowerIngredient = ingredient.toLowerCase();
  for (const [category, items] of Object.entries(ingredientCategories)) {
    if (items.some(item => lowerIngredient.includes(item.toLowerCase()) || item.toLowerCase().includes(lowerIngredient))) {
      return category;
    }
  }
  return "Other";
}
