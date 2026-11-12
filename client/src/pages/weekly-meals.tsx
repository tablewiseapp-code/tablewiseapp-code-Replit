import { useState, useEffect, useCallback, useMemo, useDeferredValue } from "react";
import { Search, X } from "lucide-react";
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
import { matchesPlannerFilters, recipeNameMatches } from "@/lib/planner-filters";
import { availableDevices, methodChoices, useSavedSettings } from "@/lib/basic-settings";
import { cuisines, recipeCuisine } from "@shared/food-rules";
import { ActivePreferences } from "@/components/active-preferences";
import { limitingReasons, matchCounts } from "@/lib/active-preferences";
import { checkEligibility, fillWeek, personalize, suggestReplacement } from "@/lib/preference-engine";
import { restrictionText, settingsText } from "@/lib/settings-copy";
import { RecipeSearchGeneration } from "@/components/recipe-search-generation";
import { searchGenerationRequest } from "@/lib/recipe-drafts";
import { generateCopy } from "@/lib/generate-recipe-copy";
import type { Recipe as StoredRecipe } from "@/lib/storage";
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
import { mealSlots, plannedSlotCount, totalSlots, writePlan, type MealSlot, type PlanState } from "@/lib/meal-plan";
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
  cuisine: string[];
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
  cuisine: [],
};

const defaultState: WeeklyMealsState = {
  filters: defaultFilters,
  selectedIds: [],
  expandedSections: ["mealType", "time", "protein"],
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
      const parsed = JSON.parse(saved);
      // Merge filters too, so a filter added later (e.g. cuisine) has its default for returning users.
      return { ...defaultState, ...parsed, filters: { ...defaultFilters, ...parsed.filters } };
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
  // My Basic Settings are the baseline: loaded on open, refreshed when they change in another tab or on return.
  const settings = useSavedSettings();
  const devices = availableDevices(settings);
  const sText = (key: string, values?: Record<string, string | number>) => settingsText(lang, key, values);
  const [state, setState] = useState<WeeklyMealsState>(() => {
    // Drop a saved cooking-method filter for a device the person no longer has.
    const saved = loadState(), allowed: readonly string[] = methodChoices(devices);
    return { ...saved, filters: { ...saved.filters, cookingMethod: saved.filters.cookingMethod.filter(m => allowed.includes(m)) } };
  });
  useEffect(() => {
    // Temporary filters stay, except a cooking method for a device the person no longer has.
    const allowed: readonly string[] = methodChoices(availableDevices(settings));
    setState(prev => {
      const cookingMethod = prev.filters.cookingMethod.filter(m => allowed.includes(m));
      return cookingMethod.length === prev.filters.cookingMethod.length ? prev : { ...prev, filters: { ...prev.filters, cookingMethod } };
    });
  }, [settings]);
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
  // Recipe name search; works together with the filters. Deferred so typing stays responsive on long lists.
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search).trim();
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
    count += state.filters.cuisine.length;
    return count;
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
    matchesPlannerFilters(recipe, filters, timeMode, getMeta(recipe.id));
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

  // AI generation from the current filters. Saving uses the normal recipe API; the recipe then joins the selection.
  const generation = mealsGenerationBody(state.filters, timeMode);
  const filterLabel: Record<string, string> = {
    "Vegetarian": t("meals.vegetarian"), "Kid friendly": t("meals.kidFriendly"), "Gluten-free": t("meals.glutenFree"),
    "Breakfast": t("meals.breakfast"), "Lunch": t("meals.lunch"), "Dinner": t("meals.dinner"), "Lunch box": t("meals.lunchBox"),
    "Oven": t("meals.oven"), "Air fryer": t("meals.airFryer"), "Stovetop": t("meals.stovetop"), "Microwave": t("meals.microwave"), "No-cook": t("meals.noCook"),
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
    myPicks: t("meals.showOnlyMyPicks"), minRating: t("meals.minimumRating"), cuisine: t("meals.cuisine"),
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
  // Search with no result: same name but other filters (explained to the customer), and the AI request for that name.
  const nameOnly = query ? eligibleRecipes.filter(r => recipeNameMatches(r.title, query) && !filteredRecipes.includes(r)) : [];
  const searchRequest = searchGenerationRequest(query, state.filters, timeMode);
  const searchChips = [
    ...(g.maxMinutes !== null ? [{ label: generationChips[0], remove: () => updateFilters({ maxMinutes: null }) }] : []),
    ...(["dietary", "mealType", "cookingMethod", "proteinType"] as const).flatMap(key =>
      state.filters[key].map(value => ({ label: filterLabel[value] ?? value, remove: () => toggleArrayFilter(key, value) }))),
    ...(g.servings ? [{ label: `${t("meals.servingsFilter")}: ${g.servings}`, remove: () => updateFilters({ servings: null }) }] : []),
    ...g.mustInclude.map(term => ({ label: `${t("meals.mustInclude")}: ${term}`, remove: () => removeIncludeIngredient(term) })),
    ...g.mustExclude.map(term => ({ label: `${t("meals.mustExclude")}: ${term}`, remove: () => removeExcludeIngredient(term) })),
  ];
  const reloadRecipes = () => { fetchRecipes().then(data => setRecipes(toPlannerRecipes(data))).catch(() => undefined); };
  const publishedFromSearch = (saved: StoredRecipe) => {
    setRecipes(prev => [...prev.filter(r => r.id !== saved.id), toPlannerRecipe(saved)]);
    if (state.selectedIds.length < 12) setState(prev => ({ ...prev, selectedIds: [...new Set([...prev.selectedIds, saved.id])] }));
    else setMaxSelectionsHit(true);
    toast({ title: generateCopy(lang, "published"), description: saved.title });
  };
  const activeFilterCount = countActiveFilters();
  // Cuisines present in the recipes you can cook (plus any already chosen, so it can be removed).
  const cuisineOptions = cuisines.filter(c => state.filters.cuisine.includes(c) || eligibleRecipes.some(r => recipeCuisine(r.tags) === c));
  // Every temporary filter as a removable chip. My Basic Settings are not here: they are always applied.
  const sourceLabel: Record<string, string> = { "My recipes": t("meals.myRecipes"), "Imported": t("meals.imported"), "Trusted authors": t("meals.trustedAuthors"), "Personal": t("meals.personal") };
  const activeFilterChips = [
    ...searchChips,
    ...state.filters.cuisine.map(c => ({ label: `${t("meals.cuisine")}: ${sText(`cuisine_${c}`)}`, remove: () => toggleArrayFilter("cuisine", c) })),
    ...state.filters.source.map(src => ({ label: sourceLabel[src] ?? src, remove: () => toggleArrayFilter("source", src) })),
    ...(state.filters.myPicks ? [{ label: t("meals.showOnlyMyPicks"), remove: () => updateFilters({ myPicks: false, minRating: null }) }] : []),
    ...(state.filters.myPicks && state.filters.minRating !== null ? [{ label: `${t("meals.minimumRating")}: ${state.filters.minRating}*+`, remove: () => updateFilters({ minRating: null }) }] : []),
    ...(state.filters.withNotes ? [{ label: t("meals.withMyNotes"), remove: () => updateFilters({ withNotes: false }) }] : []),
    ...(state.filters.modifiedByMe ? [{ label: t("meals.modifiedByMe"), remove: () => updateFilters({ modifiedByMe: false }) }] : []),
  ];
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
    // Fills empty slots only, from the selected recipes, using My Basic Settings. Never removes or moves anything.
    const autoFill = () => {
      if (weekLocked) { notify(planCopy("locked"), true); return; }
      const result = fillWeek(plan, shortlist, settings, { meta: getMeta });
      if (result.added && commit(() => result.plan)) notify(sText("filled", { count: result.added }));
      else if (!result.added) notify(sText("fillNothing"));
    };
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
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border hairline bg-white p-3" data-testid="fill-week-panel">
                <button type="button" onClick={autoFill} disabled={weekLocked} data-testid="button-fill-week"
                  className="min-h-11 rounded-full bg-[#42624e] px-4 text-sm font-medium text-white hover:bg-[#385540] disabled:opacity-50">{sText("fillWeek")}</button>
                <p className="min-w-48 flex-1 text-xs text-muted-foreground">{sText("fillWeekHint", { days: settings.planning.cookingDays })}{" "}
                  <button type="button" onClick={() => setLocation("/settings")} className="font-medium text-[#42624e] underline" data-testid="link-settings-plan">{sText("changeSettings")}</button></p>
              </div>
              <PlannerBoard recipes={shortlist} plan={plan} locked={weekLocked} commit={commit} notify={notify} dayNames={dayNames} mealNames={Object.values(mealNames)}
                onView={id => setLocation(`/recipe/${encodeURIComponent(id)}`)}
                fitsMeal={(r, meal) => r.mealType === meal && checkEligibility(r, settings, undefined, meal).eligible} othersLabel={sText("pickOthers")} />
            </>
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
              className="min-h-12 w-full rounded-full border border-[#d9dfd4] bg-white ps-10 pe-12 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#496c5a] [&::-webkit-search-cancel-button]:hidden" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label={generateCopy(lang, "searchClear")} data-testid="recipe-search-clear"
              className="absolute end-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>}
          </div>
        </form>
        <RecipeTimeToggle />
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          
          <aside id="meal-filters" className="w-full lg:w-[240px] lg:flex-shrink-0 scroll-mt-4">
            <div className="lg:sticky lg:top-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground" data-testid="additional-filters-count">{t("meals.filters", { count: activeFilterCount })}</span>
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
              <p className="mb-2 text-xs text-muted-foreground" aria-live="polite" data-testid="sidebar-matching" data-count={filteredRecipes.length}>
                {filteredRecipes.length === 1 ? t("meals.matchingCountOne") : t("meals.matchingCount", { count: filteredRecipes.length })}
              </p>
              {activeFilterChips.length > 0 && (
                <ul aria-label={t("meals.activeFilters")} className="mb-4 flex flex-wrap gap-1.5" data-testid="active-filter-chips">
                  {activeFilterChips.map(chip => (
                    <li key={chip.label}>
                      <button type="button" onClick={chip.remove} aria-label={t("meals.removeFilter", { label: chip.label })} data-testid="active-filter-chip"
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#d9dfd4] bg-white ps-3 pe-2 text-xs text-foreground hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#496c5a]">
                        {chip.label}<X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-b hairline pb-3 mb-3" data-filter-section="mealType">
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
                          {(mealSlots as readonly string[]).includes(type) && recipes.length > 0 && (
                            <span className="ms-1 text-muted-foreground" data-testid={`meal-count-${type.toLowerCase()}`}>· {sText("mealCount", { count: mealCount(type as MealSlot) })}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3" data-filter-section="time">
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

              <div className="border-b hairline pb-3 mb-3" data-filter-section="protein">
                <button
                  onClick={() => toggleSection("protein")}
                  className="flex items-center justify-between w-full text-start min-h-11"
                  data-testid="button-toggle-protein"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.proteinType")}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("protein") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("protein") && (
                  <div className="mt-3">
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
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3" data-filter-section="ingredients">
                <button
                  onClick={() => toggleSection("ingredients")}
                  className="flex items-center justify-between w-full text-start min-h-11"
                  data-testid="button-toggle-ingredients"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("meals.ingredients")}</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("ingredients") ? "-" : "+"}</span>
                </button>
                {state.expandedSections.includes("ingredients") && (
                  <div className="mt-3">
                  <div className="pb-3">
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
                  </div>
                )}
              </div>

              <div className="border-b hairline pb-3 mb-3" data-filter-section="dietary">
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

              <div className="border-b hairline pb-3 mb-3" data-filter-section="method">
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
                    {methodChoices(devices).map(method => {
                      const methodTranslations: Record<string, string> = {
                        "Oven": t("meals.oven"),
                        "Air fryer": t("meals.airFryer"),
                        "Stovetop": t("meals.stovetop"),
                        "Microwave": t("meals.microwave"),
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

              <div className="border-b hairline pb-3 mb-3" data-filter-section="source">
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
                  <div className="border-b hairline pb-3 mb-3" data-filter-section="cuisine">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">{t("meals.cuisine")}</span>
                    <div className="flex flex-wrap gap-2">
                      {cuisineOptions.map(cuisine => (
                        <button
                          key={cuisine}
                          onClick={() => toggleArrayFilter("cuisine", cuisine)}
                          aria-pressed={state.filters.cuisine.includes(cuisine)}
                          className={`px-3 py-2 min-h-11 text-xs rounded-full border hairline ${state.filters.cuisine.includes(cuisine) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`filter-cuisine-${cuisine.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {sText(`cuisine_${cuisine}`)}
                        </button>
                      ))}
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
                    const fit = checkEligibility(recipe, settings, undefined, mealSlots.find(m => m === recipe.mealType));
                    const replacement = fit.eligible ? null : suggestReplacement(recipe, recipes, state.selectedIds, settings, { meta: getMeta });
                    return (
                      <div key={recipe.id}>
                      <div
                        className={`flex items-center gap-2 sm:gap-3 p-3 bg-white rounded-lg border ${fit.eligible ? "hairline" : "border-amber-300"}`}
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
                      {!fit.eligible && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert" data-testid={`incompatible-${recipe.id}`}>
                          <span>{sText("incompatible")}: {fit.reasons.map(r => restrictionText(lang, r, memberName)).join("; ")}</span>
                          {replacement
                            ? <button type="button" onClick={() => replaceSelected(recipe.id, replacement.id)} disabled={weekLocked} data-testid={`replace-${recipe.id}`}
                                className="min-h-9 rounded-full border border-amber-300 bg-white px-3 font-medium hover:bg-amber-100 disabled:opacity-50">{sText("replaceWith", { title: replacement.title })}</button>
                            : <span className="text-amber-700">{sText("noReplacement")}</span>}
                        </div>
                      )}
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

            {!query && visibleFilteredRecipes.length > 0 && <div className="mb-3 flex justify-end"><GenerateRecipe request={generationRequest} variant="button" onAccept={acceptGenerated} /></div>}
            <div id="meal-results" className="space-y-2 scroll-mt-4">
              {recipes.length > 0 && eligibleRecipes.length === 0 ? (
                // Every recipe breaks a hard restriction: say which ones, never fall back to incompatible suggestions.
                <div className="rounded-xl border hairline bg-white p-5" role="status" data-testid="no-match-settings">
                  <h2 className="text-base font-medium text-foreground">{sText("noMatchTitle")}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{sText("noMatchBody")}</p>
                  <ul className="mt-1 list-disc ps-5 text-sm text-muted-foreground">
                    {limitingReasons(personalized.excluded, lang, memberName).map(reason => <li key={reason}>{reason}</li>)}
                  </ul>
                  <button type="button" onClick={() => setLocation("/settings")} data-testid="button-no-match-edit"
                    className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#42624e] px-4 text-sm font-medium text-white hover:bg-[#385540]">{sText("editPrefs")}</button>
                </div>
              ) : query && query.length >= 2 && filteredRecipes.length === 0 ? (
                <RecipeSearchGeneration key={JSON.stringify(searchRequest.body)} query={query} request={searchRequest.body}
                  chips={searchChips} notApplied={searchRequest.notApplied.map(key => notAppliedLabel[key])} nameOnly={nameOnly}
                  violationLabel={violationLabel} onPublished={publishedFromSearch} onExisting={reloadRecipes}
                  onEditFilters={() => document.getElementById("meal-filters")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
              ) : query && visibleFilteredRecipes.length === 0 ? null : visibleFilteredRecipes.length === 0 ? (
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
                            {likedNote.has(recipe.id) && <p className="mt-0.5 text-[11px] text-[#42624e]" data-testid={`recipe-liked-${recipe.id}`}>{likedNote.get(recipe.id)}</p>}
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
        {/* The top button scrolls away while picking recipes; keep the next step in reach. */}
        {canGenerate && (
          <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-end gap-3 border-t border-[#d9dfd4] bg-background/95 px-4 py-3 backdrop-blur" data-testid="selection-next-bar">
            <p className="me-auto text-sm text-muted-foreground">{t("meals.selected", { count: state.selectedIds.length })}</p>
            <button type="button" onClick={generatePlan} data-testid="button-generate-plan-sticky"
              className="min-h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90">
              {t("meals.generateWeeklyPlan")}
            </button>
          </div>
        )}
      </PageContainer>
    </div>
  );
}

