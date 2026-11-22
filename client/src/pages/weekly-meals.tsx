import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from "react";
import { usePilotPage } from "@/hooks/use-pilot-page";
import { recordPilotEvent } from "@/lib/pilot-analytics";
import { addDays, calendarDate, currentWeek, isWeek, plannerRecipeURL } from "@/lib/week-plan";
import { dishOptions, proposeCookingPlan } from "@/lib/week-suggestions";
import { useHouseholdCopy } from "@/lib/household-copy";
import { loadWeekFilters, planFilters } from "@/lib/week-filters";
import { PlannerBoard } from "@/components/planner-board";
import { Check, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, useLocation, useSearch } from "wouter";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { StarRating } from "@/components/ui/star-rating";
import { getRecipeUserMeta, type RecipeUserMeta } from "@/hooks/use-recipe-user-meta";
import { useI18n } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { createRecipe, fetchRecipes } from "@/lib/storage";
import { toPlannerRecipe, toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { matchesPlannerFilters, pageNumbers, paginate, recipeNameMatches } from "@/lib/planner-filters";
import { FoodDeals, WeekDeals } from "@/components/food-deals";
import { foodDealById, foodDeals, weekDeals } from "@/lib/food-deals";
import { storeName } from "@/lib/grocery-stores";
import { useWeekFilterCopy } from "@/lib/week-filter-copy";
import { useFilterLabels, useWeekFilterChips, WeekFilterPanel } from "@/components/week-filter-panel";
import { countWeekFilters, defaultWeekFilters, sanitizeWeekFilters, type WeekFilters } from "@/lib/week-filters";

const SELECTED_PREVIEW = 5; // more selections collapse behind "Show all"
import { availableDevices, householdCounts, householdServings, loadSettings, methodChoices, missingAnswers, planKey, updateSettings, useSavedSettings, type HouseholdSetup } from "@/lib/basic-settings";
import { askURL, personalizeURL } from "@/hooks/use-cook-now";
import { CookingDays, overCount } from "@/components/household-controls";
import { mealOf, weekdayOf } from "@shared/cooking-plan";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ActivePreferences } from "@/components/active-preferences";
import { limitingReasons, matchCounts } from "@/lib/active-preferences";
import { checkEligibility, personalize, suggestReplacement } from "@/lib/preference-engine";
import { restrictionText, settingsText } from "@/lib/settings-copy";
import { RecipeSearchGeneration } from "@/components/recipe-search-generation";
import { searchGenerationRequest } from "@/lib/recipe-drafts";
import { generateCopy } from "@/lib/generate-recipe-copy";
import type { Recipe as StoredRecipe } from "@/lib/storage";
import { GenerateRecipe } from "@/components/generate-recipe";
import { isGeneratedRecipe, mealsGenerationBody, reportGenerationEvent, type FilterViolation, type NewRecipe } from "@/lib/recipe-generation";
import { RecipeIngredients } from "@/components/recipe-ingredients";
import { NutritionDetailsToggle, useRecipeDisplay } from "@/components/recipe-display";
import { usableNutrition } from "@shared/recipe-nutrition";
import { RecipeCard } from "@/components/recipe-card";
import { MealRecipeFacts, RecipeTimeProvider, RecipeDisplayToolbar, useRecipeTime } from "@/components/recipe-time-display";
import { recipeStageMinutes } from "@/lib/recipe-time";
import { useMvpCopy } from "@/lib/mvp-copy";
import { usePlannerCopy } from "@/lib/planner-copy";
import { approvePlan, fetchWeek, mealSlots, pushWeekPlan, saveWeek, statusOf, type Batch, type MealSlot, type PlanState } from "@/lib/meal-plan";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

type Recipe = PlannerRecipe;

type Filters = WeekFilters;

/** The browser copy of the current week (meal-plan.ts) plus this page's filters. The browser only changes picks and
 * filters; the dishes (`batches`) are carried through untouched, except a pick replaced in place. */
interface WeeklyMealsState {
  filters: Filters;
  selectedIds: string[];
  batches?: Batch[];
}

const defaultFilters: Filters = defaultWeekFilters;

const defaultState: WeeklyMealsState = {
  filters: defaultFilters,
  selectedIds: [],
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Recipe tags are stored as English tokens in seed data; translate for display.
const TAG_LABELS: Record<string, Record<string, string>> = {
  ru: { Breakfast: "Завтрак", Lunch: "Обед", Dinner: "Ужин", Chicken: "Курица", Fish: "Рыба", Beef: "Говядина", Pasta: "Паста", Vegetarian: "Вегетарианское", Vegan: "Веганское", "Source-verified": "Источник проверен", "Synthetic test data": "Тестовые данные", "Unverified collection link": "Ссылка на коллекцию не проверена", "Development estimates": "Тестовые оценки" },
  he: { Breakfast: "ארוחת בוקר", Lunch: "ארוחת צהריים", Dinner: "ארוחת ערב", Chicken: "עוף", Fish: "דגים", Beef: "בקר", Pasta: "פסטה", Vegetarian: "צמחוני", Vegan: "טבעוני", "Source-verified": "מקור מאומת", "Synthetic test data": "נתוני בדיקה", "Unverified collection link": "קישור אוסף לא מאומת", "Development estimates": "הערכות לפיתוח" },
};
const tagLabel = (lang: string, tag: string) => TAG_LABELS[lang]?.[tag] ?? tag;

// English page copy for this pass; other languages keep their existing translations.
const WEEK_EN = { title: "Plan your week", subtitle: "Pick recipes you'd like to cook, then generate your plan." };

const MEALS: ("Breakfast" | "Lunch" | "Dinner")[] = ["Breakfast", "Lunch", "Dinner"];

// Kitchen tools on Week → Plan: the devices in Basic Settings, plus No-cook.
const kitchenTools = (devices: ReturnType<typeof availableDevices>) => methodChoices(devices);

function loadState(): WeeklyMealsState {
  try {
    const saved = localStorage.getItem("weeklyMealsState");
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultState, ...parsed, filters: sanitizeWeekFilters(parsed.filters) };
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

/** /meals is the Week calendar; /meals?browse is the recipe browser (search, filters, Food deals, picks). */
export default function WeeklyMeals() {
  const search = useSearch();
  const browsing = new URLSearchParams(search).has("browse");
  const [, setLocation] = useLocation();
  // Suggestions need the household's required answers (My kitchen above all): ask only what is missing, then come back.
  const missing = missingAnswers(loadSettings());
  useEffect(() => { if (missing.length) setLocation(askURL(missing, `/meals${search ? `?${search}` : ""}`), { replace: true }); }, [missing.length]);
  if (missing.length) return null;
  return <RecipeTimeProvider>{browsing ? <WeeklyMealsContent /> : <WeekCalendar />}</RecipeTimeProvider>;
}

function WeeklyMealsContent() {
  const [, setLocation] = useLocation();
  const { t, lang } = useI18n();
  const { t: timeCopy } = useMvpCopy();
  const { mode: timeMode } = useRecipeTime();
  // My Basic Settings are the baseline: loaded on open, refreshed when they change in another tab or on return.
  const settings = useSavedSettings();
  const devices = availableDevices(settings);
  const sText = (key: string, values?: Record<string, string | number>) => settingsText(lang, key, values);
  const [state, setState] = useState<WeeklyMealsState>(() => {
    // Drop a saved cooking-method filter for a device the person no longer has.
    const saved = loadState(), allowed: readonly string[] = kitchenTools(devices);
    return { ...saved, filters: { ...saved.filters, cookingMethod: saved.filters.cookingMethod.filter(m => allowed.includes(m)) } };
  });
  useEffect(() => {
    // Temporary filters stay, except a cooking method for a device the person no longer has.
    const allowed: readonly string[] = kitchenTools(availableDevices(settings));
    setState(prev => {
      const cookingMethod = prev.filters.cookingMethod.filter(m => allowed.includes(m));
      return cookingMethod.length === prev.filters.cookingMethod.length ? prev : { ...prev, filters: { ...prev.filters, cookingMethod } };
    });
  }, [settings]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  // Pilot funnel (docs/phase-5-analytics.md). Only picks made on this page count, not a plan restored from storage.
  const pilotWeek = currentWeek();
  usePilotPage("planner_opened", pilotWeek);
  const pilotSeen = useRef(state.selectedIds);
  useEffect(() => {
    state.selectedIds.filter(id => !pilotSeen.current.includes(id)).forEach(id => recordPilotEvent("meal_selected", pilotWeek, id));
    pilotSeen.current = state.selectedIds;
  }, [state.selectedIds, pilotWeek]);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [arrangingRecipe, setArrangingRecipe] = useState<string | null>(null);
  const [maxSelectionsHit, setMaxSelectionsHit] = useState(false);
  // Recipe name search; works together with the filters. Deferred so typing stays responsive on long lists.
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search).trim();
  const [page, setPage] = useState(1);
  const [showAllSelected, setShowAllSelected] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Both disclosures start collapsed on every visit.
  const c = useWeekFilterCopy();
  const filtersKey = JSON.stringify(state.filters);
  useEffect(() => setPage(1), [query, filtersKey]); // new search or filters → back to page 1
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
      return selectedIds.length === prev.selectedIds.length ? prev : { ...prev, selectedIds };
    });
  }, [recipes, isLoadingRecipes]);

  const recipeMetaMap = useMemo(() => {
    const map = new Map<string, RecipeUserMeta>();
    for (const recipe of recipes) {
      map.set(recipe.id, getRecipeUserMeta(recipe.id));
    }
    return map;
  }, [recipes, state.selectedIds, state.batches]);

  const getMeta = useCallback((recipeId: string): RecipeUserMeta => {
    return recipeMetaMap.get(recipeId) ?? { isMyPick: false, rating: null };
  }, [recipeMetaMap]);

  const dayNames = [t("meals.sun"), t("meals.mon"), t("meals.tue"), t("meals.wed"), t("meals.thu"), t("meals.fri"), t("meals.sat")];
  const mealNames: Record<string, string> = { "Breakfast": t("meals.breakfast"), "Lunch": t("meals.lunch"), "Dinner": t("meals.dinner") };

  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => pushWeekPlan(), [state]); // after the localStorage write; skips unchanged plans

  const notify = useCallback((title: string, destructive = false) => toast({ title, variant: destructive ? "destructive" : "default" }), [toast]);
  const usedRecipeIds = useMemo(() => {
    return new Set((state.batches ?? []).map(b => b.recipeId));
  }, [state.batches]);

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

  // Shared with Your household: the same filters, in the same state, on both pages.
  const setFilters = useCallback((filters: Filters) => setState(prev => ({ ...prev, filters })), []);
  const filterChips = useWeekFilterChips(state.filters, setFilters);
  const updateFilters = useCallback((updates: Partial<Filters>) => {
    setState(prev => ({ ...prev, filters: { ...prev.filters, ...updates } }));
  }, []);
  // The Week's Weekly deals link here as ?browse&deal=<id>: apply that deal filter once, then drop it from the URL.
  const dealParam = new URLSearchParams(useSearch()).get("deal");
  useEffect(() => {
    if (!dealParam) return;
    if (foodDealById(dealParam)) updateFilters({ deal: dealParam });
    setLocation("/meals?browse", { replace: true });
  }, [dealParam, updateFilters, setLocation]);



  const clearAllFilters = () => {
    updateFilters(defaultFilters);
  };

  // Removing a selection is reversible: Undo puts the same recipe back in the same position.
  const removeSelected = (id: string) => {
    const index = state.selectedIds.indexOf(id);
    const title = recipes.find(r => r.id === id)?.title ?? "";
    setState(prev => ({ ...prev, selectedIds: prev.selectedIds.filter(i => i !== id) }));
    setMaxSelectionsHit(false);
    toast({
      title: t("removedFromSelection", { title }),
      action: <ToastAction altText={t("undo")} onClick={() => setState(prev =>
        prev.selectedIds.includes(id) || prev.selectedIds.length >= 12 ? prev
          : { ...prev, selectedIds: [...prev.selectedIds.slice(0, index), id, ...prev.selectedIds.slice(index)] })}>{t("undo")}</ToastAction>,
    });
  };

  const toggleSelection = (id: string) => {
    if (state.selectedIds.includes(id)) {
      removeSelected(id);
    } else if (state.selectedIds.length < 12) {
      setState(prev => ({ ...prev, selectedIds: [...prev.selectedIds, id] }));
      setMaxSelectionsHit(false);
    } else {
      setMaxSelectionsHit(true);
      setTimeout(() => setMaxSelectionsHit(false), 2000);
    }
  };





  // My Basic Settings always apply: hard restrictions (devices, diets, allergies, hard time limit) hide recipes;
  // soft preferences only change the order (preference-engine.ts). My Recipes is not affected.
  // Meal-specific rules apply only to the meal types filtered for; the full list keeps the global restrictions only.
  const filteredMeals = useMemo(() => mealSlots.filter(m => state.filters.mealType.includes(m)), [state.filters.mealType]);
  const personalized = useMemo(() => personalize(recipes, settings, {
    selected: recipes.filter(r => state.selectedIds.includes(r.id)), meta: getMeta, meals: filteredMeals,
  }), [recipes, settings, state.selectedIds, getMeta, filteredMeals]);
  const eligibleRecipes = useMemo(() => personalized.eligible.map(e => e.recipe), [personalized]);
  // "Matches Mia's favourites" / "Liked by 2 family members": only from a real saved like matching this recipe.
  const likedNote = useMemo(() => {
    const notes = new Map<string, string>();
    for (const e of personalized.eligible) {
      const names = e.ranking.matches.filter(m => m.startsWith("likedBy:"))
        .map(m => settings.household.members.find(x => x.id === m.slice(8))?.name).filter(Boolean);
      if (names.length) notes.set(e.recipe.id, names.length === 1 ? sText("likedByMember", { name: names[0]! }) : sText("likedByMany", { count: names.length }));
    }
    return notes;
  }, [personalized, settings, lang]);
  const matchesPage = (recipe: Recipe, filters = state.filters) => (!query || recipeNameMatches(recipe.title, query)) &&
    matchesPlannerFilters(recipe, filters, "total", getMeta(recipe.id)); // Week → Plan filters on total recipe time
  const filterRecipes = (): Recipe[] => eligibleRecipes.filter(recipe => matchesPage(recipe));
  // Per-meal counts: the same rules and filters the list uses when that meal type is the one selected.
  const mealEligible = useMemo(() => personalize(recipes, settings, { meals: mealSlots }).eligible.map(e => e.recipe), [recipes, settings]);
  const mealCount = (meal: MealSlot) => mealEligible.filter(r => r.mealType === meal && matchesPage(r, { ...state.filters, mealType: [meal] })).length;
  const memberName = (id: string) => settings.household.members.find(m => m.id === id)?.name ?? null;
  const replaceSelected = (oldId: string, newId: string) => {
    // Swap in place: the selection order and any planned dishes keep their positions.
    setState(prev => ({ ...prev, selectedIds: prev.selectedIds.map(id => (id === oldId ? newId : id)),
      ...(prev.batches ? { batches: prev.batches.map(b => (b.recipeId === oldId ? { ...b, recipeId: newId } : b)) } : {}) }));
  };

  const filteredRecipes = filterRecipes();
  const visibleFilteredRecipes = filteredRecipes.filter(recipe => !state.selectedIds.includes(recipe.id));
  // Paginate last: after restrictions, filters, search and ranking. Selections are global, not per page.
  const results = paginate(visibleFilteredRecipes, page);
  const goToPage = (n: number) => {
    setPage(n);
    document.getElementById("meal-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // AI generation from the current filters. Saving uses the normal recipe API; the recipe then joins the selection.
  const generation = mealsGenerationBody(state.filters, "total");
  const filterLabel = useFilterLabels();

  const g = generation.body.filters;
  const generationChips = [
    ...(g.maxMinutes !== null ? [`${timeCopy("total")} ≤ ${g.maxMinutes} ${timeCopy("minutesShort")}`] : []),
    ...[...g.dietary, ...g.mealType, ...g.cookingMethod, ...g.proteinType].map(value => filterLabel[value] ?? value),
    ...(g.servings ? [g.servings] : []),
    ...g.mustInclude.map(term => `${t("meals.mustInclude")}: ${term}`),
    ...g.mustExclude.map(term => `${t("meals.mustExclude")}: ${term}`),
  ];
  const notAppliedLabel: Record<string, string> = {
    source: t("meals.source"), withNotes: t("meals.withMyNotes"), modifiedByMe: t("meals.modifiedByMe"),
    myPicks: t("meals.showOnlyMyPicks"), minRating: t("meals.minimumRating"), cuisine: t("meals.cuisine"),
    dietary: state.filters.dietary.filter(d => !generation.body.filters.dietary.includes(d)).map(d => filterLabel[d] ?? d).join(", "),
    cookingLevel: c("cookingLevel"), deal: c("foodDeals"),
  };
  const violationLabel = (v: FilterViolation) =>
    v.filter === "maxMinutes" ? `${timeCopy("total")} ≤ ${v.value} ${timeCopy("minutesShort")}` :
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
  // Search with no result: same name but other filters (explained to the customer), and the AI request for that name.
  const nameOnly = query ? eligibleRecipes.filter(r => recipeNameMatches(r.title, query) && !filteredRecipes.includes(r)) : [];
  const searchRequest = searchGenerationRequest(query, state.filters, "total");
  const dealName = state.filters.deal ? c(`deal_${state.filters.deal}`) : "";
  const removeDeal = () => updateFilters({ deal: null });
  const searchChips = filterChips.search;

  const reloadRecipes = () => { fetchRecipes().then(data => setRecipes(toPlannerRecipes(data))).catch(() => undefined); };
  const publishedFromSearch = (saved: StoredRecipe) => {
    setRecipes(prev => [...prev.filter(r => r.id !== saved.id), toPlannerRecipe(saved)]);
    if (state.selectedIds.length < 12) setState(prev => ({ ...prev, selectedIds: [...new Set([...prev.selectedIds, saved.id])] }));
    else setMaxSelectionsHit(true);
    toast({ title: generateCopy(lang, "published"), description: saved.title });
  };
  const activeFilterCount = countWeekFilters(state.filters);

  const showDealRecipes = (dealId: string) => {
    updateFilters({ deal: dealId }); // replaces any earlier deal; every other filter stays
    document.getElementById("meal-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const canGenerate = state.selectedIds.length >= 1;

  const getSelectedRecipes = () => {
    return recipes.filter(r => state.selectedIds.includes(r.id));
  };



  const selectedRecipes = getSelectedRecipes();
  // Warnings never hide behind "Show all": incompatible picks always stay in the collapsed list.
  const selectedFits = selectedRecipes.map(recipe => ({ recipe, fit: checkEligibility(recipe, settings, undefined, mealSlots.find(m => m === recipe.mealType)) }));

  if (isLoadingRecipes) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PageContainer size="xl" className="flex-1 py-6">
          <p className="text-sm text-muted-foreground">{t("recipes.loading") || "Loading recipes..."}</p>
        </PageContainer>
      </div>
    );
  }

  if (recipesError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PageContainer size="xl" className="flex-1 py-6">
          <div className="card max-w-xl p-5">
            <p className="text-sm text-foreground mb-3">Failed to load recipes.</p>
            <p className="text-xs text-muted-foreground mb-4">{recipesError}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.location.reload()}
                className="btn btn-primary"
              >
                Retry
              </button>
              <button
                onClick={() => setLocation("/import")}
                className="btn btn-secondary"
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
        <PageContainer size="xl" className="flex-1 py-6">
          <div className="card max-w-xl p-5">
            <p className="text-sm text-foreground mb-3">{t("recipes.empty") || "No recipes yet"}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Import at least one recipe to build a weekly plan.
            </p>
            <button
              onClick={() => setLocation("/import")}
              className="btn btn-primary"
            >
              {t("nav.addRecipe")}
            </button>
          </div>
        </PageContainer>
      </div>
    );
  }

  // One filter panel (components/week-filter-panel.tsx): the desktop sidebar, the phone sheet and Your household.
  const filterPanel = <WeekFilterPanel filters={state.filters} onChange={setFilters} devices={devices} eligible={eligibleRecipes}
    matchingCount={filteredRecipes.length} mealCount={recipes.length > 0 ? mealCount : undefined} />;

  return (
    <div className="min-h-screen bg-background flex flex-col">

      <PageContainer size="xl" className="flex-1 py-4 sm:py-6">
        <header className="page-header">
          <h1 className="page-title">{lang === "en" ? WEEK_EN.title : t("meals.step2Title")}</h1>
          <p className="page-subtitle">{lang === "en" ? WEEK_EN.subtitle : t("meals.step2Desc")}</p>
        </header>
        {/* Sticky: the next step stays in reach while browsing. The app header is not sticky, so nothing overlaps. */}
        <div className="sticky top-0 z-20 mb-4 flex items-center gap-3 border-b hairline bg-background/95 py-2 backdrop-blur" data-testid="weekly-meals-header">
          <p id="continue-hint" className="min-w-0 flex-1 text-sm text-muted-foreground" aria-live="polite" data-testid="selected-count">
            {canGenerate ? t("meals.selectedShort", { count: state.selectedIds.length }) : t("meals.minimum_meals_selection")}
            {maxSelectionsHit && <span className="block text-foreground">{t("meals.max12")}</span>}
          </p>
          <Link href="/meals?plan" className="btn btn-primary shrink-0" data-testid="button-back-to-week">{planCopy("backToWeek")}</Link>
        </div>
        {/* Counts come from the exact lists rendered below: all → saved restrictions → page filters/search. */}
        <ActivePreferences settings={settings} counts={recipes.length ? matchCounts(personalized, filteredRecipes) : null}
          noDevices={devices.length === 0} onEdit={() => setLocation("/settings")} />
        <form role="search" className="mb-4" data-testid="recipe-search" onSubmit={e => {
          // Results update while typing; Enter takes you to them (they sit below the filters on phones).
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          document.getElementById("meal-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}>
          <label htmlFor="recipe-search-input" className="mb-1.5 block text-base font-medium text-foreground">{generateCopy(lang, "searchLabel")}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="recipe-search-input" type="search" value={search} onChange={e => setSearch(e.target.value)} maxLength={120}
              placeholder={generateCopy(lang, "searchPlaceholder")} autoComplete="off" enterKeyHint="search" data-testid="recipe-search-input"
              className="min-h-12 w-full rounded-full border border-border bg-white ps-10 pe-12 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-search-cancel-button]:hidden" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label={generateCopy(lang, "searchClear")} data-testid="recipe-search-clear"
              className="absolute end-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>}
          </div>
        </form>
        {/* Phones and tablets: the same filters open in a sheet; desktop keeps the sidebar. */}
        <div className="mb-4 flex flex-wrap items-center gap-3 lg:hidden" data-testid="mobile-filter-bar">
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <button type="button" className="btn btn-secondary" data-testid="button-open-filters">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{t("filters.open", { count: activeFilterCount })}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="flex max-h-[90dvh] flex-col gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]" data-testid="filters-sheet">
              <SheetHeader className="border-b hairline px-4 py-3 text-start">
                <SheetTitle>{t("filters.title")}</SheetTitle>
                <SheetDescription className="sr-only">{t("filters.title")}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4 py-3">{filterPanel}</div>
              <div className="flex gap-2 border-t hairline px-4 py-3">
                <button type="button" onClick={clearAllFilters} disabled={activeFilterCount === 0} className="btn btn-secondary flex-1" data-testid="sheet-clear-filters">{t("filters.clearFilters")}</button>
                <button type="button" onClick={() => setFiltersOpen(false)} className="btn btn-primary flex-1" data-testid="sheet-show-results">
                  {filteredRecipes.length === 1 ? t("filters.showResultsOne") : t("filters.showResults", { count: filteredRecipes.length })}
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-sm text-muted-foreground" aria-live="polite">{filteredRecipes.length === 1 ? t("meals.matchingCountOne") : t("meals.matchingCount", { count: filteredRecipes.length })}</span>
        </div>
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          
          <aside id="meal-filters" className="hidden lg:block lg:w-[260px] lg:flex-shrink-0 scroll-mt-4" aria-label={t("filters.title")}>
            <div className="lg:sticky lg:top-16">{filterPanel}</div>
          </aside>

          <main className="flex-1 min-w-0">

            {state.selectedIds.length > 0 ? (
              <div className="card mb-6 p-3" data-testid="panel-selected-recipes">
                <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-sm font-medium text-foreground">
                      {t("meals.selectedRecipesPanel")}
                    </h2>
                  <span className="mobile-readable-xs text-muted-foreground" data-testid="selected-counter">{state.selectedIds.length} / 12</span>
                </div>
                <ul className="divide-y divide-foreground/5">
                  {selectedFits.filter(({ fit }, i) => showAllSelected || i < SELECTED_PREVIEW || !fit.eligible).map(({ recipe, fit }) => {
                    const totalMinutes = recipeStageMinutes(recipe, "total");
                    const diet = recipe.tags.includes("vegetarian") ? t("meals.vegetarian") : recipe.tags.includes("glutenFree") ? t("meals.glutenFree") : null;
                    const replacement = fit.eligible ? null : suggestReplacement(recipe, recipes, state.selectedIds, settings, { meta: getMeta });
                    return (
                      <li key={recipe.id}>
                      <div
                        className={`flex items-center gap-2 px-1 py-1 ${fit.eligible ? "" : "rounded-lg bg-amber-50/60"}`}
                        data-testid={`selected-recipe-${recipe.id}`}
                      >
                        {recipe.image && <img src={recipe.image} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md object-cover" />}
                        <Link href={`/recipe/${recipe.id}`} className="min-w-0 flex-1 break-words py-2 text-base text-foreground hover:underline" data-testid={`selected-recipe-link-${recipe.id}`}>
                          {recipe.title}
                        </Link>
                        {diet && <span className="tag hidden sm:inline-flex flex-shrink-0">{diet}</span>}
                        {totalMinutes !== null && <span className="text-sm text-muted-foreground flex-shrink-0 tabular-nums" title={timeCopy("total")} data-testid={`meals-selected-total-${recipe.id}`}>
                          {`${totalMinutes} ${timeCopy("minutesShort")}`}
                        </span>}
                        <button
                          type="button"
                          onClick={() => toggleSelection(recipe.id)}
                          aria-label={t("meals.removeSelected", { title: recipe.title })}
                          className="min-h-11 min-w-11 flex items-center justify-center flex-shrink-0 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                          data-testid={`remove-selected-${recipe.id}`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {!fit.eligible && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert" data-testid={`incompatible-${recipe.id}`}>
                          <span>{sText("incompatible")}: {fit.reasons.map(r => restrictionText(lang, r, memberName)).join("; ")}</span>
                          {replacement
                            ? <button type="button" onClick={() => replaceSelected(recipe.id, replacement.id)} data-testid={`replace-${recipe.id}`}
                                className="min-h-9 rounded-full border border-amber-300 bg-white px-3 font-medium hover:bg-amber-100 disabled:opacity-50">{sText("replaceWith", { title: replacement.title })}</button>
                            : <span className="text-amber-700">{sText("noReplacement")}</span>}
                        </div>
                      )}
                      </li>
                    );
                  })}
                </ul>
                {selectedRecipes.length > SELECTED_PREVIEW && (
                  <button type="button" onClick={() => setShowAllSelected(v => !v)} aria-expanded={showAllSelected} data-testid="button-toggle-selected"
                    className="btn btn-text mt-1">
                    {showAllSelected ? t("meals.showFewer") : t("meals.showAllSelected", { count: selectedRecipes.length })}
                  </button>
                )}
              </div>
            ) : (
              <div className="card mb-6 p-5 text-center" data-testid="panel-selected-recipes-empty">
                <p className="mobile-readable-xs text-muted-foreground">
                  {t("meals.noRecipesSelected") || "No recipes selected yet"}
                </p>
              </div>
            )}

            <FoodDeals activeDeal={state.filters.deal} onShowRecipes={showDealRecipes} />
            {!query && visibleFilteredRecipes.length > 0 && <div className="mb-3 flex justify-end"><GenerateRecipe request={generationRequest} variant="button" onAccept={acceptGenerated} /></div>}
            {results.total > 0 && (
              <h2 className="mb-2 text-sm text-muted-foreground" aria-live="polite" data-testid="results-range" data-total={results.total}>
                {t("meals.showingRange", { from: results.from, to: results.to, total: results.total })}
              </h2>
            )}
            <RecipeDisplayToolbar />
            <div id="meal-results" className="grid scroll-mt-24 gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>:not(article)]:col-span-full">
              {recipes.length > 0 && eligibleRecipes.length === 0 ? (
                // Every recipe breaks a hard restriction: say which ones, never fall back to incompatible suggestions.
                <div className="rounded-xl border hairline bg-white p-5" role="status" data-testid="no-match-settings">
                  <h2 className="text-base font-medium text-foreground">{sText("noMatchTitle")}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{sText("noMatchBody")}</p>
                  <ul className="mt-1 list-disc ps-5 text-sm text-muted-foreground">
                    {limitingReasons(personalized.excluded, lang, memberName).map(reason => <li key={reason}>{reason}</li>)}
                  </ul>
                  <button type="button" onClick={() => setLocation("/settings")} data-testid="button-no-match-edit"
                    className="btn btn-primary mt-4">{sText("editPrefs")}</button>
                </div>
              ) : query && query.length >= 2 && filteredRecipes.length === 0 ? (
                <RecipeSearchGeneration key={JSON.stringify(searchRequest.body)} query={query} request={searchRequest.body}
                  chips={searchChips} notApplied={searchRequest.notApplied.map(key => notAppliedLabel[key])} nameOnly={nameOnly}
                  violationLabel={violationLabel} onPublished={publishedFromSearch} onExisting={reloadRecipes}
                  onEditFilters={() => window.matchMedia("(min-width: 1024px)").matches ? document.getElementById("meal-filters")?.scrollIntoView({ block: "start" }) : setFiltersOpen(true)} />
              ) : query && visibleFilteredRecipes.length === 0 ? null : visibleFilteredRecipes.length === 0 ? (
                <>
                  <div className="card mb-3 flex flex-wrap items-center justify-between gap-3 p-4" role="status" data-testid="filters-empty">
                    <p className="text-base text-foreground">{c("noRecipesMatch")}</p>
                    {state.filters.deal && <button type="button" onClick={removeDeal} className="btn btn-secondary" data-testid="button-remove-deal">{c("removeDeal")}</button>}
                  </div>
                  <GenerateRecipe request={generationRequest} variant="empty" onAccept={acceptGenerated} />
                </>
              ) : (
                results.items.map(recipe => {
                  const meta = getMeta(recipe.id);
                  const isSelected = state.selectedIds.includes(recipe.id);
                  const isExpanded = expandedRecipe === recipe.id;
                  const isArranging = arrangingRecipe === recipe.id;

                  return (
                    <RecipeCard key={recipe.id} recipe={recipe} href={`/recipe/${recipe.id}`} mode={timeMode} testId={`recipe-card-${recipe.id}`}
                      ids={{ meta: `meals-catalog-meta-${recipe.id}`, view: `meals-catalog-view-${recipe.id}` }}>
                          {(meta.isMyPick || meta.rating || likedNote.has(recipe.id)) && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {meta.isMyPick && <span className="tag">{`★ ${t("meals.myPicks")}`}</span>}
                              {meta.rating && <span className="inline-flex items-center gap-1"><StarRating value={meta.rating} onChange={() => {}} readOnly size="sm" /><span className="text-muted-foreground">{meta.rating}/5</span></span>}
                              {likedNote.has(recipe.id) && <span className="text-primary" data-testid={`recipe-liked-${recipe.id}`}>{likedNote.get(recipe.id)}</span>}
                            </div>
                          )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => toggleSelection(recipe.id)} aria-pressed={isSelected}
                          aria-label={`${isSelected ? t("meals.added") : t("meals.add")}: ${recipe.title}`}
                          className="btn btn-secondary" data-testid={`button-add-${recipe.id}`}>
                          {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                          {isSelected ? t("meals.added") : t("meals.add")}
                        </button>
                        <Link href={`/recipe/${recipe.id}`} className="btn btn-text" data-testid={`button-open-${recipe.id}`}
                          aria-label={`${t("card.viewRecipe")}: ${recipe.title}`}>{t("card.viewRecipe")}</Link>
                        <button type="button" onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)} aria-expanded={isExpanded}
                          aria-controls={`recipe-details-${recipe.id}`} className="btn btn-text" data-testid={`button-ingredients-${recipe.id}`}>
                          {isExpanded ? t("card.hideDetails") : t("card.details")}
                        </button>
                      </div>

                      {isExpanded && (
                        <div id={`recipe-details-${recipe.id}`} className="space-y-3 border-t hairline pt-3 text-sm" data-testid={`recipe-details-${recipe.id}`}>
                          <MealRecipeFacts recipe={recipe} context="catalog" interactive={isArranging} showLink={false} actions={
                            <button type="button" onClick={() => setArrangingRecipe(isArranging ? null : recipe.id)} aria-pressed={isArranging}
                              className="btn btn-text" data-testid={`button-arrange-${recipe.id}`}>
                              {isArranging ? t("layout.done") : t("layout.arrange")}
                            </button>} />
                          <div>
                            <h4 className="mb-1 font-medium text-foreground">{t("meals.ingredients")}</h4>
                            <RecipeIngredients recipe={recipe} compact mainOnly />
                          </div>
                        </div>
                      )}
                    </RecipeCard>
                  );
                })
              )}
            </div>

            {results.pageCount > 1 && (
              <nav aria-label={t("meals.pagination")} className="mt-4 flex flex-wrap items-center justify-center gap-1" data-testid="results-pagination">
                <button type="button" onClick={() => goToPage(results.page - 1)} disabled={results.page === 1} data-testid="page-prev"
                  className="min-h-11 rounded-full px-3 text-sm text-foreground hover:bg-foreground/5 disabled:opacity-40 disabled:hover:bg-transparent">
                  <span aria-hidden="true">←</span> {t("meals.previous")}
                </button>
                {pageNumbers(results.page, results.pageCount).map((n, i) => n === null
                  ? <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">…</span>
                  : <button key={n} type="button" onClick={() => goToPage(n)} aria-current={n === results.page ? "page" : undefined}
                      aria-label={t("meals.pageN", { n })} data-testid={`page-${n}`}
                      className={`min-h-11 min-w-11 rounded-full text-sm tabular-nums ${n === results.page ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-accent"}`}>{n}</button>)}
                <button type="button" onClick={() => goToPage(results.page + 1)} disabled={results.page === results.pageCount} data-testid="page-next"
                  className="min-h-11 rounded-full px-3 text-sm text-foreground hover:bg-foreground/5 disabled:opacity-40 disabled:hover:bg-transparent">
                  {t("meals.next")} <span aria-hidden="true">→</span>
                </button>
              </nav>
            )}

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


/** The Week as a cooking plan (docs/cooking-plan.md): seven dated days, each listing the dishes cooked that day. The draft
 * is made once per week (plan.proposed); edits change one dish or one day and never regenerate the rest. Approve cooking
 * plan / Save changes copy the dishes to `approved`, which is what Groceries use. */
function WeekCalendar() {
  const [, setLocation] = useLocation();
  const { lang } = useI18n();
  const t = usePlannerCopy();
  const household = useHouseholdCopy();
  const { toast } = useToast();
  const settings = useSavedSettings();
  const requested = new URLSearchParams(useSearch()).get("week");
  const week = requested && isWeek(requested) ? requested : currentWeek();
  usePilotPage("planner_opened", week);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ week: string; plan: PlanState } | null>(null);

  useEffect(() => {
    let active = true;
    setFailed(false);
    fetchRecipes().then(data => active && setRecipes(toPlannerRecipes(data))).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [attempt]);

  // The Week → Plan filters narrow the draft and the picker.
  const fits = useCallback((r: Recipe) => matchesPlannerFilters(r, loadWeekFilters(), "total", getRecipeUserMeta(r.id)), []);
  // No recipe left with the Deal: keep the other filters (the time limit above all) before dropping them all.
  const fallback = useCallback((r: Recipe) => matchesPlannerFilters(r, { ...loadWeekFilters(), deal: null }, "total", getRecipeUserMeta(r.id)), []);
  // Cooking days: asked on first use, before the first draft (2026-11-21); "Cooking days" below the days reopens it.
  const [schedule, setSchedule] = useState<HouseholdSetup | null>(null);
  const [firstSchedule, setFirstSchedule] = useState(false);
  /** Once per week: cooking days that already have a dish keep it; the others get one. */
  const draftWeek = (plan: PlanState) => {
    const shown = proposeCookingPlan(plan, recipes ?? [], loadSettings(), week, { fits, fallback }).plan;
    try { saveWeek(week, shown); } catch { /* shown anyway; saved with the next change */ }
    try { updateSettings(s => ({ ...s, setup: { ...s.setup, plannedWith: planKey(s, planFilters()) } })); } catch { /* asks again later */ }
    return shown;
  };
  useEffect(() => {
    if (!recipes) return;
    let active = true;
    setLoaded(null);
    fetchWeek(week).then(plan => {
      if (!active) return;
      let shown = plan;
      if (!plan.proposed && plan.approved === null) {
        // Never asked for cooking days and nothing planned: ask first, draft on Plan my week. A saved schedule is reused.
        if (!loadSettings().setup.scheduled && !plan.batches.length) { setSchedule(loadSettings().setup); setFirstSchedule(true); }
        else shown = draftWeek(plan);
      } else if (loadSettings().setup.plannedWith === null && loadSettings().rev > 0) {
        // Settings saved before 2026-11-20 recorded nothing: take them as what this Week was planned with.
        try { updateSettings(s => ({ ...s, setup: { ...s.setup, plannedWith: planKey(s, planFilters()) } })); } catch { /* asks nothing */ }
      }
      setLoaded({ week, plan: shown });
    }).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [week, recipes, fits, fallback]);

  const byId = useMemo(() => new Map((recipes ?? []).map(r => [r.id, r])), [recipes]);
  // Edits apply to the latest plan, also from a toast's Undo rendered before later changes.
  const latest = useRef(loaded);
  latest.current = loaded;
  const save = (plan: PlanState) => {
    const current = latest.current;
    if (!current) return false;
    try { saveWeek(week, plan); } catch { toast({ title: t("saveFailed"), variant: "destructive" }); return false; }
    latest.current = { ...current, plan };
    setLoaded(latest.current);
    return true;
  };
  const commit = (edit: (plan: PlanState) => PlanState) => {
    const current = latest.current;
    if (!current) return false;
    const next = edit(current.plan);
    return next !== current.plan && save(next);
  };

  const range = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: "UTC" })
    .formatRange(new Date(`${week}T12:00:00Z`), new Date(`${addDays(week, 6)}T12:00:00Z`));
  const go = (offset: number) => setLocation(`/meals?week=${addDays(week, offset)}`);
  const ready = loaded?.week === week ? loaded : null;
  const status = ready ? statusOf(ready.plan) : null;
  // Preferences that change dishes were saved after this Week was planned: ask once per change (product owner, 2026-11-20).
  // ponytail: one key for all weeks; a later week planned with the new settings also clears the question for this one.
  const [asked, setAsked] = useState<string | null>(null);
  const key = planKey(settings, planFilters());
  const prefsChanged = !!ready && !schedule && week >= currentWeek() && ready.plan.batches.length > 0 && !!recipes
    && settings.setup.plannedWith !== null && settings.setup.plannedWith !== key && asked !== key;
  const acknowledge = (suggested?: string[]) => {
    setAsked(key);
    try { updateSettings(s => ({ ...s, setup: { ...s.setup, plannedWith: planKey(s, planFilters()), ...(suggested ? { suggested, declined: [] } : {}) } })); } catch { /* asked again next visit */ }
  };
  const updateWeek = () => {
    const current = latest.current;
    if (!current || !recipes) return;
    const result = proposeCookingPlan({ ...current.plan, batches: [] }, recipes, loadSettings(), week, { fits, fallback });
    if (save(result.plan)) acknowledge(result.suggested);
  };
  const approve = () => {
    // From the latest plan, so a second tap (or a retry) on an already approved plan does nothing.
    const current = latest.current?.week === week ? latest.current.plan : null;
    if (!current || !current.batches.length || statusOf(current) === "approved" || !save(approvePlan(current))) return;
    recordPilotEvent("plan_completed", week);
    // The suggested-dinner draft bookkeeping (Your household) ends with approval.
    try { updateSettings(s => ({ ...s, setup: { ...s.setup, suggested: [], declined: [] } })); } catch { /* the approval is what matters */ }
  };
  const saveSchedule = () => {
    if (!schedule || overCount(schedule)) return;
    const { evenings, fixedDays, challenge } = schedule;
    try { updateSettings(s => ({ ...s, setup: { ...s.setup, evenings, fixedDays, challenge, scheduled: true } })); }
    catch { toast({ title: t("saveFailed"), variant: "destructive" }); return; }
    setSchedule(null); setFirstSchedule(false);
    // An empty week is drafted now; a week with dishes asks "Your preferences have been changed" (prefsChanged).
    const current = latest.current;
    if (current && !current.plan.batches.length) { latest.current = { ...current, plan: draftWeek(current.plan) }; setLoaded(latest.current); }
  };
  const planned = ready ? ready.plan.batches.flatMap(b => byId.get(b.recipeId) ?? []) : [];
  const deals = weekDeals(foodDeals, week, planned, settings.shopping.stores.map(storeName));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageContainer size="xl" className="flex-1 py-4 sm:py-6">
        {/* Approval sits in the header, so it is reachable before scrolling; on a phone it wraps below the date range. */}
        <header className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3" data-testid="week-header">
          <div className="min-w-0 flex-1">
            <h1 className="page-title">{t("title")}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => go(-7)} aria-label={t("prevWeek")} data-testid="button-prev-week"
                  className="-ms-3 flex h-11 w-11 items-center justify-center rounded-full hover:bg-foreground/5"><ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /></button>
                <p className="text-base text-foreground" data-testid="week-range" data-week={week}>{range}</p>
                <button type="button" onClick={() => go(7)} aria-label={t("nextWeek")} data-testid="button-next-week"
                  className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-foreground/5"><ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /></button>
              </div>
              {status && <p role="status" data-testid="week-status" data-state={status}
                className={`rounded-full px-3 py-1 text-sm font-medium ${status === "approved" ? "bg-primary text-white" : status === "changed" ? "bg-amber-50 text-amber-900" : "bg-accent text-primary"}`}>
                {status === "approved" ? t("statusApproved") : status === "changed" ? t("statusChanged") : t("statusDraft")}</p>}
            </div>
          </div>
          {ready && <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end" data-testid="week-actions">
            {status === "approved" ? (
              <button type="button" onClick={() => setLocation(week === currentWeek() ? "/grocery-list" : `/grocery-list?week=${week}`)} data-testid="button-view-groceries"
                className="btn btn-primary">{t("groceries")}</button>
            ) : (
              <>
                <button type="button" onClick={approve} disabled={!ready.plan.batches.length} aria-describedby="approve-hint"
                  data-testid="button-approve-week" className="btn btn-primary">{status === "changed" ? t("saveChanges") : t("approve")}</button>
                <p id="approve-hint" className="text-xs text-muted-foreground">{status === "changed" ? t("changedHint") : t("approveHint")}</p>
              </>
            )}
          </div>}
        </header>

        {failed ? (
          <div className="card max-w-xl p-5" role="alert">
            <p className="mb-3 text-sm text-foreground">{t("loadFailed")}</p>
            <button type="button" onClick={() => setAttempt(n => n + 1)} className="btn btn-primary">{t("retry")}</button>
          </div>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground" role="status">{t("loading")}</p>
        ) : schedule ? (
          <section className="card max-w-xl p-4 sm:p-5" aria-labelledby="schedule-title" data-testid="schedule-panel">
            <h2 id="schedule-title" className="text-base font-semibold">{household("scheduleTitle")}</h2>
            <p className="text-sm text-muted-foreground">{household("scheduleIntro")}</p>
            <CookingDays setup={schedule} onChange={patch => setSchedule(s => s && { ...s, ...patch })} />
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={saveSchedule} disabled={overCount(schedule)} className="btn btn-primary" data-testid="button-save-schedule">
                {firstSchedule ? household("planWeek") : household("save")}</button>
              {!firstSchedule && <button type="button" onClick={() => setSchedule(null)} className="btn btn-secondary" data-testid="button-cancel-schedule">{household("cancel")}</button>}
            </div>
          </section>
        ) : (
          <>
            <WeekDeals offers={deals} lang={lang} />
            <PlannerBoard plan={ready.plan} week={week} today={week === currentWeek() ? calendarDate(new Date()) : null} lang={lang} recipes={byId}
              commit={commit} recipeHref={b => plannerRecipeURL(b.recipeId, week, b.id)} household={householdCounts(settings)}
              onPicked={id => {
                recordPilotEvent("meal_selected", week, id);
                // Learning signal: an AI recipe was put on the plan (not that it was cooked).
                if (byId.get(id) && isGeneratedRecipe(byId.get(id)!)) reportGenerationEvent("generated_recipe_added_to_plan");
              }}
              options={(day, meal) => dishOptions(recipes ?? [], settings, day, { seed: week, fits, fallback, chosen: planned, meal })}
              warning={batch => {
                // The one rule, for this dish's meal and cooking day: a dish planned before the preferences changed is flagged, never removed.
                const recipe = byId.get(batch.recipeId);
                const fit = recipe && checkEligibility(recipe, settings, undefined, mealOf(batch), weekdayOf(batch.cookDate));
                return fit && !fit.eligible ? household("noLongerFits", { why: fit.reasons.map(r => restrictionText(lang, r, id => settings.household.members.find(m => m.id === id)?.name ?? null)).join(", ") }) : null;
              }} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/meals?browse" className="btn btn-text -ms-2" data-testid="link-browse-recipes">{t("browse")}</Link>
              <button type="button" onClick={() => setSchedule(loadSettings().setup)} className="btn btn-text" data-testid="button-cooking-days">{household("cookingDays")}</button>
              <Link href={personalizeURL(week === currentWeek() ? "/meals?plan" : `/meals?week=${week}`)} className="btn btn-text" data-testid="link-personalize-week">{household("personalize")}</Link>
              <Link href="/household" className="btn btn-text" data-testid="link-household">{household("changeHousehold")}</Link>
            </div>
          </>
        )}
        <AlertDialog open={prefsChanged} onOpenChange={open => { if (!open) acknowledge(); }}>
          <AlertDialogContent data-testid="prefs-changed">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("prefsChanged")}</AlertDialogTitle>
              <AlertDialogDescription>{t("prefsChangedBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-keep-week">{t("keepWeek")}</AlertDialogCancel>
              <AlertDialogAction data-testid="button-update-week" onClick={updateWeek}>{t("updateWeek")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </div>
  );
}
