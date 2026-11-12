import { useState, useMemo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { fetchRecipes } from "@/lib/storage";
import { categoryProgress, countChecked, isCategoryCollapsed, isListComplete, readGroceryPrefs, saveGroceryPrefs, toggleCategory, toggleItem as toggleChecked, type Expansion } from "@/lib/grocery-progress";
import { plannedServingsFactor } from "@/lib/meal-plan";
import { baseServings, scaleIngredient } from "@/lib/ingredient-scale";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { GroceryNavigation } from "./grocery-navigation";
import { loadSettings } from "@/lib/basic-settings";
import { settingsText } from "@/lib/settings-copy";
import { mentionsTerm } from "@shared/food-rules";
import "./grocery-list.css";

type Recipe = PlannerRecipe;

interface PlanAssignment {
  recipeId: string;
  mealType: "Breakfast" | "Lunch" | "Dinner";
  startDay: number;
  spanDays: number;
  servings?: number;
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

type CategoryPointerDrag = {
  pointerId: number;
  category: string;
  startX: number;
  startY: number;
  active: boolean;
};

export default function GroceryListScreen() {
  const [, setLocation] = useLocation();
  const { t, lang } = useI18n();
  const pantry = useMemo(() => loadSettings().shopping.pantry, []); // My Basic Settings: "Ingredients I usually have"
  const [initialPrefs] = useState(readGroceryPrefs);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(initialPrefs.checked);
  const [expansion, setExpansion] = useState<Expansion>(initialPrefs.expansion);
  const [completionNote, setCompletionNote] = useState("");
  const [categoryOrder, setCategoryOrder] = useState([
    "Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs",
    "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other",
  ]);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ category: string; edge: "before" | "after" } | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
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
    const usedRecipeIds = new Set([...(state?.selectedIds ?? []), ...planAssignments.map(a => a.recipeId)]); // shortlisted dishes count even before they get a slot
    const usedRecipes = recipes.filter(r => usedRecipeIds.has(r.id));
    const ingredientMap = new Map<string, { ingredient: string; recipes: string[] }>();
    usedRecipes.forEach(recipe => {
      // Planned servings (chosen in the recipe view) scale quantities; unparseable lines stay as written.
      const factor = plannedServingsFactor(planAssignments, recipe.id, baseServings(recipe.servings));
      const scaledIngredients = recipe.ingredients.map(text => scaleIngredient(text, factor));
      scaledIngredients.forEach(ingredient => {
        const key = ingredient.toLowerCase();
        if (ingredientMap.has(key)) {
          const item = ingredientMap.get(key)!;
          if (!item.recipes.includes(recipe.title)) item.recipes.push(recipe.title);
        } else {
          ingredientMap.set(key, { ingredient, recipes: [recipe.title] });
        }
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

  const allKeys = useMemo(() => Object.values(groceryData.categorized).flatMap(items => items.map(item => item.key)), [groceryData]);
  // Persist only after the real list is known, and only items still on it.
  useEffect(() => {
    if (isLoadingRecipes || recipesError || allKeys.length === 0) return;
    const present = new Set(allKeys);
    saveGroceryPrefs({ checked: new Set([...checkedItems].filter(key => present.has(key))), expansion });
  }, [isLoadingRecipes, recipesError, allKeys, checkedItems, expansion]);

  const toggleItem = (key: string, category: string) => {
    const keys = (groceryData.categorized[category] ?? []).map(item => item.key);
    const wasComplete = categoryProgress(keys, checkedItems).complete;
    const next = toggleChecked(checkedItems, expansion, key, category);
    const nowComplete = categoryProgress(keys, next.checked).complete;
    setCheckedItems(next.checked);
    setExpansion(next.expansion);
    if (nowComplete && !wasComplete) {
      setCompletionNote(t("grocery.categoryComplete", { category: categoryTranslations[category] || category }));
      // The ticked row is about to collapse away: keep keyboard focus on the category header.
      setTimeout(() => document.getElementById(`grocery-toggle-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`)?.focus(), 0);
    } else if (!nowComplete) setCompletionNote("");
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

  const completed = countChecked(allKeys, checkedItems);
  const listComplete = isListComplete(allKeys, checkedItems);
  const progress = groceryData.totalItems ? (completed / groceryData.totalItems) * 100 : 0;

  return (
    <main className="grocery-page">
      <div className="grocery-shell">
        <GroceryNavigation />

        <header className="grocery-heading">
          <div className="grocery-title-row">
            <div>
              <h1>{t("grocery.groceryList")}</h1>
              <p className="grocery-subtitle">{t("grocery.items", {total:groceryData.totalItems, recipes:groceryData.usedRecipes.length})}</p>
            </div>
            <div className="grocery-count" aria-live="polite">
              <strong>{completed} / {groceryData.totalItems}</strong> checked
              {completed > 0 && (
                <button className="grocery-reset" onClick={() => { setCheckedItems(new Set()); setExpansion({}); setCompletionNote(""); }} data-testid="button-uncheck-all">
                  {t("grocery.uncheckAll")}
                </button>
              )}
            </div>
          </div>
          <div className="grocery-progress" role="progressbar" aria-label="Shopping progress" aria-valuemin={0} aria-valuemax={groceryData.totalItems} aria-valuenow={completed}>
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </header>

        {listComplete && (
          <div className="grocery-success" role="status" data-testid="grocery-shopping-complete">
            <strong>{t("grocery.shoppingComplete")}</strong>
            <p>{t("grocery.shoppingCompleteBody")}</p>
          </div>
        )}

        <div className="grocery-list" aria-label="Shopping list by category">
          {categoryOrder.map(category => {
            const items = groceryData.categorized[category];
            if (!items?.length) return null;
            const progressInfo = categoryProgress(items.map(item => item.key), checkedItems);
            const collapsed = isCategoryCollapsed(progressInfo.complete, expansion[category]);
            const slug = category.replace(/[^a-z]+/gi, "-").toLowerCase();
            const dropEdge = dropTarget?.category === category ? dropTarget.edge : null;
            return (
              <section
                className={`grocery-category${progressInfo.complete ? " is-complete" : ""}${draggedCategory === category ? " is-dragging" : ""}${dropEdge ? ` is-drop-${dropEdge}` : ""}`}
                key={category}
                data-grocery-category={category}
                data-complete={progressInfo.complete}
                data-collapsed={collapsed}
                aria-labelledby={`grocery-${category.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
              >
                <header className="grocery-category-head">
                  <button
                    type="button"
                    id={`grocery-toggle-${slug}`}
                    className="grocery-category-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={`grocery-items-${slug}`}
                    data-testid={`category-toggle-${slug}`}
                    onClick={() => setExpansion(previous => toggleCategory(previous, category, collapsed))}
                  >
                    <span className="grocery-category-title">
                      {progressInfo.complete && (
                        <svg className="grocery-complete-icon" viewBox="0 0 20 20" aria-hidden="true" data-testid={`category-complete-icon-${slug}`}>
                          <circle cx="10" cy="10" r="10" /><path d="m5.8 10.4 2.6 2.6 5.2-5.6" />
                        </svg>
                      )}
                      <span className="grocery-category-text">
                        <h2 id={`grocery-${slug}`}>{categoryTranslations[category] || category}</h2>
                        {progressInfo.complete && <span className="grocery-category-sub" data-testid={`category-sub-${slug}`}>{t("grocery.allCollected")}</span>}
                      </span>
                      {!progressInfo.complete && <span className="grocery-category-count">{items.length}</span>}
                    </span>
                    {progressInfo.complete && <span className="grocery-complete-badge" data-testid={`category-complete-${slug}`}>{t("grocery.complete")}</span>}
                    <svg
                      className={`grocery-category-chevron${collapsed ? " is-collapsed" : ""}`}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="grocery-drag-handle"
                    aria-label={`Reorder ${categoryTranslations[category] || category}; use arrow keys to move`} title="Drag to reorder"
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
                  id={`grocery-items-${slug}`}
                  hidden={collapsed}
                >
                  {items.map(item => {
                    const checked = checkedItems.has(item.key);
                    return (
                      <li key={item.key} className={`grocery-item${checked ? " is-checked" : ""}`} data-testid={`grocery-item-${item.key}`}>
                        <label className="grocery-item-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.key, category)}
                            aria-label={`Mark ${item.ingredient} ${checked ? "not collected" : "collected"}`}
                          />
                          <span className="grocery-checkmark" aria-hidden="true">
                            <svg viewBox="0 0 16 16"><path d="m3.5 8.2 3 3 6-6.3" /></svg>
                          </span>
                          <span className="grocery-ingredient">{item.ingredient}</span>
                          {pantry.some(term => mentionsTerm(term, [item.ingredient])) &&
                            <span className="ms-2 rounded bg-[#42624e]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#42624e]" data-testid="grocery-pantry">{settingsText(lang, "pantryBadge")}</span>}
                        </label>
                        {item.recipes.length > 0 && (
                          <span className="grocery-recipes" data-testid="grocery-item-recipes">
                            <span className="grocery-sr-only">Used in: </span>{item.recipes.join(" · ")}
                          </span>
                        )}
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
        <span className="grocery-sr-only" role="status" aria-live="polite" aria-atomic="true">{completionNote}</span>
        
      </div>
    </main>
  );
}
