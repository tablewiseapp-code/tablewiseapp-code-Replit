import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { StarRating } from "@/components/ui/star-rating";
import { getRecipeUserMeta, type RecipeUserMeta } from "@/hooks/use-recipe-user-meta";
import { useI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";
import { Button } from "@/components/ui/button";
import { createRecipe, fetchRecipes } from "@/lib/storage";
import { toPlannerRecipe, toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { matchesPlannerFilters } from "@/lib/planner-filters";
import { GenerateRecipe } from "@/components/generate-recipe";
import { isGeneratedRecipe, mealsGenerationBody, reportGenerationEvent, type FilterViolation, type NewRecipe } from "@/lib/recipe-generation";
import { RecipeIngredients } from "@/components/recipe-ingredients";
import { NutritionDetailsToggle } from "@/components/recipe-display";
import { RecipePriceSummary } from "@/components/recipe-price";
import { RecipeCreditLine } from "@/components/recipe-credit";
import { MealRecipeFacts, RecipeTimeProvider, RecipeTimeToggle, useRecipeTime } from "@/components/recipe-time-display";
import { recipeStageMinutes } from "@/lib/recipe-time";
import { useMvpCopy } from "@/lib/mvp-copy";
import { PlannerBoard } from "@/components/planner-board";
import { usePlannerCopy } from "@/lib/planner-copy";
import { plannedSlotCount, totalSlots, writePlan, type PlanState } from "@/lib/meal-plan";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Recipe = PlannerRecipe;

interface Filters {
  maxMinutes: number | null;
  dietary: string[];
  mealType: string[];
  cookingMethod: string[];
  source: string[];
  proteinType: string[];
  withNotes: boolean;
  modifiedByMe: boolean;
  myPicks: boolean;
  minRating: number | null;
  servings: string | null;
  mustInclude: string[];
  mustExclude: string[];
}

interface PlanAssignment {
  recipeId: string;
  mealType: "Breakfast" | "Lunch" | "Dinner";
  startDay: number;
  spanDays: number;
  servings?: number; // chosen in the recipe view; scales the grocery list
}

interface WeeklyMealsState {
  filters: Filters;
  selectedIds: string[];
  expandedSections: string[];
  showMoreFilters: boolean;
  planAssignments: PlanAssignment[];
}

const defaultFilters: Filters = {
  maxMinutes: null,
  dietary: [],
  mealType: [],
  cookingMethod: [],
  source: [],
  proteinType: [],
  withNotes: false,
  modifiedByMe: false,
  myPicks: false,
  minRating: null,
  servings: null,
  mustInclude: [],
  mustExclude: [],
};

const defaultState: WeeklyMealsState = {
  filters: defaultFilters,
  selectedIds: [],
  expandedSections: ["time", "dietary"],
  showMoreFilters: false,
  planAssignments: [],
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Recipe tags are stored as English tokens in seed data; translate for display.
const TAG_LABELS: Record<string, Record<string, string>> = {
  ru: { Breakfast: "Завтрак", Lunch: "Обед", Dinner: "Ужин", Chicken: "Курица", Fish: "Рыба", Beef: "Говядина", Pasta: "Паста", Vegetarian: "Вегетарианское", Vegan: "Веганское", "Source-verified": "Источник проверен", "Synthetic test data": "Тестовые данные", "Unverified collection link": "Ссылка на коллекцию не проверена", "Development estimates": "Тестовые оценки" },
  he: { Breakfast: "ארוחת בוקר", Lunch: "ארוחת צהריים", Dinner: "ארוחת ערב", Chicken: "עוף", Fish: "דגים", Beef: "בקר", Pasta: "פסטה", Vegetarian: "צמחוני", Vegan: "טבעוני", "Source-verified": "מקור מאומת", "Synthetic test data": "נתוני בדיקה", "Unverified collection link": "קישור אוסף לא מאומת", "Development estimates": "הערכות לפיתוח" },
};
const tagLabel = (lang: string, tag: string) => TAG_LABELS[lang]?.[tag] ?? tag;

const MEALS: ("Breakfast" | "Lunch" | "Dinner")[] = ["Breakfast", "Lunch", "Dinner"];

function loadState(): WeeklyMealsState {
  try {
    const saved = localStorage.getItem("weeklyMealsState");
    if (saved) {
      return { ...defaultState, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return defaultState;
}

function saveState(state: WeeklyMealsState) {
  try {
    localStorage.setItem("weeklyMealsState", JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

function getMonogram(title: string): string {
  const words = title.split(" ").filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return title.substring(0, 2).toUpperCase();
}

export default function WeeklyMeals() {
  return <RecipeTimeProvider><WeeklyMealsContent /></RecipeTimeProvider>;
}

function WeeklyMealsContent() {
  const [, setLocation] = useLocation();
  const { t, lang } = useI18n();
  const { t: timeCopy } = useMvpCopy();
  const { mode: timeMode } = useRecipeTime();
  const [state, setState] = useState<WeeklyMealsState>(loadState);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const [weekLocked, setWeekLocked] = useLocalStorageState<boolean>("week_locked_v1", false);
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [arrangingRecipe, setArrangingRecipe] = useState<string | null>(null);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [maxSelectionsHit, setMaxSelectionsHit] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const planCopy = usePlannerCopy();
  const { toast } = useToast();

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
        console.error("Failed to load recipes for weekly meals:", error);
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

  useEffect(() => {
    if (isLoadingRecipes) return;
    const availableIds = new Set(recipes.map((recipe) => recipe.id));

    setState((prev) => {
      const selectedIds = prev.selectedIds.filter((id) => availableIds.has(id));
      const planAssignments = prev.planAssignments.filter((assignment) => availableIds.has(assignment.recipeId));

      if (
        selectedIds.length === prev.selectedIds.length &&
        planAssignments.length === prev.planAssignments.length
      ) {
        return prev;
      }

      return {
        ...prev,
        selectedIds,
        planAssignments,
      };
    });
  }, [recipes, isLoadingRecipes]);

  const recipeMetaMap = useMemo(() => {
    const map = new Map<string, RecipeUserMeta>();
    for (const recipe of recipes) {
      map.set(recipe.id, getRecipeUserMeta(recipe.id));
    }
    return map;
  }, [recipes, state.selectedIds, state.planAssignments, planGenerated]);

  const getMeta = useCallback((recipeId: string): RecipeUserMeta => {
    return recipeMetaMap.get(recipeId) ?? { isMyPick: false, rating: null };
  }, [recipeMetaMap]);

  const dayNames = [t("meals.sun"), t("meals.mon"), t("meals.tue"), t("meals.wed"), t("meals.thu"), t("meals.fri"), t("meals.sat")];
  const mealNames: Record<string, string> = { "Breakfast": t("meals.breakfast"), "Lunch": t("meals.lunch"), "Dinner": t("meals.dinner") };

  useEffect(() => {
    saveState(state);
  }, [state]);

  const notify = useCallback((title: string, destructive = false) => toast({ title, variant: destructive ? "destructive" : "default" }), [toast]);
  /** Persists first; the UI only changes once the browser accepted the write, so a failed save never looks saved. */
  const commit = useCallback((edit: (plan: PlanState) => PlanState) => {
    if (weekLocked) { notify(planCopy("locked"), true); return false; }
    const next = edit(state as unknown as PlanState);
    if (next === (state as unknown as PlanState)) return false;
    try { writePlan(next); } catch { notify(planCopy("saveFailed"), true); return false; }
    // Learning signal: an AI recipe was put on the plan (not that it was cooked).
    const before = new Set(state.planAssignments.map(a => `${a.recipeId}|${a.mealType}|${a.startDay}`));
    const aiIds = new Set(recipes.filter(isGeneratedRecipe).map(r => r.id));
    if (next.planAssignments.some(a => aiIds.has(a.recipeId) && !before.has(`${a.recipeId}|${a.mealType}|${a.startDay}`))) {
      reportGenerationEvent("generated_recipe_added_to_plan");
    }
    setState(next as unknown as WeeklyMealsState);
    return true;
  }, [state, weekLocked, notify, planCopy, recipes]);

  const usedRecipeIds = useMemo(() => {
    return new Set(state.planAssignments.map(a => a.recipeId));
  }, [state.planAssignments]);

  const sortedSidebarRecipes = useMemo(() => {
    const selected = recipes.filter(r => state.selectedIds.includes(r.id));
    const unused = selected.filter(r => !usedRecipeIds.has(r.id));
    
    const myPicks = unused.filter(r => getMeta(r.id).isMyPick);
    const others = unused.filter(r => !getMeta(r.id).isMyPick);

    const sortFn = (a: Recipe, b: Recipe) => {
      const metaA = getMeta(a.id);
      const metaB = getMeta(b.id);
      
      if ((metaA.rating || 0) !== (metaB.rating || 0)) {
        return (metaB.rating || 0) - (metaA.rating || 0);
      }
      if (a.minutes !== b.minutes) {
        return a.minutes - b.minutes;
      }
      return a.title.localeCompare(b.title);
    };

    return {
      myPicks: myPicks.sort(sortFn),
      others: others.sort((a, b) => a.title.localeCompare(b.title))
    };
  }, [recipes, state.selectedIds, usedRecipeIds, getMeta]);

  const trayRecipes = useMemo(() => {
    return recipes.filter(r => usedRecipeIds.has(r.id));
  }, [recipes, usedRecipeIds]);

  const updateFilters = useCallback((updates: Partial<Filters>) => {
    setState(prev => ({ ...prev, filters: { ...prev.filters, ...updates } }));
  }, []);

  const toggleSection = (section: string) => {
    setState(prev => ({
      ...prev,
      expandedSections: prev.expandedSections.includes(section)
        ? prev.expandedSections.filter(s => s !== section)
        : [...prev.expandedSections, section],
    }));
  };

  const toggleArrayFilter = (key: keyof Filters, value: string) => {
    const current = state.filters[key] as string[];
    if (current.includes(value)) {
      updateFilters({ [key]: current.filter(v => v !== value) });
    } else {
      updateFilters({ [key]: [...current, value] });
    }
  };

  const clearAllFilters = () => {
    updateFilters(defaultFilters);
  };

  const toggleSelection = (id: string) => {
    if (state.selectedIds.includes(id)) {
      setState(prev => ({ ...prev, selectedIds: prev.selectedIds.filter(i => i !== id) }));
      setMaxSelectionsHit(false);
    } else if (state.selectedIds.length < 12) {
      setState(prev => ({ ...prev, selectedIds: [...prev.selectedIds, id] }));
      setMaxSelectionsHit(false);
    } else {
      setMaxSelectionsHit(true);
      setTimeout(() => setMaxSelectionsHit(false), 2000);
    }
  };

  const addIncludeIngredient = () => {
    const trimmed = includeInput.trim().toLowerCase();
    if (trimmed && !state.filters.mustInclude.includes(trimmed)) {
      updateFilters({ mustInclude: [...state.filters.mustInclude, trimmed] });
    }
    setIncludeInput("");
  };

  const addExcludeIngredient = () => {
    const trimmed = excludeInput.trim().toLowerCase();
    if (trimmed && !state.filters.mustExclude.includes(trimmed)) {
      updateFilters({ mustExclude: [...state.filters.mustExclude, trimmed] });
    }
    setExcludeInput("");
  };

  const removeIncludeIngredient = (ing: string) => {
    updateFilters({ mustInclude: state.filters.mustInclude.filter(i => i !== ing) });
  };

  const removeExcludeIngredient = (ing: string) => {
    updateFilters({ mustExclude: state.filters.mustExclude.filter(i => i !== ing) });
  };

  const countActiveFilters = (): number => {
    let count = 0;
    if (state.filters.maxMinutes !== null) count++;
    count += state.filters.dietary.length;
    count += state.filters.mealType.length;
    count += state.filters.cookingMethod.length;
    count += state.filters.source.length;
    count += state.filters.proteinType.length;
    if (state.filters.withNotes) count++;
    if (state.filters.modifiedByMe) count++;
    if (state.filters.myPicks) count++;
    if (state.filters.minRating !== null) count++;
    if (state.filters.servings) count++;
    count += state.filters.mustInclude.length;
    count += state.filters.mustExclude.length;
    return count;
  };

  const filterRecipes = (): Recipe[] =>
    recipes.filter(recipe => matchesPlannerFilters(recipe, state.filters, timeMode, getMeta(recipe.id)));

  const filteredRecipes = filterRecipes();
  const visibleFilteredRecipes = filteredRecipes.filter(recipe => !state.selectedIds.includes(recipe.id));

  // AI generation from the current filters. Saving uses the normal recipe API; the recipe then joins the selection.
  const generation = mealsGenerationBody(state.filters, timeMode);
  const filterLabel: Record<string, string> = {
    "Vegetarian": t("meals.vegetarian"), "Kid friendly": t("meals.kidFriendly"), "Gluten-free": t("meals.glutenFree"),
    "Breakfast": t("meals.breakfast"), "Lunch": t("meals.lunch"), "Dinner": t("meals.dinner"), "Lunch box": t("meals.lunchBox"),
    "Oven": t("meals.oven"), "Air fryer": t("meals.airFryer"), "Stovetop": t("meals.stovetop"), "No-cook": t("meals.noCook"),
    "Chicken": t("meals.chicken"), "Beef": t("meals.beef"), "Seafood": t("meals.seafood"), "Plant-based": t("meals.plantBased"),
  };
  const g = generation.body.filters;
  const generationChips = [
    ...(g.maxMinutes !== null ? [`${timeCopy(timeMode)} ≤ ${g.maxMinutes} ${timeCopy("minutesShort")}`] : []),
    ...[...g.dietary, ...g.mealType, ...g.cookingMethod, ...g.proteinType].map(value => filterLabel[value] ?? value),
    ...(g.servings ? [g.servings] : []),
    ...g.mustInclude.map(term => `${t("meals.mustInclude")}: ${term}`),
    ...g.mustExclude.map(term => `${t("meals.mustExclude")}: ${term}`),
  ];
  const notAppliedLabel: Record<string, string> = {
    source: t("meals.source"), withNotes: t("meals.withMyNotes"), modifiedByMe: t("meals.modifiedByMe"),
    myPicks: t("meals.showOnlyMyPicks"), minRating: t("meals.minimumRating"),
  };
  const violationLabel = (v: FilterViolation) =>
    v.filter === "maxMinutes" ? `${timeCopy(timeMode)} ≤ ${v.value} ${timeCopy("minutesShort")}` :
    v.filter === "mustInclude" ? `${t("meals.mustInclude")}: ${v.value}` :
    v.filter === "mustExclude" ? `${t("meals.mustExclude")}: ${v.value}` :
    v.value.split(" / ").map(value => filterLabel[value] ?? value).join(" / ");
  const generationRequest = { body: generation.body, chips: generationChips, notApplied: generation.notApplied.map(key => notAppliedLabel[key]), violationLabel };
  const acceptGenerated = async (recipe: NewRecipe) => {
    const saved = await createRecipe(recipe); // throws on failure: the preview stays open with an error
    setRecipes(prev => [...prev, toPlannerRecipe(saved)]);
    if (state.selectedIds.length < 12) setState(prev => ({ ...prev, selectedIds: [...prev.selectedIds, saved.id] }));
    else setMaxSelectionsHit(true);
    toast({ title: saved.title });
    return saved;
  };
  const activeFilterCount = countActiveFilters();
  const canGenerate = state.selectedIds.length >= 1;

  const generatePlan = () => {
    if (canGenerate) {
      setPlanGenerated(true);
    }
  };

  const getSelectedRecipes = () => {
    return recipes.filter(r => state.selectedIds.includes(r.id));
  };


  const clearWeek = () => {
    if (commit(p => ({ ...p, planAssignments: [] }))) setConfirmClear(false);
  };

  const selectedRecipes = getSelectedRecipes();

  if (isLoadingRecipes) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="Tablewise" subtitle={t("meals.calmPlanning")} onBrandClick={() => setLocation("/")} />
        <PageContainer size="xl" className="flex-1 py-6">
          <p className="text-sm text-muted-foreground">{t("recipes.loading") || "Loading recipes..."}</p>
        </PageContainer>
      </div>
    );
  }

  if (recipesError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="Tablewise" subtitle={t("meals.calmPlanning")} onBrandClick={() => setLocation("/")} />
        <PageContainer size="xl" className="flex-1 py-6">
          <div className="rounded-xl border hairline p-5 bg-[#FAFAF8] max-w-xl">
            <p className="text-sm text-foreground mb-3">Failed to load recipes.</p>
            <p className="text-xs text-muted-foreground mb-4">{recipesError}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 min-h-11 rounded-full bg-foreground text-background text-sm"
              >
                Retry
              </button>
              <button
                onClick={() => setLocation("/import")}
                className="px-4 py-2 min-h-11 rounded-full border hairline text-sm text-muted-foreground hover:text-foreground"
              >
                {t("nav.importRecipe")}
              </button>
            </div>
          </div>
        </PageContainer>
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="Tablewise" subtitle={t("meals.calmPlanning")} onBrandClick={() => setLocation("/")} />
        <PageContainer size="xl" className="flex-1 py-6">
          <div className="rounded-xl border hairline p-5 bg-[#FAFAF8] max-w-xl">
            <p className="text-sm text-foreground mb-3">{t("recipes.empty") || "No recipes yet"}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Import at least one recipe to build a weekly plan.
            </p>
            <button
              onClick={() => setLocation("/import")}
              className="px-4 py-2 min-h-11 rounded-full bg-foreground text-background text-sm"
            >
              {t("nav.importRecipe")}
            </button>
          </div>
        </PageContainer>
      </div>
    );
  }

  if (planGenerated) {
    const plan = state as unknown as PlanState;
    const planned = plannedSlotCount(plan);
    const shortlist = recipes.filter(r => state.selectedIds.includes(r.id));
    const recipeCount = shortlist.length === 1 ? planCopy("recipeOne") : planCopy("recipeMany", { count: shortlist.length });
    return (
      <div className="min-h-screen bg-[#fafaf7] flex flex-col">
        <AppHeader title="Tablewise" subtitle={planCopy("title")} onBrandClick={() => setLocation("/")} />
        <PageContainer size="xl" className="flex-1 py-4 sm:py-6">
          <button type="button" onClick={() => setPlanGenerated(false)} data-testid="button-back-to-selection"
            className="-ms-2 mb-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-[#42624e] hover:bg-[#f2f6ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#496c5a]">
            {planCopy("back")}
          </button>
          <h1 className="text-2xl font-medium text-foreground">{planCopy("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{planCopy("subtitle")}</p>
          <p className="mt-3 mb-6 text-sm text-[#42624e]" data-testid="plan-summary">
            {planCopy("summary", { recipes: recipeCount, planned, total: totalSlots })}
          </p>

          {shortlist.length === 0 ? (
            <div className="rounded-lg border hairline bg-white p-6 text-center" data-testid="planner-empty">
              <h2 className="text-base font-medium">{planCopy("emptyTitle")}</h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">{planCopy("emptyBody")}</p>
              <button type="button" onClick={() => setPlanGenerated(false)} className="inline-flex min-h-11 items-center rounded-full bg-[#42624e] px-4 text-sm font-medium text-white hover:bg-[#385540]">{planCopy("chooseRecipes")}</button>
            </div>
          ) : (
            <PlannerBoard recipes={shortlist} plan={plan} locked={weekLocked} commit={commit} notify={notify} dayNames={dayNames} mealNames={Object.values(mealNames)}
              onView={id => setLocation(`/recipe/${encodeURIComponent(id)}`)} />
          )}

          <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-col gap-2 border-t border-[#d9dfd4] bg-[#fafaf7]/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
            {planned === 0 && <p className="me-auto text-xs text-muted-foreground">{planCopy("groceryNone")}</p>}
            {!weekLocked && planned > 0 && (
              <button type="button" onClick={() => setConfirmClear(true)} data-testid="button-clear-week" className="min-h-11 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground sm:me-auto">{planCopy("clear")}</button>
            )}
            {weekLocked ? (
              <button type="button" onClick={() => setWeekLocked(false)} data-testid="button-unlock-week" className="min-h-11 rounded-full border border-[#d9dfd4] bg-white px-4 text-sm font-medium">{planCopy("finalized")} · {planCopy("unlock")}</button>
            ) : (
              <button type="button" onClick={() => setWeekLocked(true)} disabled={planned === 0} data-testid="button-finalize-week" className="min-h-11 rounded-full border border-[#d9dfd4] bg-white px-4 text-sm font-medium disabled:opacity-50">{planCopy("finalize")}</button>
            )}
            <button type="button" onClick={() => setLocation("/grocery-list")} disabled={planned === 0} data-testid="button-create-grocery-list"
              className="min-h-11 rounded-full bg-[#42624e] px-5 text-sm font-medium text-white hover:bg-[#385540] disabled:opacity-50">{planCopy("grocery")}</button>
          </div>

          <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>{planCopy("clear")}?</AlertDialogTitle></AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{planCopy("cancel")}</AlertDialogCancel>
                <AlertDialogAction data-testid="button-confirm-clear" onClick={clearWeek}>{planCopy("clear")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader
        title="Tablewise"
        subtitle={t("meals.calmPlanning")}
        onBrandClick={() => setLocation("/")}
        desktopActions={
          <nav className="flex items-center gap-6">
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground">{t("meals.howItWorks")}</a>
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground">{t("meals.plan")}</a>
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground">{t("meals.cost")}</a>
            <button className="text-sm min-h-11 text-muted-foreground hover:text-foreground px-3 py-1.5 border hairline rounded-lg" data-testid="button-login">
              {t("meals.logIn")}
            </button>
          </nav>
        }
        mobileMenuTitle={t("meals.calmPlanning")}
        mobileMenuContent={
          <div className="space-y-2">
            <a href="#" className="block px-3 py-2.5 min-h-11 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5">{t("meals.howItWorks")}</a>
            <a href="#" className="block px-3 py-2.5 min-h-11 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5">{t("meals.plan")}</a>
            <a href="#" className="block px-3 py-2.5 min-h-11 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5">{t("meals.cost")}</a>
            <button className="w-full text-left px-3 py-2.5 min-h-11 text-sm rounded-lg border hairline text-muted-foreground hover:text-foreground" data-testid="button-login-mobile">
              {t("meals.logIn")}
            </button>
          </div>
        }
      />

      <PageContainer size="xl" className="flex-1 py-4 sm:py-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <button
              onClick={generatePlan}
              disabled={!canGenerate}
              className={`px-6 py-2.5 min-h-11 text-sm rounded-full ${canGenerate ? "bg-foreground text-background hover:bg-foreground/90" : "bg-foreground/20 text-muted-foreground cursor-not-allowed"}`}
              data-testid="button-generate-plan"
            >
              {t("meals.generateWeeklyPlan")}
            </button>
            {!canGenerate && (
              <p className="mobile-readable-xs text-muted-foreground mt-2">{t("meals.minimum_meals_selection")}</p>
            )}
          </div>
          <p className="mobile-readable-xs text-muted-foreground">{t("meals.adjustLater")}</p>
        </div>
        <RecipeTimeToggle />
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          
          <aside className="w-full lg:w-[240px] lg:flex-shrink-0">
            <div className="lg:sticky lg:top-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-foreground">{t("meals.filters", { count: activeFilterCount })}</span>
                {activeFilterCount > 0 && (
                  <button 
                    onClick={clearAllFilters}
                    className="text-xs min-h-11 px-2 text-muted-foreground hover:text-foreground"
                    data-testid="button-clear-filters"
                  >
                    {t("meals.clearAll")}
                  </button>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("time")}
                  className="flex items-center justify-between w-full text-left min-h-11"
                  data-testid="button-toggle-time"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.maxMinutes")} · {timeCopy(timeMode)}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("time") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("time") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[null, 20, 30, 40, 60].map(mins => (
                      <button
                        key={mins ?? "any"}
                        onClick={() => updateFilters({ maxMinutes: mins })}
                        className={`px-3 py-2 min-h-11 text-xs rounded-full border hairline ${state.filters.maxMinutes === mins ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        data-testid={`filter-time-${mins ?? "any"}`}
                      >
                        {mins ?? t("meals.any")}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("dietary")}
                  className="flex items-center justify-between w-full text-left min-h-11"
                  data-testid="button-toggle-dietary"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.dietary")}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("dietary") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("dietary") && (
                  <div className="mt-3 space-y-2">
                    {["Vegetarian", "Kid friendly", "Gluten-free"].map(diet => {
                      const dietTranslations: Record<string, string> = {
                        "Vegetarian": t("meals.vegetarian"),
                        "Kid friendly": t("meals.kidFriendly"),
                        "Gluten-free": t("meals.glutenFree"),
                      };
                      return (
                        <label key={diet} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={state.filters.dietary.includes(diet)}
                            onChange={() => toggleArrayFilter("dietary", diet)}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                            data-testid={`filter-dietary-${diet.toLowerCase().replace(" ", "-")}`}
                          />
                          <span className="text-xs text-muted-foreground">{dietTranslations[diet] || diet}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("mealType")}
                  className="flex items-center justify-between w-full text-left min-h-11"
                  data-testid="button-toggle-mealtype"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.mealType")}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("mealType") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("mealType") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["Breakfast", "Lunch", "Dinner", "Lunch box"].map(type => {
                      const mealTypeTranslations: Record<string, string> = {
                        "Breakfast": t("meals.breakfast"),
                        "Lunch": t("meals.lunch"),
                        "Dinner": t("meals.dinner"),
                        "Lunch box": t("meals.lunchBox"),
                      };
                      return (
                        <button
                          key={type}
                          onClick={() => toggleArrayFilter("mealType", type)}
                          className={`px-3 py-2 min-h-11 text-xs rounded-full border hairline ${state.filters.mealType.includes(type) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`filter-meal-${type.toLowerCase().replace(" ", "-")}`}
                        >
                          {mealTypeTranslations[type] || type}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("method")}
                  className="flex items-center justify-between w-full text-left min-h-11"
                  data-testid="button-toggle-method"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.cookingMethod")}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("method") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("method") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["Oven", "Air fryer", "Stovetop", "No-cook"].map(method => {
                      const methodTranslations: Record<string, string> = {
                        "Oven": t("meals.oven"),
                        "Air fryer": t("meals.airFryer"),
                        "Stovetop": t("meals.stovetop"),
                        "No-cook": t("meals.noCook"),
                      };
                      return (
                        <button
                          key={method}
                          onClick={() => toggleArrayFilter("cookingMethod", method)}
                          className={`px-3 py-2 min-h-11 text-xs rounded-full border hairline ${state.filters.cookingMethod.includes(method) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`filter-method-${method.toLowerCase().replace(" ", "-")}`}
                        >
                          {methodTranslations[method] || method}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("source")}
                  className="flex items-center justify-between w-full text-left min-h-11"
                  data-testid="button-toggle-source"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.source")}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("source") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("source") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["My recipes", "Imported", "Trusted authors", "Personal"].map(src => {
                      const sourceTranslations: Record<string, string> = {
                        "My recipes": t("meals.myRecipes"),
                        "Imported": t("meals.imported"),
                        "Trusted authors": t("meals.trustedAuthors"),
                        "Personal": t("meals.personal"),
                      };
                      return (
                        <button
                          key={src}
                          onClick={() => toggleArrayFilter("source", src)}
                          className={`px-3 py-2 min-h-11 text-xs rounded-full border hairline ${state.filters.source.includes(src) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`filter-source-${src.toLowerCase().replace(" ", "-")}`}
                        >
                          {sourceTranslations[src] || src}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button 
                onClick={() => setState(prev => ({ ...prev, showMoreFilters: !prev.showMoreFilters }))}
                className="text-xs min-h-11 px-2 text-muted-foreground hover:text-foreground mb-3"
                data-testid="button-more-filters"
              >
                {state.showMoreFilters ? t("meals.lessFilters") : t("meals.moreFilters")}
              </button>

              {state.showMoreFilters && (
                <>
                  <div className="border-b hairline pb-3 mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">{t("meals.proteinType")}</span>
                    <div className="flex flex-wrap gap-2">
                      {["Chicken", "Beef", "Seafood", "Plant-based"].map(protein => {
                        const proteinTranslations: Record<string, string> = {
                          "Chicken": t("meals.chicken"),
                          "Beef": t("meals.beef"),
                          "Seafood": t("meals.seafood"),
                          "Plant-based": t("meals.plantBased"),
                        };
                        return (
                          <button
                            key={protein}
                            onClick={() => toggleArrayFilter("proteinType", protein)}
                            className={`px-3 py-2 min-h-11 text-xs rounded-full border hairline ${state.filters.proteinType.includes(protein) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            data-testid={`filter-protein-${protein.toLowerCase().replace("-", "")}`}
                          >
                            {proteinTranslations[protein] || protein}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-b hairline pb-3 mb-3">
                    <button 
                      onClick={() => toggleSection("myPicks")}
                      className="flex items-center justify-between w-full text-left min-h-11"
                      data-testid="button-toggle-mypicks-section"
                    >
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.myPicksFilter")}</span>
                      <span className="text-xs text-muted-foreground">{state.expandedSections.includes("myPicks") ? "-" : "+"}</span>
                    </button>
                    {state.expandedSections.includes("myPicks") && (
                      <div className="mt-3 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={state.filters.myPicks}
                            onChange={() => updateFilters({ myPicks: !state.filters.myPicks })}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                            data-testid="checkbox-filter-mypicks"
                          />
                          <span className="text-xs text-muted-foreground">{t("meals.showOnlyMyPicks")}</span>
                        </label>
                        
                        {state.filters.myPicks && (
                          <div className="pl-5 space-y-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">{t("meals.minimumRating")}</span>
                            <div className="flex flex-wrap gap-1">
                              {[null, 4, 3, 2].map(rating => (
                                <button
                                  key={String(rating)}
                                  onClick={() => updateFilters({ minRating: rating })}
                                  className={`px-3 py-2 min-h-11 text-[10px] rounded border hairline transition-colors ${
                                    state.filters.minRating === rating 
                                      ? "bg-foreground text-background border-foreground" 
                                      : "text-muted-foreground hover:text-foreground border-muted-foreground/30"
                                  }`}
                                  data-testid={`button-filter-rating-${rating || "any"}`}
                                >
                                  {rating ? `${rating}*+` : t("meals.any")}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="border-b hairline pb-3 mb-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state.filters.withNotes}
                        onChange={() => updateFilters({ withNotes: !state.filters.withNotes })}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                        data-testid="filter-with-notes"
                      />
                      <span className="text-xs text-muted-foreground">{t("meals.withMyNotes")}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state.filters.modifiedByMe}
                        onChange={() => updateFilters({ modifiedByMe: !state.filters.modifiedByMe })}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                        data-testid="filter-modified"
                      />
                      <span className="text-xs text-muted-foreground">{t("meals.modifiedByMe")}</span>
                    </label>
                  </div>

                  <div className="border-b hairline pb-3 mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">{t("meals.mustInclude")}</span>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {state.filters.mustInclude.map(ing => (
                        <span key={ing} className="px-2 py-0.5 text-xs bg-foreground/10 rounded-full flex items-center gap-1">
                          {ing}
                          <button
                            onClick={() => removeIncludeIngredient(ing)}
                            aria-label={`Remove ${ing} from must include`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={includeInput}
                      onChange={(e) => setIncludeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addIncludeIngredient()}
                      placeholder={t("meals.typeEnter")}
                      className="w-full px-3 py-2.5 min-h-11 text-xs border hairline rounded bg-transparent focus-ring-quiet"
                      data-testid="input-must-include"
                    />
                  </div>

                  <div className="pb-3 mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">{t("meals.mustExclude")}</span>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {state.filters.mustExclude.map(ing => (
                        <span key={ing} className="px-2 py-0.5 text-xs bg-foreground/10 rounded-full flex items-center gap-1">
                          {ing}
                          <button
                            onClick={() => removeExcludeIngredient(ing)}
                            aria-label={`Remove ${ing} from must exclude`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={excludeInput}
                      onChange={(e) => setExcludeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addExcludeIngredient()}
                      placeholder={t("meals.typeEnter")}
                      className="w-full px-3 py-2.5 min-h-11 text-xs border hairline rounded bg-transparent focus-ring-quiet"
                      data-testid="input-must-exclude"
                    />
                  </div>
                </>
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-medium text-foreground">{t("meals.step2Title")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("meals.step2Desc")}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="text-sm text-muted-foreground">{t("meals.selected", { count: state.selectedIds.length })}</span>
                {maxSelectionsHit && (
                  <p className="mobile-readable-xs text-muted-foreground mt-1">{t("meals.max12")}</p>
                )}
              </div>
            </div>

            {state.selectedIds.length > 0 ? (
              <div className="mb-6 p-5 bg-[#FAFAF8] rounded-xl border hairline" data-testid="panel-selected-recipes">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="mobile-readable-xs uppercase tracking-wide text-muted-foreground">
                      {t("meals.selectedRecipesPanel") || "Selected recipes"}
                    </h3>
                  <span className="mobile-readable-xs text-muted-foreground">{state.selectedIds.length} / 12</span>
                </div>
                <div className="space-y-2">
                  {selectedRecipes.map(recipe => {
                    const preparationMinutes = recipeStageMinutes(recipe, "preparation");
                    const displayTags: string[] = [];
                    if (recipe.mealType) displayTags.push(tagLabel(lang, recipe.mealType));
                    recipe.tags.forEach(tag => {
                      if (tag === "vegetarian") displayTags.push(t("meals.vegetarian"));
                      else if (tag === "kidFriendly") displayTags.push(t("meals.kidFriendly"));
                      else if (tag === "glutenFree") displayTags.push(t("meals.glutenFree"));
                    });
                    return (
                      <div
                        key={recipe.id}
                        className="flex items-center gap-2 sm:gap-3 p-3 bg-white rounded-lg border hairline"
                        data-testid={`selected-recipe-${recipe.id}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {recipe.image ? <img src={recipe.image} alt="" loading="lazy" className="w-full h-full object-cover" /> :
                          <span className="text-xs font-medium text-muted-foreground/50">{getMonogram(recipe.title)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="mobile-readable-xs font-medium text-foreground truncate">{recipe.title}</p>
                            <RecipePriceSummary recipe={recipe} context="selected" />
                            <span
                              className="mobile-readable-xs text-muted-foreground"
                              title={timeCopy("preparation")}
                              data-testid={`meals-selected-title-preparation-${recipe.id}`}
                            >
                              {preparationMinutes === null
                                ? timeCopy("preparationTimeUnknown")
                                : `${preparationMinutes} ${timeCopy("minutesShort")}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <MealRecipeFacts recipe={recipe} context="selected" />
                            {displayTags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleSelection(recipe.id)}
                          aria-label={`Remove ${recipe.title} from selected recipes`}
                          className="text-xs min-h-11 text-muted-foreground hover:text-foreground flex-shrink-0 px-2 py-1 rounded hover:bg-foreground/5"
                          data-testid={`remove-selected-${recipe.id}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-6 p-5 bg-[#FAFAF8] rounded-xl border hairline text-center" data-testid="panel-selected-recipes-empty">
                <p className="mobile-readable-xs text-muted-foreground">
                  {t("meals.noRecipesSelected") || "No recipes selected yet"}
                </p>
              </div>
            )}

            {visibleFilteredRecipes.length > 0 && <div className="mb-3 flex justify-end"><GenerateRecipe request={generationRequest} variant="button" onAccept={acceptGenerated} /></div>}
            <div className="space-y-2">
              {visibleFilteredRecipes.length === 0 ? (
                <GenerateRecipe request={generationRequest} variant="empty" onAccept={acceptGenerated} />
              ) : (
                visibleFilteredRecipes.map(recipe => {
                  const meta = getMeta(recipe.id);
                  const isSelected = state.selectedIds.includes(recipe.id);
                  const isExpanded = expandedRecipe === recipe.id;
                  const isArranging = arrangingRecipe === recipe.id;
                  const preparationMinutes = recipeStageMinutes(recipe, "preparation");
                  const monogram = getMonogram(recipe.title);
                  const displayTags = recipe.tags.map(tag => {
                    if (tag === "vegetarian") return t("meals.vegetarian");
                    if (tag === "kidFriendly") return t("meals.kidFriendly");
                    if (tag === "glutenFree") return t("meals.glutenFree");
                    return tagLabel(lang, tag);
                  });

                  return (
                    <div 
                      key={recipe.id} 
                      className="relative flex items-start gap-2 sm:gap-3 p-3 bg-white rounded-lg border hairline"
                      data-testid={`recipe-card-${recipe.id}`}
                    >
                      <div className="absolute right-2 top-2 max-w-[40%] text-right text-[10px] text-muted-foreground"><RecipeCreditLine recipe={recipe} /></div>
                      <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                        {recipe.image ? <img src={recipe.image} alt="" loading="lazy" className="w-full h-full object-cover" /> :
                        <span className="text-xs font-medium text-muted-foreground/50">{monogram}</span>}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="mobile-readable-xs font-medium text-foreground truncate">{recipe.title}</p>
                              <RecipePriceSummary recipe={recipe} context="catalog" />
                              <span className="mobile-readable-xs text-muted-foreground" title={timeCopy("preparation")} data-testid={`meals-catalog-title-preparation-${recipe.id}`}>
                                {preparationMinutes === null
                                  ? timeCopy("preparationTimeUnknown")
                                  : `${preparationMinutes} ${timeCopy("minutesShort")}`}
                              </span>
                              {meta.isMyPick && <span className="text-[10px] text-yellow-600 font-medium bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100">{`* ${t("meals.myPicks")}`}</span>}
                            </div>
                            {meta.rating && (
                              <div className="mt-1 flex items-center gap-1">
                                <StarRating value={meta.rating} onChange={() => {}} readOnly size="sm" />
                                <span className="text-[10px] text-muted-foreground">{meta.rating}/5</span>
                              </div>
                            )}
                          </div>
                        </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <MealRecipeFacts recipe={recipe} context="catalog" interactive={isArranging} actions={<>
                          <button
                            onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)}
                            aria-expanded={isExpanded}
                            className="px-3 py-2 text-xs min-h-11 rounded-full border border-foreground/20 text-muted-foreground hover:text-foreground"
                            data-testid={`button-ingredients-${recipe.id}`}
                          >
                            {t("meals.ingredients")}
                          </button>
                          <button
                            onClick={() => setArrangingRecipe(isArranging ? null : recipe.id)}
                            aria-pressed={isArranging}
                            className="px-2 py-1 text-xs min-h-11 rounded text-muted-foreground hover:text-foreground"
                            data-testid={`button-arrange-${recipe.id}`}
                          >
                            {isArranging ? t("layout.done") : t("layout.arrange")}
                          </button>
                        </>} />
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">{tagLabel(lang, recipe.mealType)}</span>
                        {displayTags.map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">{tag}</span>
                        ))}
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t hairline" data-testid={`recipe-details-${recipe.id}`}>
                          <p className="text-xs text-muted-foreground mb-2">{t("meals.source")}: {recipe.sourceType} · {tagLabel(lang, recipe.proteinType)}</p>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-foreground">{t("import.recipePreview")}</p>
                            <NutritionDetailsToggle context={recipe.id} />
                          </div>
                          <RecipeIngredients recipe={recipe} compact mainOnly />
                        </div>
                      )}
                      </div>
                      <button
                        onClick={() => toggleSelection(recipe.id)}
                        className={`px-2 py-1 text-xs rounded border flex-shrink-0 min-h-11 self-center ${isSelected ? "bg-foreground/10 border-foreground/30 text-foreground" : "border-foreground/20 text-muted-foreground hover:text-foreground"}`}
                        data-testid={`button-add-${recipe.id}`}
                      >
                        {isSelected ? t("meals.added") : t("meals.add")}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <footer className="mt-12 pt-6 border-t hairline text-center">
              <p className="text-readable-xs text-muted-foreground">{t("meals.footerFamilies")}</p>
              <p className="text-readable-xs text-muted-foreground mt-1">{t("meals.footerVersion")}</p>
              <p className="text-readable-xs text-muted-foreground mt-1">{`Tablewise | ${t("meals.calmPlanning")}`}</p>
            </footer>
          </main>
        </div>
      </PageContainer>
    </div>
  );
}

