import { useState, useMemo } from "react";
import { useLocation } from "wouter";

interface Recipe {
  id: string;
  title: string;
  minutes: number;
  mealType: string;
  tags: string[];
  tools: string[];
  sourceType: string;
  proteinType: string;
  servingsRange: string;
  hasNotes: boolean;
  modifiedByMe: boolean;
  ingredients: string[];
}

interface PlanAssignment {
  recipeId: string;
  mealType: "Breakfast" | "Lunch" | "Dinner";
  startDay: number;
  spanDays: number;
}

interface WeeklyMealsState {
  filters: Record<string, unknown>;
  selectedIds: string[];
  expandedSections: string[];
  showMoreFilters: boolean;
  planAssignments: PlanAssignment[];
}

const sampleRecipes: Recipe[] = [
  { id: "r1", title: "Plov with Chicken", minutes: 40, mealType: "Dinner", tags: ["kidFriendly"], tools: ["Stovetop"], sourceType: "My recipes", proteinType: "Chicken", servingsRange: "3-4", hasNotes: true, modifiedByMe: true, ingredients: ["rice", "chicken", "onion", "carrot", "garlic", "cumin"] },
  { id: "r2", title: "Vegetable Stir Fry", minutes: 20, mealType: "Dinner", tags: ["vegetarian", "glutenFree"], tools: ["Stovetop"], sourceType: "Imported", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["broccoli", "bell pepper", "soy sauce", "garlic", "ginger"] },
  { id: "r3", title: "Baked Salmon", minutes: 30, mealType: "Dinner", tags: ["glutenFree"], tools: ["Oven"], sourceType: "Trusted authors", proteinType: "Seafood", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["salmon", "lemon", "dill", "olive oil", "garlic"] },
  { id: "r4", title: "Pasta Carbonara", minutes: 25, mealType: "Dinner", tags: [], tools: ["Stovetop"], sourceType: "My recipes", proteinType: "Beef", servingsRange: "3-4", hasNotes: true, modifiedByMe: false, ingredients: ["pasta", "bacon", "eggs", "parmesan", "black pepper"] },
  { id: "r5", title: "Greek Salad", minutes: 15, mealType: "Lunch", tags: ["vegetarian", "glutenFree"], tools: ["No-cook"], sourceType: "Personal", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: false, modifiedByMe: true, ingredients: ["cucumber", "tomato", "feta", "olives", "olive oil"] },
  { id: "r6", title: "Chicken Nuggets", minutes: 25, mealType: "Dinner", tags: ["kidFriendly"], tools: ["Air fryer"], sourceType: "My recipes", proteinType: "Chicken", servingsRange: "3-4", hasNotes: false, modifiedByMe: false, ingredients: ["chicken breast", "breadcrumbs", "eggs", "flour"] },
  { id: "r7", title: "Beef Tacos", minutes: 30, mealType: "Dinner", tags: ["kidFriendly"], tools: ["Stovetop"], sourceType: "Imported", proteinType: "Beef", servingsRange: "3-4", hasNotes: true, modifiedByMe: true, ingredients: ["ground beef", "taco shells", "lettuce", "tomato", "cheese", "sour cream"] },
  { id: "r8", title: "Overnight Oats", minutes: 5, mealType: "Breakfast", tags: ["vegetarian"], tools: ["No-cook"], sourceType: "Personal", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["oats", "milk", "yogurt", "honey", "berries"] },
  { id: "r9", title: "Grilled Cheese Sandwich", minutes: 10, mealType: "Lunch box", tags: ["vegetarian", "kidFriendly"], tools: ["Stovetop"], sourceType: "My recipes", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["bread", "cheese", "butter"] },
  { id: "r10", title: "Shrimp Scampi", minutes: 20, mealType: "Dinner", tags: ["glutenFree"], tools: ["Stovetop"], sourceType: "Trusted authors", proteinType: "Seafood", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["shrimp", "garlic", "butter", "white wine", "parsley", "lemon"] },
  { id: "r11", title: "Veggie Wrap", minutes: 10, mealType: "Lunch box", tags: ["vegetarian"], tools: ["No-cook"], sourceType: "Personal", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: true, modifiedByMe: false, ingredients: ["tortilla", "hummus", "spinach", "tomato", "cucumber"] },
  { id: "r12", title: "Roast Chicken", minutes: 60, mealType: "Dinner", tags: ["glutenFree", "kidFriendly"], tools: ["Oven"], sourceType: "My recipes", proteinType: "Chicken", servingsRange: "5+", hasNotes: true, modifiedByMe: true, ingredients: ["whole chicken", "lemon", "rosemary", "garlic", "potatoes"] },
  { id: "r13", title: "Mushroom Risotto", minutes: 35, mealType: "Dinner", tags: ["vegetarian"], tools: ["Stovetop"], sourceType: "My recipes", proteinType: "Plant-based", servingsRange: "3-4", hasNotes: false, modifiedByMe: false, ingredients: ["arborio rice", "mushrooms", "vegetable broth", "onion", "parmesan"] },
  { id: "r14", title: "Lentil Soup", minutes: 45, mealType: "Dinner", tags: ["vegetarian", "glutenFree"], tools: ["Stovetop"], sourceType: "Personal", proteinType: "Plant-based", servingsRange: "3-4", hasNotes: true, modifiedByMe: false, ingredients: ["lentils", "carrot", "celery", "onion", "vegetable broth", "cumin"] },
  { id: "r15", title: "Chicken Caesar Salad", minutes: 20, mealType: "Lunch", tags: ["kidFriendly"], tools: ["No-cook"], sourceType: "Imported", proteinType: "Chicken", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["romaine lettuce", "grilled chicken", "caesar dressing", "croutons", "parmesan"] },
  { id: "r16", title: "Beef Stew", minutes: 120, mealType: "Dinner", tags: ["glutenFree"], tools: ["Stovetop"], sourceType: "My recipes", proteinType: "Beef", servingsRange: "5+", hasNotes: true, modifiedByMe: true, ingredients: ["beef chuck", "potatoes", "carrots", "onion", "beef broth", "thyme"] },
  { id: "r17", title: "Fish Tacos", minutes: 25, mealType: "Dinner", tags: ["kidFriendly"], tools: ["Stovetop"], sourceType: "Trusted authors", proteinType: "Seafood", servingsRange: "3-4", hasNotes: false, modifiedByMe: false, ingredients: ["white fish", "corn tortillas", "cabbage slaw", "lime", "crema"] },
  { id: "r18", title: "Quinoa Bowl", minutes: 15, mealType: "Lunch box", tags: ["vegetarian", "glutenFree"], tools: ["No-cook"], sourceType: "Personal", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["quinoa", "chickpeas", "cucumber", "tomato", "lemon tahini dressing"] },
  { id: "r19", title: "Omelette", minutes: 10, mealType: "Breakfast", tags: ["vegetarian", "glutenFree"], tools: ["Stovetop"], sourceType: "My recipes", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: false, modifiedByMe: false, ingredients: ["eggs", "cheese", "spinach", "mushrooms"] },
  { id: "r20", title: "Avocado Toast", minutes: 5, mealType: "Breakfast", tags: ["vegetarian"], tools: ["No-cook"], sourceType: "Personal", proteinType: "Plant-based", servingsRange: "1-2", hasNotes: true, modifiedByMe: false, ingredients: ["bread", "avocado", "red pepper flakes", "lemon juice"] },
];

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

function categorizeIngredient(ingredient: string): string {
  const lowerIngredient = ingredient.toLowerCase();
  for (const [category, items] of Object.entries(ingredientCategories)) {
    if (items.some(item => lowerIngredient.includes(item.toLowerCase()) || item.toLowerCase().includes(lowerIngredient))) {
      return category;
    }
  }
  return "Other";
}

function loadState(): WeeklyMealsState | null {
  try {
    const saved = localStorage.getItem("weeklyMealsState");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return null;
}

export default function GroceryList() {
  const [, setLocation] = useLocation();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  
  const state = loadState();
  const planAssignments = state?.planAssignments || [];

  const groceryData = useMemo(() => {
    const usedRecipeIds = new Set(planAssignments.map(a => a.recipeId));
    const usedRecipes = sampleRecipes.filter(r => usedRecipeIds.has(r.id));
    
    const ingredientMap = new Map<string, { ingredient: string; recipes: string[] }>();
    
    usedRecipes.forEach(recipe => {
      recipe.ingredients.forEach(ingredient => {
        const key = ingredient.toLowerCase();
        if (ingredientMap.has(key)) {
          ingredientMap.get(key)!.recipes.push(recipe.title);
        } else {
          ingredientMap.set(key, { ingredient, recipes: [recipe.title] });
        }
      });
    });
    
    const categorized: Record<string, { ingredient: string; recipes: string[]; key: string }[]> = {};
    
    ingredientMap.forEach((data, key) => {
      const category = categorizeIngredient(data.ingredient);
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push({ ...data, key });
    });
    
    Object.values(categorized).forEach(items => {
      items.sort((a, b) => a.ingredient.localeCompare(b.ingredient));
    });
    
    return { categorized, usedRecipes, totalItems: ingredientMap.size };
  }, [planAssignments]);

  const toggleItem = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const categoryOrder = ["Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs", "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other"];

  if (groceryData.usedRecipes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b hairline px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
              <span className="text-xs font-medium text-foreground">TW</span>
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">Tablewise</span>
              <span className="text-xs text-muted-foreground ml-2">Grocery List</span>
            </div>
          </div>
          <button 
            onClick={() => setLocation("/meals")}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-plan"
          >
            ← Back to Weekly Plan
          </button>
        </header>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-muted-foreground mb-4">No meals planned yet</p>
            <button
              onClick={() => setLocation("/meals")}
              className="px-4 py-2 text-sm rounded-full bg-[#7A9E7E] text-white hover:bg-[#6B8E6F]"
              data-testid="button-go-to-plan"
            >
              Go to Weekly Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b hairline px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
            <span className="text-xs font-medium text-foreground">TW</span>
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">Tablewise</span>
            <span className="text-xs text-muted-foreground ml-2">Grocery List</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLocation("/meals")}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-plan"
          >
            ← Back to Weekly Plan
          </button>
        </div>
      </header>

      <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-foreground mb-2">Your Grocery List</h1>
          <p className="text-sm text-muted-foreground">
            {groceryData.totalItems} items from {groceryData.usedRecipes.length} recipes
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {groceryData.usedRecipes.map(recipe => (
              <span 
                key={recipe.id}
                className="px-2 py-1 text-xs bg-[#F0EFEC] rounded-full text-muted-foreground"
              >
                {recipe.title}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-muted-foreground">
            {checkedItems.size} of {groceryData.totalItems} items checked
          </span>
          {checkedItems.size > 0 && (
            <button
              onClick={() => setCheckedItems(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-uncheck-all"
            >
              Uncheck all
            </button>
          )}
        </div>

        <div className="space-y-8">
          {categoryOrder.map(category => {
            const items = groceryData.categorized[category];
            if (!items || items.length === 0) return null;
            
            return (
              <div key={category}>
                <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  {category}
                  <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
                </h2>
                <div className="space-y-2">
                  {items.map(item => (
                    <label
                      key={item.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border hairline cursor-pointer transition-colors ${
                        checkedItems.has(item.key) ? "bg-[#7A9E7E]/10 border-[#7A9E7E]" : "bg-background hover:bg-[#FAFAF8]"
                      }`}
                      data-testid={`grocery-item-${item.key}`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedItems.has(item.key)}
                        onChange={() => toggleItem(item.key)}
                        className="mt-0.5 w-4 h-4 accent-[#7A9E7E] rounded"
                      />
                      <div className="flex-1">
                        <span className={`text-sm ${checkedItems.has(item.key) ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.ingredient}
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.recipes.join(", ")}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
