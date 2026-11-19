import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from "react";
import { usePilotPage } from "@/hooks/use-pilot-page";
import { recordPilotEvent } from "@/lib/pilot-analytics";
import { addDays, currentWeek, isWeek, parseCalendarDate, plannerRecipeURL } from "@/lib/week-plan";
import { proposeWeek, slotOptions, weekOrder } from "@/lib/week-suggestions";
import { useHouseholdCopy } from "@/lib/household-copy";
import { loadWeekFilters } from "@/lib/week-filters";
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
import { FoodDeals } from "@/components/food-deals";
import { useWeekFilterCopy } from "@/lib/week-filter-copy";
import { useFilterLabels, useWeekFilterChips, WeekFilterPanel } from "@/components/week-filter-panel";
import { countWeekFilters, defaultWeekFilters, sanitizeWeekFilters, type WeekFilters } from "@/lib/week-filters";

const SELECTED_PREVIEW = 5; // more selections collapse behind "Show all"
import { availableDevices, householdServings, loadSettings, methodChoices, updateSettings, useSavedSettings } from "@/lib/basic-settings";
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
import { DietaryTags, NutritionRow, RecipeMeta } from "@/components/recipe-summary";
import { MealRecipeFacts, RecipeTimeProvider, RecipeDisplayToolbar, useRecipeTime } from "@/components/recipe-time-display";
import { recipeStageMinutes } from "@/lib/recipe-time";
import { useMvpCopy } from "@/lib/mvp-copy";
import { usePlannerCopy } from "@/lib/planner-copy";
import { fetchWeek, mealSlots, plannedSlotCount, pushWeekPlan, saveWeek, totalSlots, type MealSlot, type PlanState } from "@/lib/meal-plan";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

type Recipe = PlannerRecipe;

type Filters = WeekFilters;

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
  planAssignments: PlanAssignment[];
}

const defaultFilters: Filters = defaultWeekFilters;

const defaultState: WeeklyMealsState = {
  filters: defaultFilters,
  selectedIds: [],
  planAssignments: [],
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
  const browsing = new URLSearchParams(useSearch()).has("browse");
  return <RecipeTimeProvider>{browsing ? <WeeklyMealsContent /> : <WeekCalendar />}</RecipeTimeProvider>;
}

function WeeklyMealsContent() {
  const [, setLocation] = useLocation();
  const { t, lang } = useI18n();
  const { t: timeCopy } = useMvpCopy();
  const { mode: timeMode } = useRecipeTime();
  const { showNutrition } = useRecipeDisplay();
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
  const [weekLocked] = useLocalStorageState<boolean>("week_locked_v1", false);
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
  }, [recipes, state.selectedIds, state.planAssignments]);

  const getMeta = useCallback((recipeId: string): RecipeUserMeta => {
    return recipeMetaMap.get(recipeId) ?? { isMyPick: false, rating: null };
  }, [recipeMetaMap]);

  const dayNames = [t("meals.sun"), t("meals.mon"), t("meals.tue"), t("meals.wed"), t("meals.thu"), t("meals.fri"), t("meals.sat")];
  const mealNames: Record<string, string> = { "Breakfast": t("meals.breakfast"), "Lunch": t("meals.lunch"), "Dinner": t("meals.dinner") };

  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => pushWeekPlan(), [state, weekLocked]); // after both localStorage writes; skips unchanged plans

  const notify = useCallback((title: string, destructive = false) => toast({ title, variant: destructive ? "destructive" : "default" }), [toast]);
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

  // Shared with Your household: the same filters, in the same state, on both pages.
  const setFilters = useCallback((filters: Filters) => setState(prev => ({ ...prev, filters })), []);
  const filterChips = useWeekFilterChips(state.filters, setFilters);
  const updateFilters = useCallback((updates: Partial<Filters>) => {
    setState(prev => ({ ...prev, filters: { ...prev.filters, ...updates } }));
  }, []);



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
    if (weekLocked) { notify(planCopy("locked"), true); return; }
    // Swap in place: the selection order and any planned slots keep their positions.
    setState(prev => ({ ...prev, selectedIds: prev.selectedIds.map(id => (id === oldId ? newId : id)),
      planAssignments: prev.planAssignments.map(a => (a.recipeId === oldId ? { ...a, recipeId: newId } : a)) }));
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
          <Link href="/meals" className="btn btn-primary shrink-0" data-testid="button-back-to-week">{planCopy("backToWeek")}</Link>
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
                            ? <button type="button" onClick={() => replaceSelected(recipe.id, replacement.id)} disabled={weekLocked} data-testid={`replace-${recipe.id}`}
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
            <div id="meal-results" className="space-y-2 scroll-mt-24">
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
                    <article key={recipe.id} className="card p-4" aria-labelledby={`recipe-title-${recipe.id}`} data-testid={`recipe-card-${recipe.id}`}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <h3 id={`recipe-title-${recipe.id}`} className="break-words text-base font-medium leading-snug text-foreground">{recipe.title}</h3>
                          <RecipeMeta recipe={recipe} mode={timeMode} testId={`meals-catalog-meta-${recipe.id}`} />
                          {(meta.isMyPick || meta.rating || likedNote.has(recipe.id)) && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {meta.isMyPick && <span className="tag">{`★ ${t("meals.myPicks")}`}</span>}
                              {meta.rating && <span className="inline-flex items-center gap-1"><StarRating value={meta.rating} onChange={() => {}} readOnly size="sm" /><span className="text-muted-foreground">{meta.rating}/5</span></span>}
                              {likedNote.has(recipe.id) && <span className="text-primary" data-testid={`recipe-liked-${recipe.id}`}>{likedNote.get(recipe.id)}</span>}
                            </div>
                          )}
                          <DietaryTags tags={recipe.tags} testId={`meals-catalog-diet-${recipe.id}`} />
                          {showNutrition && <NutritionRow recipe={recipe} testId={`meals-catalog-nutrition-${recipe.id}`} />}
                        </div>
                        <button type="button" onClick={() => toggleSelection(recipe.id)} aria-pressed={isSelected}
                          aria-label={`${isSelected ? t("meals.added") : t("meals.add")}: ${recipe.title}`}
                          className="btn btn-secondary shrink-0" data-testid={`button-add-${recipe.id}`}>
                          {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                          {isSelected ? t("meals.added") : t("meals.add")}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link href={`/recipe/${recipe.id}`} className="btn btn-text" data-testid={`button-open-${recipe.id}`}
                          aria-label={`${t("card.viewRecipe")}: ${recipe.title}`}>{t("card.viewRecipe")}</Link>
                        <button type="button" onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)} aria-expanded={isExpanded}
                          aria-controls={`recipe-details-${recipe.id}`} className="btn btn-text" data-testid={`button-ingredients-${recipe.id}`}>
                          {isExpanded ? t("card.hideDetails") : t("card.details")}
                        </button>
                      </div>

                      {isExpanded && (
                        <div id={`recipe-details-${recipe.id}`} className="mt-3 space-y-3 border-t hairline pt-3 text-sm" data-testid={`recipe-details-${recipe.id}`}>
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
                    </article>
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


/** Week calendar: the dated week as a complete proposal (7 days × Breakfast, Lunch, Dinner), approved in one action.
 * The proposal is made once per week (plan.proposed); edits change one slot and never regenerate the rest. */
function WeekCalendar() {
  const [, setLocation] = useLocation();
  const { t: app, lang } = useI18n();
  const t = usePlannerCopy();
  const household = useHouseholdCopy();
  const { toast } = useToast();
  const settings = useSavedSettings();
  const { mode: timeMode } = useRecipeTime();
  const { showNutrition } = useRecipeDisplay();
  const requested = new URLSearchParams(useSearch()).get("week");
  const week = requested && isWeek(requested) ? requested : currentWeek();
  usePilotPage("planner_opened", week);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ week: string; plan: PlanState; locked: boolean } | null>(null);
  const notify = useCallback((title: string, destructive = false) => toast({ title, variant: destructive ? "destructive" : "default" }), [toast]);

  useEffect(() => {
    let active = true;
    setFailed(false);
    fetchRecipes().then(data => active && setRecipes(toPlannerRecipes(data))).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [attempt]);

  // The Week filters narrow proposals and the picker (never the meal type: the slot decides that).
  const fits = useCallback((r: Recipe) => matchesPlannerFilters(r, { ...loadWeekFilters(), mealType: [] }, "total", getRecipeUserMeta(r.id)), []);
  useEffect(() => {
    if (!recipes) return;
    let active = true;
    setLoaded(null);
    fetchWeek(week).then(({ plan, locked }) => {
      if (!active) return;
      const known = new Set(recipes.map(r => r.id));
      let shown: PlanState = { ...plan, planAssignments: plan.planAssignments.filter(a => known.has(a.recipeId)) };
      if (!locked && !shown.proposed) {
        // Once per week: keeps what is scheduled (a partial draft) and fills only the empty slots.
        shown = proposeWeek(shown, recipes, loadSettings(), week, fits).plan;
        try { saveWeek(week, shown, false); } catch { /* shown anyway; saved with the next change */ }
      }
      setLoaded({ week, plan: shown, locked });
    }).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [week, recipes, fits]);

  const byId = useMemo(() => new Map((recipes ?? []).map(r => [r.id, r])), [recipes]);
  const save = (plan: PlanState, locked: boolean) => {
    if (!loaded) return false;
    try { saveWeek(week, plan, locked); } catch { notify(t("saveFailed"), true); return false; }
    setLoaded({ ...loaded, plan, locked });
    return true;
  };
  const commit = (edit: (plan: PlanState) => PlanState) => {
    if (!loaded) return false;
    if (loaded.locked) { notify(t("locked"), true); return false; }
    const next = edit(loaded.plan);
    return next !== loaded.plan && save(next, false);
  };

  const date = (offset: number) => parseCalendarDate(addDays(week, offset))!;
  const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang, options);
  const range = fmt({ month: "short", day: "numeric" }).formatRange(date(0), date(6));
  const days = weekOrder.map(day => {
    const d = date((day + 6) % 7);
    return { day, short: fmt({ weekday: "short", day: "numeric" }).format(d), long: fmt({ weekday: "long", month: "short", day: "numeric" }).format(d) };
  });
  const mealNames: Record<MealSlot, string> = { Breakfast: app("meals.breakfast"), Lunch: app("meals.lunch"), Dinner: app("meals.dinner") };
  const go = (offset: number) => setLocation(`/meals?week=${addDays(week, offset)}`);

  const ready = loaded?.week === week ? loaded : null;
  const missing = ready ? totalSlots - plannedSlotCount(ready.plan) : 0;
  const status = !ready ? "" : ready.locked ? t("statusApproved") : missing === 0 ? t("statusReady") : missing === 1 ? t("statusNeededOne") : t("statusNeeded", { count: missing });
  const approve = () => {
    if (!ready || missing > 0 || !save(ready.plan, true)) return;
    recordPilotEvent("plan_completed", week);
    // The suggested-dinner draft bookkeeping (Your household) ends with approval.
    try { updateSettings(s => ({ ...s, setup: { ...s.setup, suggested: [], declined: [] } })); } catch { /* the lock is what matters */ }
  };
  const servingsFallback = householdServings(settings);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageContainer size="xl" className="flex-1 py-4 sm:py-6">
        <header className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2" data-testid="week-header">
          <div className="min-w-0 flex-1">
            <h1 className="page-title">{t("title")}</h1>
            <div className="mt-1 flex items-center gap-1">
              <button type="button" onClick={() => go(-7)} aria-label={t("prevWeek")} data-testid="button-prev-week"
                className="-ms-3 flex h-11 w-11 items-center justify-center rounded-full hover:bg-foreground/5"><ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /></button>
              <p className="text-base text-foreground" data-testid="week-range" data-week={week}>{range}</p>
              <button type="button" onClick={() => go(7)} aria-label={t("nextWeek")} data-testid="button-next-week"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-foreground/5"><ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /></button>
            </div>
          </div>
          {ready && <p role="status" data-testid="week-status" data-state={ready.locked ? "approved" : missing ? "incomplete" : "ready"}
            className={`rounded-full px-3 py-1 text-sm font-medium ${ready.locked ? "bg-primary text-white" : missing ? "bg-amber-50 text-amber-900" : "bg-accent text-primary"}`}>{status}</p>}
        </header>

        {failed ? (
          <div className="card max-w-xl p-5" role="alert">
            <p className="mb-3 text-sm text-foreground">{t("loadFailed")}</p>
            <button type="button" onClick={() => setAttempt(n => n + 1)} className="btn btn-primary">{t("retry")}</button>
          </div>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground" role="status">{t("loading")}</p>
        ) : (
          <>
            <PlannerBoard plan={ready.plan} recipes={byId} locked={ready.locked} commit={commit} notify={notify} days={days} mealNames={mealNames}
              recipeHref={id => plannerRecipeURL(id, week)} servingsFallback={servingsFallback} timeMode={timeMode} showNutrition={showNutrition}
              onPicked={id => {
                recordPilotEvent("meal_selected", week, id);
                // Learning signal: an AI recipe was put on the plan (not that it was cooked).
                if (byId.get(id) && isGeneratedRecipe(byId.get(id)!)) reportGenerationEvent("generated_recipe_added_to_plan");
              }}
              options={slot => slotOptions(recipes ?? [], settings, slot, { seed: week, fits, chosen: (recipes ?? []).filter(r => ready.plan.planAssignments.some(a => a.recipeId === r.id)) })} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/meals?browse" className="btn btn-text -ms-2" data-testid="link-browse-recipes">{t("browse")}</Link>
              <Link href="/household" className="btn btn-text" data-testid="link-household">{household("changeHousehold")}</Link>
            </div>
          </>
        )}

        {ready && (
          <div className="sticky bottom-[var(--app-bottom-nav)] z-10 -mx-4 mt-6 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
            {ready.locked ? (
              <>
                <button type="button" onClick={() => save(ready.plan, false)} data-testid="button-edit-week" className="btn btn-secondary">{t("edit")}</button>
                <button type="button" onClick={() => setLocation(week === currentWeek() ? "/grocery-list" : `/grocery-list?week=${week}`)} data-testid="button-create-grocery-list"
                  className="btn btn-primary">{t("grocery")}</button>
              </>
            ) : (
              <>
                {missing > 0 && <p id="approve-hint" className="text-xs text-muted-foreground sm:me-auto">{t("approveHint")}</p>}
                <button type="button" onClick={approve} disabled={missing > 0} aria-describedby={missing > 0 ? "approve-hint" : undefined}
                  data-testid="button-approve-week" className="btn btn-primary">{t("approve")}</button>
              </>
            )}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
