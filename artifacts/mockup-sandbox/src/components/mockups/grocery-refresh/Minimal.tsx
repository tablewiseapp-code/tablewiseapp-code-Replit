import { useState, useMemo, useEffect } from "react";
import { useLocation, useI18n, fetchRecipes, toPlannerRecipes, examplePlan, type PlannerRecipe } from "./_fixtures";
import "./_group.css";
import "./_minimal.css";

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
  return new URLSearchParams(window.location.search).get("state") === "empty" ? null : examplePlan;
}

export function Minimal() {
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
        if (!active) return;
        setRecipes([]);
        setRecipesError(error instanceof Error ? error.message : "Failed to load recipes");
      })
      .finally(() => {
        if (active) setIsLoadingRecipes(false);
      });
    return () => { active = false; };
  }, []);

  const groceryData = useMemo(() => {
    const usedRecipeIds = new Set(planAssignments.map(a => a.recipeId));
    const usedRecipes = recipes.filter(r => usedRecipeIds.has(r.id));
    const ingredientMap = new Map<string, { ingredient: string; recipes: string[] }>();
    usedRecipes.forEach(recipe => {
      recipe.ingredients.forEach(ingredient => {
        const key = ingredient.toLowerCase();
        if (ingredientMap.has(key)) ingredientMap.get(key)!.recipes.push(recipe.title);
        else ingredientMap.set(key, { ingredient, recipes: [recipe.title] });
      });
    });
    const categorized: Record<string, { ingredient: string; recipes: string[]; key: string }[]> = {};
    ingredientMap.forEach((data, key) => {
      const category = categorizeIngredient(data.ingredient);
      if (!categorized[category]) categorized[category] = [];
      categorized[category].push({ ...data, key });
    });
    Object.values(categorized).forEach(items => items.sort((a, b) => a.ingredient.localeCompare(b.ingredient)));
    return { categorized, usedRecipes, totalItems: ingredientMap.size };
  }, [planAssignments, recipes]);

  const toggleItem = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

  if (isLoadingRecipes) {
    return (
      <main className="minimal-page" aria-busy="true">
        <div className="minimal-shell">
          <div className="minimal-skeleton minimal-skeleton-title" />
          <div className="minimal-skeleton minimal-skeleton-copy" />
          <div className="minimal-skeleton-list">
            {[0, 1, 2, 3, 4, 5].map(item => <div className="minimal-skeleton minimal-skeleton-row" key={item} />)}
          </div>
          <span className="minimal-sr-only">Loading grocery list…</span>
        </div>
      </main>
    );
  }

  if (recipesError) {
    return (
      <main className="minimal-page">
        <section className="minimal-shell minimal-state" role="alert">
          <span className="minimal-eyebrow">TABLEWISE · GROCERY LIST</span>
          <h1>We couldn’t load your list.</h1>
          <p>{recipesError}</p>
          <button className="minimal-primary" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </main>
    );
  }

  if (groceryData.usedRecipes.length === 0) {
    return (
      <main className="minimal-page">
        <section className="minimal-shell minimal-state">
          <span className="minimal-eyebrow">TABLEWISE · GROCERY LIST</span>
          <h1>A little room for this week.</h1>
          <p>{t("grocery.noMeals")}</p>
          <button className="minimal-primary" onClick={() => setLocation("/meals")}>{t("grocery.goToPlan")}</button>
        </section>
      </main>
    );
  }

  const completed = Math.min(checkedItems.size, groceryData.totalItems);
  const progress = groceryData.totalItems ? (completed / groceryData.totalItems) * 100 : 0;

  return (
    <main className="minimal-page">
      <div className="minimal-shell">
        <nav className="minimal-topline" aria-label="Grocery list navigation">
          <span className="minimal-wordmark">tablewise</span>
          <button className="minimal-back" onClick={() => setLocation("/meals")} data-testid="button-back-to-plan">
            <span aria-hidden="true">‹</span> Weekly plan
          </button>
        </nav>

        <header className="minimal-heading">
          <div className="minimal-title-row">
            <div>
              <span className="minimal-eyebrow">YOUR WEEK, GATHERED</span>
              <h1>Grocery list</h1>
            </div>
            <div className="minimal-count" aria-live="polite">
              <strong>{completed}<span> / {groceryData.totalItems}</span></strong>
              <span className="minimal-count-label">items checked</span>
            </div>
          </div>
          <div className="minimal-progress" role="progressbar" aria-label="Shopping progress" aria-valuemin={0} aria-valuemax={groceryData.totalItems} aria-valuenow={completed}>
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <div className="minimal-heading-foot">
            <p>{groceryData.totalItems} items <span aria-hidden="true">·</span> {groceryData.usedRecipes.length} dinners</p>
            {checkedItems.size > 0 && (
              <button className="minimal-reset" onClick={() => setCheckedItems(new Set())} data-testid="button-uncheck-all">
                Uncheck all
              </button>
            )}
          </div>
          <p className="minimal-preview-note">Design preview · sample meals, not your saved weekly plan</p>
        </header>

        <div className="minimal-list" aria-label="Shopping list by category">
          {categoryOrder.map(category => {
            const items = groceryData.categorized[category];
            if (!items?.length) return null;
            return (
              <section className="minimal-category" key={category} aria-labelledby={`minimal-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
                <header className="minimal-category-head">
                  <h2 id={`minimal-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>{categoryTranslations[category] || category}</h2>
                  <span>{items.length}</span>
                </header>
                <ul>
                  {items.map(item => {
                    const checked = checkedItems.has(item.key);
                    return (
                      <li key={item.key} className={`minimal-item${checked ? " is-checked" : ""}`} data-testid={`grocery-item-${item.key}`}>
                        <label className="minimal-item-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.key)}
                            aria-label={`Mark ${item.ingredient} ${checked ? "not collected" : "collected"}`}
                          />
                          <span className="minimal-checkmark" aria-hidden="true">
                            <svg viewBox="0 0 16 16"><path d="m3.5 8.2 3 3 6-6.3" /></svg>
                          </span>
                          <span className="minimal-ingredient">{item.ingredient}</span>
                        </label>
                        <details className="minimal-recipe-context">
                          <summary>{item.recipes.length === 1 ? "1 recipe" : `${item.recipes.length} recipes`}</summary>
                          <div className="minimal-recipe-popover">{item.recipes.join(" · ")}</div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <footer className="minimal-footer">A calmer way to get dinner on the table.</footer>
      </div>
    </main>
  );
}
