import { useState, useEffect, useCallback } from "react";

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

interface Filters {
  maxMinutes: number | null;
  dietary: string[];
  mealType: string[];
  cookingMethod: string[];
  source: string[];
  proteinType: string[];
  withNotes: boolean;
  modifiedByMe: boolean;
  servings: string | null;
  mustInclude: string[];
  mustExclude: string[];
}

interface WeeklyMealsState {
  filters: Filters;
  selectedIds: string[];
  expandedSections: string[];
  showMoreFilters: boolean;
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
];

const defaultFilters: Filters = {
  maxMinutes: null,
  dietary: [],
  mealType: [],
  cookingMethod: [],
  source: [],
  proteinType: [],
  withNotes: false,
  modifiedByMe: false,
  servings: null,
  mustInclude: [],
  mustExclude: [],
};

const defaultState: WeeklyMealsState = {
  filters: defaultFilters,
  selectedIds: [],
  expandedSections: ["time", "dietary"],
  showMoreFilters: false,
};

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
  const [state, setState] = useState<WeeklyMealsState>(loadState);
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [maxSelectionsHit, setMaxSelectionsHit] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

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
    if (state.filters.servings) count++;
    count += state.filters.mustInclude.length;
    count += state.filters.mustExclude.length;
    return count;
  };

  const filterRecipes = (): Recipe[] => {
    return sampleRecipes.filter(recipe => {
      if (state.filters.maxMinutes !== null && recipe.minutes > state.filters.maxMinutes) return false;
      if (state.filters.dietary.length > 0) {
        const hasDietary = state.filters.dietary.every(d => {
          if (d === "Vegetarian") return recipe.tags.includes("vegetarian");
          if (d === "Kid friendly") return recipe.tags.includes("kidFriendly");
          if (d === "Gluten-free") return recipe.tags.includes("glutenFree");
          return true;
        });
        if (!hasDietary) return false;
      }
      if (state.filters.mealType.length > 0 && !state.filters.mealType.includes(recipe.mealType)) return false;
      if (state.filters.cookingMethod.length > 0) {
        const hasMethod = state.filters.cookingMethod.some(m => recipe.tools.includes(m));
        if (!hasMethod) return false;
      }
      if (state.filters.source.length > 0 && !state.filters.source.includes(recipe.sourceType)) return false;
      if (state.filters.proteinType.length > 0 && !state.filters.proteinType.includes(recipe.proteinType)) return false;
      if (state.filters.withNotes && !recipe.hasNotes) return false;
      if (state.filters.modifiedByMe && !recipe.modifiedByMe) return false;
      if (state.filters.servings) {
        if (!recipe.servingsRange.includes(state.filters.servings.replace("+", ""))) return false;
      }
      if (state.filters.mustInclude.length > 0) {
        const hasAll = state.filters.mustInclude.every(ing => 
          recipe.ingredients.some(i => i.toLowerCase().includes(ing))
        );
        if (!hasAll) return false;
      }
      if (state.filters.mustExclude.length > 0) {
        const hasExcluded = state.filters.mustExclude.some(ing => 
          recipe.ingredients.some(i => i.toLowerCase().includes(ing))
        );
        if (hasExcluded) return false;
      }
      return true;
    });
  };

  const filteredRecipes = filterRecipes();
  const activeFilterCount = countActiveFilters();
  const canGenerate = state.selectedIds.length >= 6;

  const generatePlan = () => {
    if (canGenerate) {
      setPlanGenerated(true);
    }
  };

  const getSelectedRecipes = () => {
    return sampleRecipes.filter(r => state.selectedIds.includes(r.id));
  };

  if (planGenerated) {
    const selectedRecipes = getSelectedRecipes();
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Brand Bar */}
        <header className="border-b hairline px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
              <span className="text-xs font-medium text-foreground">TW</span>
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">Tablewise</span>
              <span className="text-xs text-muted-foreground ml-2">Calm weekly planning</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-medium text-foreground mb-4">Weekly plan created.</h1>
            <ul className="text-left space-y-2 mb-8">
              {selectedRecipes.map(recipe => (
                <li key={recipe.id} className="text-sm text-muted-foreground">
                  • {recipe.title}
                </li>
              ))}
            </ul>
            <button 
              onClick={() => setPlanGenerated(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="button-back-to-selection"
            >
              Back to selection
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Brand Bar */}
      <header className="border-b hairline px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
            <span className="text-xs font-medium text-foreground">TW</span>
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">Tablewise</span>
            <span className="text-xs text-muted-foreground ml-2">Calm weekly planning</span>
          </div>
        </div>
        <nav className="flex items-center gap-6">
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">How it works</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Plan</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Cost</a>
          <button className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 border hairline rounded-lg" data-testid="button-login">
            Log in
          </button>
        </nav>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex justify-center p-6">
        <div className="w-full max-w-[1200px] flex gap-6">
          
          {/* Left Filter Rail */}
          <aside className="w-[240px] flex-shrink-0">
            <div className="sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-foreground">Filters ({activeFilterCount})</span>
                {activeFilterCount > 0 && (
                  <button 
                    onClick={clearAllFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="button-clear-filters"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Time Filter */}
              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("time")}
                  className="flex items-center justify-between w-full text-left"
                  data-testid="button-toggle-time"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Max minutes</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("time") ? "−" : "+"}</span>
                </button>
                {state.expandedSections.includes("time") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[null, 20, 30, 40, 60].map(mins => (
                      <button
                        key={mins ?? "any"}
                        onClick={() => updateFilters({ maxMinutes: mins })}
                        className={`px-3 py-1 text-xs rounded-full border hairline ${state.filters.maxMinutes === mins ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        data-testid={`filter-time-${mins ?? "any"}`}
                      >
                        {mins ?? "Any"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dietary Filter */}
              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("dietary")}
                  className="flex items-center justify-between w-full text-left"
                  data-testid="button-toggle-dietary"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Dietary</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("dietary") ? "−" : "+"}</span>
                </button>
                {state.expandedSections.includes("dietary") && (
                  <div className="mt-3 space-y-2">
                    {["Vegetarian", "Kid friendly", "Gluten-free"].map(diet => (
                      <label key={diet} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.filters.dietary.includes(diet)}
                          onChange={() => toggleArrayFilter("dietary", diet)}
                          className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                          data-testid={`filter-dietary-${diet.toLowerCase().replace(" ", "-")}`}
                        />
                        <span className="text-xs text-muted-foreground">{diet}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Meal Type Filter */}
              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("mealType")}
                  className="flex items-center justify-between w-full text-left"
                  data-testid="button-toggle-mealtype"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Meal type</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("mealType") ? "−" : "+"}</span>
                </button>
                {state.expandedSections.includes("mealType") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["Breakfast", "Lunch", "Dinner", "Lunch box"].map(type => (
                      <button
                        key={type}
                        onClick={() => toggleArrayFilter("mealType", type)}
                        className={`px-3 py-1 text-xs rounded-full border hairline ${state.filters.mealType.includes(type) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        data-testid={`filter-meal-${type.toLowerCase().replace(" ", "-")}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cooking Method Filter */}
              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("method")}
                  className="flex items-center justify-between w-full text-left"
                  data-testid="button-toggle-method"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Cooking method</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("method") ? "−" : "+"}</span>
                </button>
                {state.expandedSections.includes("method") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["Oven", "Air fryer", "Stovetop", "No-cook"].map(method => (
                      <button
                        key={method}
                        onClick={() => toggleArrayFilter("cookingMethod", method)}
                        className={`px-3 py-1 text-xs rounded-full border hairline ${state.filters.cookingMethod.includes(method) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        data-testid={`filter-method-${method.toLowerCase().replace(" ", "-")}`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Source Filter */}
              <div className="border-b hairline pb-3 mb-3">
                <button 
                  onClick={() => toggleSection("source")}
                  className="flex items-center justify-between w-full text-left"
                  data-testid="button-toggle-source"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Source</span>
                  <span className="text-xs text-muted-foreground">{state.expandedSections.includes("source") ? "−" : "+"}</span>
                </button>
                {state.expandedSections.includes("source") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["My recipes", "Imported", "Trusted authors", "Personal"].map(src => (
                      <button
                        key={src}
                        onClick={() => toggleArrayFilter("source", src)}
                        className={`px-3 py-1 text-xs rounded-full border hairline ${state.filters.source.includes(src) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        data-testid={`filter-source-${src.toLowerCase().replace(" ", "-")}`}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* More Filters Toggle */}
              <button 
                onClick={() => setState(prev => ({ ...prev, showMoreFilters: !prev.showMoreFilters }))}
                className="text-xs text-muted-foreground hover:text-foreground mb-3"
                data-testid="button-more-filters"
              >
                {state.showMoreFilters ? "− Less filters" : "+ More filters"}
              </button>

              {state.showMoreFilters && (
                <>
                  {/* Protein Type Filter */}
                  <div className="border-b hairline pb-3 mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">Protein type</span>
                    <div className="flex flex-wrap gap-2">
                      {["Chicken", "Beef", "Seafood", "Plant-based"].map(protein => (
                        <button
                          key={protein}
                          onClick={() => toggleArrayFilter("proteinType", protein)}
                          className={`px-3 py-1 text-xs rounded-full border hairline ${state.filters.proteinType.includes(protein) ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`filter-protein-${protein.toLowerCase().replace("-", "")}`}
                        >
                          {protein}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggle Filters */}
                  <div className="border-b hairline pb-3 mb-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state.filters.withNotes}
                        onChange={() => updateFilters({ withNotes: !state.filters.withNotes })}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                        data-testid="filter-with-notes"
                      />
                      <span className="text-xs text-muted-foreground">With my notes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state.filters.modifiedByMe}
                        onChange={() => updateFilters({ modifiedByMe: !state.filters.modifiedByMe })}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-current"
                        data-testid="filter-modified"
                      />
                      <span className="text-xs text-muted-foreground">Modified by me</span>
                    </label>
                  </div>

                  {/* Must Include */}
                  <div className="border-b hairline pb-3 mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">Must include</span>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {state.filters.mustInclude.map(ing => (
                        <span key={ing} className="px-2 py-0.5 text-xs bg-foreground/10 rounded-full flex items-center gap-1">
                          {ing}
                          <button onClick={() => removeIncludeIngredient(ing)} className="text-muted-foreground hover:text-foreground">×</button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={includeInput}
                      onChange={(e) => setIncludeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addIncludeIngredient()}
                      placeholder="Type + Enter"
                      className="w-full px-2 py-1 text-xs border hairline rounded bg-transparent focus-ring-quiet"
                      data-testid="input-must-include"
                    />
                  </div>

                  {/* Must Exclude */}
                  <div className="pb-3 mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">Must exclude</span>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {state.filters.mustExclude.map(ing => (
                        <span key={ing} className="px-2 py-0.5 text-xs bg-foreground/10 rounded-full flex items-center gap-1">
                          {ing}
                          <button onClick={() => removeExcludeIngredient(ing)} className="text-muted-foreground hover:text-foreground">×</button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={excludeInput}
                      onChange={(e) => setExcludeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addExcludeIngredient()}
                      placeholder="Type + Enter"
                      className="w-full px-2 py-1 text-xs border hairline rounded bg-transparent focus-ring-quiet"
                      data-testid="input-must-exclude"
                    />
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* Right Results Canvas */}
          <main className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-medium text-foreground">Step 2 — Meals</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose dinners with calm filters. Select 6–12 options. We'll build a week from there.
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm text-muted-foreground">Selected: {state.selectedIds.length} / 12</span>
                {maxSelectionsHit && (
                  <p className="text-xs text-muted-foreground mt-1">Max 12 selections.</p>
                )}
              </div>
            </div>

            {/* Recipe List */}
            <div className="border-t hairline">
              {filteredRecipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No recipes match your filters.</p>
              ) : (
                filteredRecipes.map(recipe => {
                  const isSelected = state.selectedIds.includes(recipe.id);
                  const isExpanded = expandedRecipe === recipe.id;
                  const monogram = getMonogram(recipe.title);
                  const tags = recipe.tags.map(t => {
                    if (t === "vegetarian") return "vegetarian";
                    if (t === "kidFriendly") return "kid friendly";
                    if (t === "glutenFree") return "gluten-free";
                    return t;
                  }).join(" • ");
                  const metadata = `${recipe.minutes} min • ${recipe.mealType.toLowerCase()}${tags ? " • " + tags : ""} • Tools: ${recipe.tools.join(", ").toLowerCase()}`;

                  return (
                    <div key={recipe.id} className={`border-b hairline ${isSelected ? "border-l-2 border-l-foreground/30" : ""}`}>
                      <div 
                        className="flex items-center gap-4 py-4 px-2 cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)}
                        data-testid={`recipe-row-${recipe.id}`}
                      >
                        {/* Monogram */}
                        <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{monogram}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{recipe.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{metadata}</p>
                        </div>

                        {/* Add Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(recipe.id);
                          }}
                          className={`px-4 py-1.5 text-xs rounded-full border hairline flex-shrink-0 ${isSelected ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`button-add-${recipe.id}`}
                        >
                          {isSelected ? "Added" : "Add"}
                        </button>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-16 pb-4" data-testid={`recipe-details-${recipe.id}`}>
                          <p className="text-xs text-muted-foreground mb-2">Ingredients:</p>
                          <p className="text-xs text-muted-foreground">{recipe.ingredients.join(", ")}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Actions */}
            <div className="mt-8 flex items-center justify-between">
              <div>
                <button
                  onClick={generatePlan}
                  disabled={!canGenerate}
                  className={`px-6 py-2.5 text-sm rounded-full ${canGenerate ? "bg-foreground text-background hover:bg-foreground/90" : "bg-foreground/20 text-muted-foreground cursor-not-allowed"}`}
                  data-testid="button-generate-plan"
                >
                  Generate weekly plan
                </button>
                {!canGenerate && (
                  <p className="text-xs text-muted-foreground mt-2">Select at least 6 to generate.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">You can adjust this later.</p>
            </div>

            {/* Footer */}
            <footer className="mt-12 pt-6 border-t hairline text-center">
              <p className="text-xs text-muted-foreground">Built for families—no ads, no sponsored meals.</p>
              <p className="text-xs text-muted-foreground mt-1">v0.1 prototype</p>
              <p className="text-xs text-muted-foreground mt-1">Tablewise | Calm weekly planning</p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
