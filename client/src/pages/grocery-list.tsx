import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { fetchRecipes } from "@/lib/storage";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";

type Recipe = PlannerRecipe;

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
  const { t } = useI18n();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  
  const state = loadState();
  const planAssignments = state?.planAssignments || [];

  useEffect(() => {
    let active = true;
    setIsLoadingRecipes(true);

    fetchRecipes()
      .then((data) => {
        if (!active) return;
        setRecipes(toPlannerRecipes(data));
        setRecipesError(null);
      })
      .catch((error) => {
        console.error("Failed to load recipes for grocery list:", error);
        if (!active) return;
        setRecipes([]);
        setRecipesError(error instanceof Error ? error.message : "Failed to load recipes");
      })
      .finally(() => {
        if (active) setIsLoadingRecipes(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const groceryData = useMemo(() => {
    const usedRecipeIds = new Set(planAssignments.map(a => a.recipeId));
    const usedRecipes = recipes.filter(r => usedRecipeIds.has(r.id));
    
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
  }, [planAssignments, recipes]);

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

  const categoryTranslations: Record<string, string> = {
    "Produce": t("grocery.produce"),
    "Meat & Poultry": t("grocery.meatPoultry"),
    "Seafood": t("grocery.seafood"),
    "Dairy & Eggs": t("grocery.dairyEggs"),
    "Grains & Pasta": t("grocery.grainsPasta"),
    "Canned & Jarred": t("grocery.cannedJarred"),
    "Spices & Seasonings": t("grocery.spicesSeasonings"),
    "Other": t("grocery.other"),
  };

  const headerMenu = (
    <button
      onClick={() => setLocation("/meals")}
      className="w-full px-3 py-2.5 min-h-11 text-left text-sm rounded-lg border hairline text-muted-foreground hover:text-foreground"
      data-testid="button-back-to-plan-mobile"
    >
      {t("grocery.backToPlan")}
    </button>
  );

  if (isLoadingRecipes) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="Tablewise" subtitle={t("grocery.groceryList")} mobileMenuTitle={t("grocery.groceryList")} mobileMenuContent={headerMenu} />
        <PageContainer size="md" className="flex-1 py-10">
          <p className="text-sm text-muted-foreground">{t("recipes.loading") || "Loading recipes..."}</p>
        </PageContainer>
      </div>
    );
  }

  if (recipesError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="Tablewise" subtitle={t("grocery.groceryList")} mobileMenuTitle={t("grocery.groceryList")} mobileMenuContent={headerMenu} />
        <PageContainer size="md" className="flex-1 py-10">
          <div className="rounded-xl border hairline p-5 bg-[#FAFAF8] max-w-xl">
            <p className="text-sm text-foreground mb-3">Failed to load recipes.</p>
            <p className="text-xs text-muted-foreground mb-4">{recipesError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 min-h-11 rounded-full bg-foreground text-background text-sm"
            >
              Retry
            </button>
          </div>
        </PageContainer>
      </div>
    );
  }

  if (groceryData.usedRecipes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader
          title="Tablewise"
          subtitle={t("grocery.groceryList")}
          desktopActions={
            <button
              onClick={() => setLocation("/meals")}
              className="text-sm min-h-11 px-2 text-muted-foreground hover:text-foreground"
              data-testid="button-back-to-plan"
            >
              {t("grocery.backToPlan")}
            </button>
          }
          mobileMenuTitle={t("grocery.groceryList")}
          mobileMenuContent={headerMenu}
        />

        <div className="flex-1 flex items-center justify-center">
          <PageContainer size="md" className="text-center py-10">
            <p className="text-lg text-muted-foreground mb-4">{t("grocery.noMeals")}</p>
            <button
              onClick={() => setLocation("/meals")}
              className="px-4 py-2 min-h-11 text-sm rounded-full bg-[#7A9E7E] text-white hover:bg-[#6B8E6F]"
              data-testid="button-go-to-plan"
            >
              {t("grocery.goToPlan")}
            </button>
          </PageContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader
        title="Tablewise"
        subtitle={t("grocery.groceryList")}
        desktopActions={
          <button
            onClick={() => setLocation("/meals")}
            className="text-sm min-h-11 px-2 text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-plan"
          >
            {t("grocery.backToPlan")}
          </button>
        }
        mobileMenuTitle={t("grocery.groceryList")}
        mobileMenuContent={headerMenu}
      />

      <PageContainer size="lg" className="flex-1 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-medium text-foreground mb-2">{t("grocery.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("grocery.items", { total: groceryData.totalItems, recipes: groceryData.usedRecipes.length })}
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

        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <span className="text-sm text-muted-foreground">
            {t("grocery.checked", { checked: checkedItems.size, total: groceryData.totalItems })}
          </span>
          {checkedItems.size > 0 && (
            <button
              onClick={() => setCheckedItems(new Set())}
              className="text-xs min-h-11 px-2 text-muted-foreground hover:text-foreground"
              data-testid="button-uncheck-all"
            >
              {t("grocery.uncheckAll")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {categoryOrder.map(category => {
            const items = groceryData.categorized[category];
            if (!items || items.length === 0) return null;
            
            return (
              <div key={category}>
                <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  {categoryTranslations[category] || category}
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
      </PageContainer>
    </div>
  );
}
