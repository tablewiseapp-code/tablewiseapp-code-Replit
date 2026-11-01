import { useState, useMemo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { fetchRecipes } from "@/lib/storage";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { GroceryNavigation } from "./grocery-navigation";
import "./grocery-list.css";

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

function isProteinIngredient(ingredient: string): boolean {
  return /\b(chicken|beef|pork|lamb|turkey|duck|salmon|trout|tuna|cod|tilapia|fish|shrimp|prawns?|crab|lentils?|chickpeas?|beans?|tofu|tempeh|seitan|eggs?)\b/i.test(ingredient);
}

function conciseProteinName(ingredient: string): string {
  const name = ingredient.match(/\b(chicken|beef|pork|lamb|turkey|duck|salmon|trout|tuna|cod|tilapia|fish|shrimp|prawns?|crab|lentils?|chickpeas?|beans?|tofu|tempeh|seitan|eggs?)\b/i)?.[0];
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : ingredient;
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

type CategoryPointerDrag = {
  pointerId: number;
  category: string;
  startX: number;
  startY: number;
  active: boolean;
};

export default function GroceryListScreen() {
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [categoryOrder, setCategoryOrder] = useState([
    "Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs",
    "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other",
  ]);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ category: string; edge: "before" | "after" } | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const categoryPointerDrag = useRef<CategoryPointerDrag | null>(null);
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
    const ingredientMap = new Map<string, { ingredient: string; recipes: string[]; proteinIngredients: string[] }>();
    usedRecipes.forEach(recipe => {
      const proteinIngredients = recipe.ingredients.filter(isProteinIngredient);
      recipe.ingredients.forEach(ingredient => {
        const key = ingredient.toLowerCase();
        if (ingredientMap.has(key)) {
          const item = ingredientMap.get(key)!;
          item.recipes.push(recipe.title);
          for (const protein of proteinIngredients) {
            if (!item.proteinIngredients.includes(protein)) item.proteinIngredients.push(protein);
          }
        } else {
          ingredientMap.set(key, { ingredient, recipes: [recipe.title], proteinIngredients: [...proteinIngredients] });
        }
      });
    });
    const categorized: Record<string, { ingredient: string; recipes: string[]; proteinIngredients: string[]; key: string }[]> = {};
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

  const reorderCategory = (category: string, targetCategory: string, afterTarget = false) => {
    const fromIndex = categoryOrder.indexOf(category);
    const targetIndex = categoryOrder.indexOf(targetCategory);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;

    const insertionIndex = targetIndex + (afterTarget ? 1 : 0);
    const nextOrder = [...categoryOrder];
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex, 0, category);
    setCategoryOrder(nextOrder);
    setDraggedCategory(null);
    setDropTarget(null);
    setReorderAnnouncement(`${categoryTranslations[category] || category} moved to position ${nextOrder.indexOf(category) + 1} of ${nextOrder.length}.`);
  };

  const handleCategoryPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, category: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    categoryPointerDrag.current = {
      pointerId: event.pointerId,
      category,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };

  const handleCategoryPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = categoryPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return;

    if (!drag.active) {
      drag.active = true;
      setDraggedCategory(drag.category);
    }

    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-grocery-category]");
    const targetCategory = targetElement?.dataset.groceryCategory;
    if (!targetElement || !targetCategory || targetCategory === drag.category) {
      setDropTarget(null);
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const deltaX = event.clientX - (rect.left + rect.width / 2);
    const deltaY = event.clientY - (rect.top + rect.height / 2);
    const horizontal = Math.abs(deltaX / rect.width) > Math.abs(deltaY / rect.height);
    setDropTarget({
      category: targetCategory,
      edge: horizontal ? (deltaX > 0 ? "after" : "before") : (deltaY > 0 ? "after" : "before"),
    });
  };

  const finishCategoryPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = categoryPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    categoryPointerDrag.current = null;
    if (drag.active && dropTarget) {
      reorderCategory(drag.category, dropTarget.category, dropTarget.edge === "after");
    } else {
      setDraggedCategory(null);
      setDropTarget(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelCategoryPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = categoryPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    categoryPointerDrag.current = null;
    setDraggedCategory(null);
    setDropTarget(null);
  };

  const handleCategoryReorderKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, category: string) => {
    const delta = event.key === "ArrowUp" || event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : 0;
    if (!delta) return;
    event.preventDefault();
    const index = categoryOrder.indexOf(category);
    const targetCategory = categoryOrder[index + delta];
    if (targetCategory) reorderCategory(category, targetCategory, delta > 0);
  };

  if (isLoadingRecipes) {
    return (
      <main className="grocery-page" aria-busy="true">
        <div className="grocery-shell"><GroceryNavigation /></div>
        <div className="grocery-shell">
          <div className="grocery-skeleton grocery-skeleton-title" />
          <div className="grocery-skeleton grocery-skeleton-copy" />
          <div className="grocery-skeleton-list">
            {[0, 1, 2, 3, 4, 5].map(item => <div className="grocery-skeleton grocery-skeleton-row" key={item} />)}
          </div>
          <span className="grocery-sr-only">{t("recipes.loading")}</span>
        </div>
      </main>
    );
  }

  if (recipesError) {
    return (
      <main className="grocery-page">
        <div className="grocery-shell"><GroceryNavigation /></div>
        <section className="grocery-shell grocery-state" role="alert">
          <span className="grocery-eyebrow">TABLEWISE · GROCERY LIST</span>
          <h1>We couldn’t load your list.</h1>
          <p>{recipesError}</p>
          <button className="grocery-primary" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </main>
    );
  }

  if (groceryData.usedRecipes.length === 0) {
    return (
      <main className="grocery-page">
        <div className="grocery-shell"><GroceryNavigation /></div>
        <section className="grocery-shell grocery-state">
          <span className="grocery-eyebrow">TABLEWISE · GROCERY LIST</span>
          <h1>A little room for this week.</h1>
          <p>{t("grocery.noMeals")}</p>
          <button className="grocery-primary" onClick={() => setLocation("/meals")}>{t("grocery.goToPlan")}</button>
        </section>
      </main>
    );
  }

  const completed = Math.min(checkedItems.size, groceryData.totalItems);
  const progress = groceryData.totalItems ? (completed / groceryData.totalItems) * 100 : 0;

  return (
    <main className="grocery-page">
      <div className="grocery-shell">
        <GroceryNavigation />

        <header className="grocery-heading">
          <div className="grocery-title-row">
            <div>
              <span className="grocery-eyebrow">YOUR WEEK, GATHERED</span>
              <h1>{t("grocery.groceryList")}</h1>
            </div>
            <div className="grocery-count" aria-live="polite">
              <strong>{completed}<span> / {groceryData.totalItems}</span></strong>
              <span className="grocery-count-label">items checked</span>
            </div>
          </div>
          <div className="grocery-progress" role="progressbar" aria-label="Shopping progress" aria-valuemin={0} aria-valuemax={groceryData.totalItems} aria-valuenow={completed}>
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <div className="grocery-heading-foot">
          <p>{t("grocery.items", {total:groceryData.totalItems, recipes:groceryData.usedRecipes.length})} <span aria-hidden="true">·</span> Drag category handles to rearrange</p>
            {checkedItems.size > 0 && (
              <button className="grocery-reset" onClick={() => setCheckedItems(new Set())} data-testid="button-uncheck-all">
                {t("grocery.uncheckAll")}
              </button>
            )}
          </div>
        </header>

        <div className="grocery-list" aria-label="Shopping list by category">
          {categoryOrder.map(category => {
            const items = groceryData.categorized[category];
            if (!items?.length) return null;
            const dropEdge = dropTarget?.category === category ? dropTarget.edge : null;
            return (
              <section
                className={`grocery-category${draggedCategory === category ? " is-dragging" : ""}${dropEdge ? ` is-drop-${dropEdge}` : ""}`}
                key={category}
                data-grocery-category={category}
                aria-labelledby={`grocery-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
              >
                <header className="grocery-category-head">
                  <button
                    type="button"
                    className="grocery-category-toggle"
                    aria-expanded={!collapsedCategories.has(category)}
                    aria-controls={`grocery-items-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
                    onClick={() => setCollapsedCategories(previous => {
                      const next = new Set(previous);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })}
                  >
                    <span className="grocery-category-title">
                      <h2 id={`grocery-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>{categoryTranslations[category] || category}</h2>
                      <span className="grocery-category-count">{items.length}</span>
                    </span>
                    <svg
                      className={`grocery-category-chevron${collapsedCategories.has(category) ? " is-collapsed" : ""}`}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="grocery-drag-handle"
                    aria-label={`Reorder ${categoryTranslations[category] || category}; use arrow keys to move`}
                    aria-describedby="grocery-reorder-help"
                    onKeyDown={(event) => handleCategoryReorderKeyDown(event, category)}
                    onPointerDown={(event) => handleCategoryPointerDown(event, category)}
                    onPointerMove={handleCategoryPointerMove}
                    onPointerUp={finishCategoryPointerDrag}
                    onPointerCancel={cancelCategoryPointerDrag}
                    onLostPointerCapture={cancelCategoryPointerDrag}
                    data-testid={`category-drag-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="5" cy="4" r="1.1" />
                      <circle cx="11" cy="4" r="1.1" />
                      <circle cx="5" cy="8" r="1.1" />
                      <circle cx="11" cy="8" r="1.1" />
                      <circle cx="5" cy="12" r="1.1" />
                      <circle cx="11" cy="12" r="1.1" />
                    </svg>
                  </button>
                </header>
                <ul
                  id={`grocery-items-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
                  hidden={collapsedCategories.has(category)}
                >
                  {items.map(item => {
                    const checked = checkedItems.has(item.key);
                    return (
                      <li key={item.key} className={`grocery-item${checked ? " is-checked" : ""}`} data-testid={`grocery-item-${item.key}`}>
                        <label className="grocery-item-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.key)}
                            aria-label={`Mark ${item.ingredient} ${checked ? "not collected" : "collected"}`}
                          />
                          <span className="grocery-checkmark" aria-hidden="true">
                            <svg viewBox="0 0 16 16"><path d="m3.5 8.2 3 3 6-6.3" /></svg>
                          </span>
                          <span className="grocery-ingredient">{item.ingredient}</span>
                        </label>
                        <details className="grocery-recipe-context">
                          <summary
                            aria-label={`${item.proteinIngredients.length ? item.proteinIngredients.map(conciseProteinName).join(", ") : "Ingredients not specified"}; open for ingredient details and recipe names`}
                            title={item.proteinIngredients.join(", ") || "Ingredients not specified"}
                          >
                            <span className="grocery-protein-names">
                              {item.proteinIngredients.length
                                ? item.proteinIngredients.map(conciseProteinName).join(", ")
                                : "Not specified"}
                            </span>
                          </summary>
                          <div className="grocery-recipe-popover">
                            <strong>Key ingredients in {item.recipes.length === 1 ? "this recipe" : "these recipes"}</strong>
                            {item.proteinIngredients.length ? (
                              <ul>
                                {item.proteinIngredients.map(protein => <li key={protein}>{protein}</li>)}
                              </ul>
                            ) : <p>Not specified in the saved ingredients.</p>}
                            <span>Used in: {item.recipes.join(" · ")}</span>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <span className="grocery-sr-only" id="grocery-reorder-help">Drag this handle to move the category. Keyboard: use the arrow keys to move it one position.</span>
        <span className="grocery-sr-only" aria-live="polite" aria-atomic="true">{reorderAnnouncement}</span>
        <footer className="grocery-footer">A calmer way to get dinner on the table.</footer>
      </div>
    </main>
  );
}
