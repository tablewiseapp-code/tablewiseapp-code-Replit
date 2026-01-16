import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";

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
}

interface WeeklyMealsState {
  filters: Filters;
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

import { StarRating } from "@/components/ui/star-rating";
import { getRecipeUserMeta } from "@/hooks/use-recipe-user-meta";

function DraggableRecipe({ recipe, isInPlan }: { recipe: Recipe; isInPlan: boolean }) {
  const meta = getRecipeUserMeta(recipe.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `recipe-${recipe.id}`,
    data: { recipe },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`p-3 bg-[#FAFAF8] rounded-lg border hairline cursor-grab ${isDragging ? "opacity-50" : ""} ${isInPlan ? "border-[#7A9E7E]" : ""}`}
      data-testid={`draggable-recipe-${recipe.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground truncate">{recipe.title}</p>
        {meta.isMyPick && <span className="text-[10px] text-yellow-500">★</span>}
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="text-[10px] text-muted-foreground">{recipe.minutes} min</p>
        {meta.rating && (
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] font-medium text-yellow-600">{meta.rating}</span>
            <span className="text-[8px] text-yellow-600">★</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DroppableCell({ 
  day, 
  meal, 
  assignment, 
  recipe,
  onExtend,
  onShrink,
  onRemove 
}: { 
  day: number; 
  meal: "Breakfast" | "Lunch" | "Dinner"; 
  assignment: PlanAssignment | null;
  recipe: Recipe | null;
  onExtend: () => void;
  onShrink: () => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${meal}-${day}`,
    data: { day, meal },
  });

  const isStartCell = assignment && assignment.startDay === day;
  const isSpanned = assignment && assignment.startDay < day && day < assignment.startDay + assignment.spanDays;
  
  if (isSpanned) {
    return null;
  }

  const spanDays = assignment?.spanDays || 1;
  const canExtend = assignment && (assignment.startDay + assignment.spanDays) < 7;
  const canShrink = assignment && assignment.spanDays > 1;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] p-2 rounded-lg border hairline ${isOver ? "bg-[#7A9E7E]/10 border-[#7A9E7E]" : "bg-background"}`}
      style={isStartCell ? { gridColumn: `span ${spanDays}` } : undefined}
      data-testid={`cell-${meal}-${day}`}
    >
      {recipe && isStartCell ? (
        <div className="h-full flex flex-col">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-medium text-foreground leading-tight flex-1">{recipe.title}</p>
            <button 
              onClick={onRemove}
              className="text-muted-foreground hover:text-foreground text-xs"
              data-testid={`remove-${meal}-${day}`}
            >
              ×
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{recipe.minutes} min</p>
          {spanDays > 1 && (
            <p className="text-[10px] text-[#7A9E7E] mt-1">{spanDays} days</p>
          )}
          <div className="mt-auto pt-2 flex gap-1">
            {canShrink && (
              <button
                onClick={onShrink}
                className="text-[10px] px-1.5 py-0.5 rounded border hairline text-muted-foreground hover:text-foreground"
                data-testid={`shrink-${meal}-${day}`}
              >
                −
              </button>
            )}
            {canExtend && (
              <button
                onClick={onExtend}
                className="text-[10px] px-1.5 py-0.5 rounded border hairline text-muted-foreground hover:text-foreground"
                data-testid={`extend-${meal}-${day}`}
              >
                +
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center">
          <span className="text-xs text-muted-foreground/50">Drop here</span>
        </div>
      )}
    </div>
  );
}

export default function WeeklyMeals() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<WeeklyMealsState>(loadState);
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [maxSelectionsHit, setMaxSelectionsHit] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);

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
    if (state.filters.myPicks) count++;
    if (state.filters.minRating !== null) count++;
    if (state.filters.servings) count++;
    count += state.filters.mustInclude.length;
    count += state.filters.mustExclude.length;
    return count;
  };

  const filterRecipes = (): Recipe[] => {
    return sampleRecipes.filter(recipe => {
      const meta = getRecipeUserMeta(recipe.id);
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
      if (state.filters.myPicks && !meta.isMyPick) return false;
      if (state.filters.minRating !== null) {
        if (!meta.rating || meta.rating < state.filters.minRating) return false;
      }
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

  const getAssignmentForCell = (meal: "Breakfast" | "Lunch" | "Dinner", day: number): PlanAssignment | null => {
    return state.planAssignments.find(a => 
      a.mealType === meal && 
      day >= a.startDay && 
      day < a.startDay + a.spanDays
    ) || null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const recipe = event.active.data.current?.recipe as Recipe;
    setActiveRecipe(recipe);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveRecipe(null);
    
    const { active, over } = event;
    if (!over) return;

    const recipe = active.data.current?.recipe as Recipe;
    if (!recipe) return;

    const dropData = over.data.current as { day: number; meal: "Breakfast" | "Lunch" | "Dinner" } | undefined;
    if (!dropData) return;

    const { day, meal } = dropData;

    const existingAssignment = getAssignmentForCell(meal, day);
    if (existingAssignment) return;

    setState(prev => ({
      ...prev,
      planAssignments: [
        ...prev.planAssignments.filter(a => !(a.recipeId === recipe.id && a.mealType === meal)),
        { recipeId: recipe.id, mealType: meal, startDay: day, spanDays: 1 }
      ]
    }));
  };

  const extendAssignment = (meal: "Breakfast" | "Lunch" | "Dinner", day: number) => {
    setState(prev => ({
      ...prev,
      planAssignments: prev.planAssignments.map(a => {
        if (a.mealType === meal && a.startDay === day) {
          const nextDay = a.startDay + a.spanDays;
          const hasConflict = prev.planAssignments.some(other => 
            other !== a && 
            other.mealType === meal && 
            nextDay >= other.startDay && 
            nextDay < other.startDay + other.spanDays
          );
          if (!hasConflict && nextDay < 7) {
            return { ...a, spanDays: a.spanDays + 1 };
          }
        }
        return a;
      })
    }));
  };

  const shrinkAssignment = (meal: "Breakfast" | "Lunch" | "Dinner", day: number) => {
    setState(prev => ({
      ...prev,
      planAssignments: prev.planAssignments.map(a => {
        if (a.mealType === meal && a.startDay === day && a.spanDays > 1) {
          return { ...a, spanDays: a.spanDays - 1 };
        }
        return a;
      })
    }));
  };

  const removeAssignment = (meal: "Breakfast" | "Lunch" | "Dinner", day: number) => {
    setState(prev => ({
      ...prev,
      planAssignments: prev.planAssignments.filter(a => !(a.mealType === meal && a.startDay === day))
    }));
  };

  const selectedRecipes = getSelectedRecipes();

  if (planGenerated) {
    return (
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="min-h-screen bg-background flex flex-col">
          <header className="border-b hairline px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
                <span className="text-xs font-medium text-foreground">TW</span>
              </div>
              <div>
                <span className="text-sm font-medium text-foreground">Tablewise</span>
                <span className="text-xs text-muted-foreground ml-2">Weekly Plan</span>
              </div>
            </div>
            <button 
              onClick={() => setPlanGenerated(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="button-back-to-selection"
            >
              ← Back to selection
            </button>
          </header>

          <div className="flex-1 flex p-6 gap-6">
            <aside className="w-[200px] flex-shrink-0">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Your recipes</h3>
              <p className="text-xs text-muted-foreground mb-4">Drag to the calendar</p>
              <div className="space-y-2">
                {selectedRecipes.map(recipe => {
                  const isInPlan = state.planAssignments.some(a => a.recipeId === recipe.id);
                  return (
                    <DraggableRecipe key={recipe.id} recipe={recipe} isInPlan={isInPlan} />
                  );
                })}
              </div>
            </aside>

            <main className="flex-1">
              <h2 className="text-lg font-medium text-foreground mb-4">Weekly Plan</h2>
              <p className="text-sm text-muted-foreground mb-6">Drag meals to slots. Use +/− to extend across days.</p>

              <div className="grid grid-cols-7 gap-2 mb-2">
                {DAYS.map((day, i) => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {MEALS.map(meal => (
                <div key={meal} className="mb-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{meal}</div>
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS.map((_, dayIndex) => {
                      const assignment = getAssignmentForCell(meal, dayIndex);
                      const isSpanned = assignment && assignment.startDay < dayIndex;
                      
                      if (isSpanned) {
                        return null;
                      }

                      const recipe = assignment ? sampleRecipes.find(r => r.id === assignment.recipeId) || null : null;

                      return (
                        <DroppableCell
                          key={dayIndex}
                          day={dayIndex}
                          meal={meal}
                          assignment={assignment}
                          recipe={recipe}
                          onExtend={() => assignment && extendAssignment(meal, assignment.startDay)}
                          onShrink={() => assignment && shrinkAssignment(meal, assignment.startDay)}
                          onRemove={() => assignment && removeAssignment(meal, assignment.startDay)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </main>
          </div>

          <DragOverlay>
            {activeRecipe && (
              <div className="p-3 bg-[#FAFAF8] rounded-lg border border-[#7A9E7E] shadow-lg">
                <p className="text-xs font-medium text-foreground">{activeRecipe.title}</p>
                <p className="text-[10px] text-muted-foreground">{activeRecipe.minutes} min</p>
              </div>
            )}
          </DragOverlay>
        </div>
      </DndContext>
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

      <div className="flex-1 flex justify-center p-6">
        <div className="w-full max-w-[1200px] flex gap-6">
          
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

              <button 
                onClick={() => setState(prev => ({ ...prev, showMoreFilters: !prev.showMoreFilters }))}
                className="text-xs text-muted-foreground hover:text-foreground mb-3"
                data-testid="button-more-filters"
              >
                {state.showMoreFilters ? "− Less filters" : "+ More filters"}
              </button>

              {state.showMoreFilters && (
                <>
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

                  <div className="border-b hairline pb-3 mb-3">
                    <button 
                      onClick={() => toggleSection("myPicks")}
                      className="flex items-center justify-between w-full text-left"
                      data-testid="button-toggle-mypicks-section"
                    >
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">My Picks ⭐</span>
                      <span className="text-xs text-muted-foreground">{state.expandedSections.includes("myPicks") ? "−" : "+"}</span>
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
                          <span className="text-xs text-muted-foreground">Show only My Picks</span>
                        </label>
                        
                        {state.filters.myPicks && (
                          <div className="pl-5 space-y-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Minimum Rating</span>
                            <div className="flex flex-wrap gap-1">
                              {[null, 4, 3, 2].map(rating => (
                                <button
                                  key={String(rating)}
                                  onClick={() => updateFilters({ minRating: rating })}
                                  className={`px-2 py-0.5 text-[10px] rounded border hairline transition-colors ${
                                    state.filters.minRating === rating 
                                      ? "bg-foreground text-background border-foreground" 
                                      : "text-muted-foreground hover:text-foreground border-muted-foreground/30"
                                  }`}
                                  data-testid={`button-filter-rating-${rating || "any"}`}
                                >
                                  {rating ? `${rating}★+` : "Any"}
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

          <main className="flex-1 min-w-0">
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

            <div className="space-y-4">
              {filteredRecipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No recipes match your filters.</p>
              ) : (
                filteredRecipes.slice(0, 10).map(recipe => {
                  const meta = getRecipeUserMeta(recipe.id);
                  const isSelected = state.selectedIds.includes(recipe.id);
                  const isExpanded = expandedRecipe === recipe.id;
                  const monogram = getMonogram(recipe.title);
                  const displayTags = recipe.tags.map(t => {
                    if (t === "vegetarian") return "Vegetarian";
                    if (t === "kidFriendly") return "Kid friendly";
                    if (t === "glutenFree") return "Gluten-free";
                    return t;
                  });
                  const extraTagCount = Math.max(0, recipe.ingredients.length - 3);

                  return (
                    <div 
                      key={recipe.id} 
                      className="bg-[#FAFAF8] rounded-2xl p-5 shadow-sm flex gap-4"
                      data-testid={`recipe-card-${recipe.id}`}
                    >
                      <div className="w-20 h-20 rounded-xl bg-foreground/5 flex-shrink-0 overflow-hidden flex items-center justify-center">
                        <span className="text-2xl font-medium text-muted-foreground/50">{monogram}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground leading-snug">{recipe.title}</p>
                              {meta.isMyPick && <span className="text-[10px] text-yellow-600 font-medium bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100">★ My Pick</span>}
                            </div>
                            {meta.rating && (
                              <div className="mt-1 flex items-center gap-1">
                                <StarRating value={meta.rating} onChange={() => {}} readOnly size="sm" />
                                <span className="text-[10px] text-muted-foreground">{meta.rating}/5</span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => toggleSelection(recipe.id)}
                            className={`px-3 py-1 text-xs rounded-full border flex-shrink-0 ${isSelected ? "bg-foreground/10 border-foreground/30 text-foreground" : "border-foreground/20 text-muted-foreground hover:text-foreground"}`}
                            data-testid={`button-add-${recipe.id}`}
                          >
                            {isSelected ? "Added" : "Add"}
                          </button>
                        </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span className="px-2.5 py-1 text-xs bg-foreground/5 rounded-full text-muted-foreground">{recipe.minutes} Min</span>
                        <span className="px-2.5 py-1 text-xs bg-foreground/5 rounded-full text-muted-foreground">{recipe.mealType}</span>
                        {displayTags.map(tag => (
                          <span key={tag} className="px-2.5 py-1 text-xs bg-foreground/5 rounded-full text-muted-foreground">{tag}</span>
                        ))}
                        {extraTagCount > 0 && (
                          <span className="px-2.5 py-1 text-xs bg-foreground/5 rounded-full text-muted-foreground">+{extraTagCount}</span>
                        )}
                      </div>

                      <div className="space-y-1 mb-4">
                        <p className="text-xs text-muted-foreground">Source: {recipe.sourceType}</p>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-[10px] bg-foreground/5 rounded text-muted-foreground">{recipe.proteinType.toLowerCase()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Tools: {recipe.tools.join(", ").toLowerCase()}</p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setLocation("/")}
                          className="px-4 py-2 text-xs rounded-full bg-[#7A9E7E] text-white hover:bg-[#6B8E6F]"
                          data-testid={`button-open-${recipe.id}`}
                        >
                          Open recipe
                        </button>
                        <button
                          onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)}
                          className="px-4 py-2 text-xs rounded-full border border-foreground/20 text-muted-foreground hover:text-foreground"
                          data-testid={`button-ingredients-${recipe.id}`}
                        >
                          Ingredients
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t hairline" data-testid={`recipe-details-${recipe.id}`}>
                          <p className="text-xs font-medium text-foreground mb-2">Recipe preview</p>
                          <ul className="space-y-1">
                            {recipe.ingredients.slice(0, 5).map((ing, i) => (
                              <li key={i} className="text-xs text-muted-foreground">• {ing}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

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
