import { useState, useEffect, useCallback, useRef } from "react";
import plovImage from "@assets/generated_images/traditional_plov_rice_dish.png";

interface Ingredient {
  id: string;
  amount: number;
  unit: string;
  name: string;
}

interface Step {
  id: number;
  instruction: string;
  hint: string;
  timeMinutes?: number;
}

interface RecipeState {
  units: "g" | "ml" | "cups";
  cupMl: number;
  servings: number;
  layout: "focus" | "standard";
  showMacros: boolean;
  helpEnabled: boolean;
  notesEnabled: boolean;
  activeStep: number;
  showStepHint: boolean;
  finished: boolean;
}

const baseIngredients: Ingredient[] = [
  { id: "chicken", amount: 150, unit: "g", name: "chicken thighs" },
  { id: "oil", amount: 0.5, unit: "tbsp", name: "olive oil" },
  { id: "yogurt", amount: 0.25, unit: "cup", name: "yogurt" },
  { id: "onion", amount: 0.5, unit: "pc", name: "onion, chopped" },
  { id: "garlic", amount: 1, unit: "clove", name: "garlic" },
];

const steps: Step[] = [
  { id: 1, instruction: "Prep the chicken and vegetables.", hint: "Cut chicken into bite-sized pieces. Dice onion finely for even cooking." },
  { id: 2, instruction: "Sauté onions on low heat for 10 minutes.", hint: "Low heat means the onions soften without browning; stir occasionally.", timeMinutes: 10 },
  { id: 3, instruction: "Add the chicken and spices.", hint: "Cook chicken until golden on all sides, about 5-7 minutes.", timeMinutes: 6 },
];

const defaultState: RecipeState = {
  units: "g",
  cupMl: 240,
  servings: 2,
  layout: "standard",
  showMacros: false,
  helpEnabled: false,
  notesEnabled: false,
  activeStep: 1,
  showStepHint: false,
  finished: false,
};

function loadState(): RecipeState {
  try {
    const saved = localStorage.getItem("recipeState");
    if (saved) {
      return { ...defaultState, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return defaultState;
}

function saveState(state: RecipeState) {
  try {
    localStorage.setItem("recipeState", JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

function loadNotes(): string {
  try {
    return localStorage.getItem("recipeNotes") || "";
  } catch (e) {
    return "";
  }
}

function saveNotes(notes: string) {
  try {
    localStorage.setItem("recipeNotes", notes);
  } catch (e) {
    console.error("Failed to save notes:", e);
  }
}

function loadResultImage(): string | null {
  try {
    return localStorage.getItem("recipeResultImage");
  } catch (e) {
    return null;
  }
}

function saveResultImage(image: string | null) {
  try {
    if (image) {
      localStorage.setItem("recipeResultImage", image);
    } else {
      localStorage.removeItem("recipeResultImage");
    }
  } catch (e) {
    console.error("Failed to save result image:", e);
  }
}

function loadCheckedIngredients(): Set<string> {
  try {
    const saved = localStorage.getItem("recipeCheckedIngredients");
    if (saved) {
      return new Set(JSON.parse(saved));
    }
  } catch (e) {
    console.error("Failed to load checked ingredients:", e);
  }
  return new Set();
}

function saveCheckedIngredients(checked: Set<string>) {
  try {
    localStorage.setItem("recipeCheckedIngredients", JSON.stringify(Array.from(checked)));
  } catch (e) {
    console.error("Failed to save checked ingredients:", e);
  }
}

function loadCompletedSteps(): Set<number> {
  try {
    const saved = localStorage.getItem("recipeCompletedSteps");
    if (saved) {
      return new Set(JSON.parse(saved));
    }
  } catch (e) {
    console.error("Failed to load completed steps:", e);
  }
  return new Set();
}

function saveCompletedSteps(completed: Set<number>) {
  try {
    localStorage.setItem("recipeCompletedSteps", JSON.stringify(Array.from(completed)));
  } catch (e) {
    console.error("Failed to save completed steps:", e);
  }
}

function formatAmount(value: number): string {
  if (value < 1) {
    const rounded = Math.round(value * 100) / 100;
    return rounded.toString();
  } else if (value <= 10) {
    const rounded = Math.round(value * 10) / 10;
    return rounded.toString();
  } else {
    return Math.round(value).toString();
  }
}

function convertAmount(amount: number, fromUnit: string, targetUnits: "g" | "ml" | "cups", cupMl: number): { amount: number; unit: string } {
  const tbspMl = 15;
  const tspMl = 5;

  if (targetUnits === "g") {
    return { amount, unit: fromUnit };
  }

  if (targetUnits === "ml") {
    if (fromUnit === "cup") {
      return { amount: amount * cupMl, unit: "ml" };
    }
    if (fromUnit === "tbsp") {
      return { amount: amount * tbspMl, unit: "ml" };
    }
    if (fromUnit === "tsp") {
      return { amount: amount * tspMl, unit: "ml" };
    }
    return { amount, unit: fromUnit };
  }

  if (targetUnits === "cups") {
    if (fromUnit === "ml") {
      return { amount: amount / cupMl, unit: "cup" };
    }
    if (fromUnit === "tbsp") {
      return { amount: (amount * tbspMl) / cupMl, unit: "cup" };
    }
    if (fromUnit === "tsp") {
      return { amount: (amount * tspMl) / cupMl, unit: "cup" };
    }
    return { amount, unit: fromUnit };
  }

  return { amount, unit: fromUnit };
}

export default function RecipeView() {
  const [state, setState] = useState<RecipeState>(loadState);
  const [notes, setNotes] = useState(loadNotes);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(loadCheckedIngredients);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(loadCompletedSteps);
  const [showCupSelector, setShowCupSelector] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepId, setTimerStepId] = useState<number | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(loadResultImage);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (timerRunning && timerSeconds !== null && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds(prev => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerRunning(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timerRunning, timerSeconds]);

  const startTimer = (stepId: number, minutes: number) => {
    setTimerStepId(stepId);
    setTimerSeconds(minutes * 60);
    setTimerRunning(true);
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(null);
    setTimerStepId(null);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAddResult = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setResultImage(base64);
      saveResultImage(base64);
    };
    reader.readAsDataURL(file);
    
    e.target.value = "";
  };

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  useEffect(() => {
    saveCheckedIngredients(checkedIngredients);
  }, [checkedIngredients]);

  useEffect(() => {
    saveCompletedSteps(completedSteps);
  }, [completedSteps]);

  const updateState = useCallback((updates: Partial<RecipeState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleIngredient = (id: string) => {
    const newChecked = new Set(checkedIngredients);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedIngredients(newChecked);
  };

  const completeStep = () => {
    if (state.finished) return;
    
    const newCompleted = new Set(completedSteps);
    newCompleted.add(state.activeStep);
    setCompletedSteps(newCompleted);
    
    if (state.activeStep < steps.length) {
      updateState({ activeStep: state.activeStep + 1, showStepHint: false });
    } else {
      updateState({ finished: true });
    }
  };

  const toggleHint = () => {
    if (state.helpEnabled) {
      updateState({ showStepHint: !state.showStepHint });
    }
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getScaledIngredients = () => {
    return baseIngredients.map(ing => {
      const scaledAmount = ing.amount * state.servings;
      const converted = convertAmount(scaledAmount, ing.unit, state.units, state.cupMl);
      return {
        ...ing,
        displayAmount: formatAmount(converted.amount),
        displayUnit: converted.unit,
      };
    });
  };

  const scaledIngredients = getScaledIngredients();
  const isLastStep = state.activeStep === steps.length;
  const isFocusMode = state.layout === "focus";
  const allIngredientsChecked = baseIngredients.every(ing => checkedIngredients.has(ing.id));

  return (
    <div className={`min-h-screen bg-background flex items-center justify-center p-6 ${isFocusMode ? "layout-focus" : "layout-standard"}`}>
      <div className="recipe-surface w-full max-w-[1200px] min-h-[700px] rounded-xl flex overflow-hidden">
        
        {/* Left Control Rail */}
        <aside className="control-rail w-[84px] flex-shrink-0 border-r hairline py-6 flex flex-col gap-1">
          
          {/* Units Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${state.units === "g" ? "active" : ""}`}
              onClick={() => updateState({ units: "g" })}
              data-testid="toggle-units-g"
              role="button"
              aria-label="Switch to grams"
            >
              <span className="text-xs text-muted-foreground">g</span>
            </div>
            <div 
              className={`control-knob ${state.units === "ml" ? "active" : ""}`}
              onClick={() => updateState({ units: "ml" })}
              data-testid="toggle-units-ml"
              role="button"
              aria-label="Switch to milliliters"
            >
              <span className="text-xs text-muted-foreground">ml</span>
            </div>
            <div 
              className={`control-knob ${state.units === "cups" ? "active" : ""}`}
              onClick={() => updateState({ units: "cups" })}
              data-testid="toggle-units-cups"
              role="button"
              aria-label="Switch to cups"
            >
              <span className="text-xs text-muted-foreground">cups</span>
            </div>
          </div>
          
          {state.units === "cups" && (
            <>
              <div className="border-t hairline my-3 mx-3" />
              
              {/* Cup Size */}
              <div className="px-2 relative">
                <div 
                  className="control-knob active"
                  onClick={() => setShowCupSelector(!showCupSelector)}
                  data-testid="button-cup-size"
                  role="button"
                  aria-label="Select cup size"
                >
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cup</span>
                  <span className="text-xs text-foreground">{state.cupMl} ml</span>
                </div>
                
                {showCupSelector && (
                  <div className="absolute left-full ml-2 top-0 bg-background border hairline rounded-lg shadow-sm py-1 z-20" data-testid="cup-size-selector">
                    {[200, 240, 250].map(size => (
                      <button
                        key={size}
                        className={`block w-full px-3 py-1.5 text-xs text-left hover:bg-muted ${state.cupMl === size ? "text-foreground font-medium" : "text-muted-foreground"}`}
                        onClick={() => {
                          updateState({ cupMl: size });
                          setShowCupSelector(false);
                        }}
                        data-testid={`button-cup-${size}`}
                      >
                        {size} ml
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Servings Stepper */}
          <div className="px-2">
            <div className="flex flex-col items-center gap-1 py-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Servings</span>
              <div className="flex items-center gap-2">
                <button 
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring-quiet rounded disabled:opacity-30"
                  onClick={() => updateState({ servings: Math.max(1, state.servings - 1) })}
                  disabled={state.servings <= 1}
                  data-testid="button-servings-decrease"
                  aria-label="Decrease servings"
                >
                  –
                </button>
                <span className="text-sm text-foreground w-4 text-center" data-testid="text-servings-count">{state.servings}</span>
                <button 
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring-quiet rounded disabled:opacity-30"
                  onClick={() => updateState({ servings: Math.min(20, state.servings + 1) })}
                  disabled={state.servings >= 20}
                  data-testid="button-servings-increase"
                  aria-label="Increase servings"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Macros Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${state.showMacros ? "active" : ""}`}
              onClick={() => updateState({ showMacros: !state.showMacros })}
              data-testid="toggle-macros"
              role="button"
              aria-label="Toggle nutrition info"
            >
              <span className="text-xs text-muted-foreground">БЖУ</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Guidance Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${state.helpEnabled ? "active" : ""}`}
              onClick={() => {
                updateState({ helpEnabled: !state.helpEnabled, showStepHint: false });
              }}
              data-testid="toggle-help"
              role="button"
              aria-label="Toggle step help"
            >
              <span className="text-[10px] text-muted-foreground">Guidance</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Focus Mode */}
          <div className="px-2">
            <div 
              className={`control-knob ${isFocusMode ? "active" : ""}`}
              onClick={() => updateState({ layout: isFocusMode ? "standard" : "focus" })}
              data-testid="button-focus-mode"
              role="button"
              aria-label="Toggle focus mode"
            >
              <span className="text-[10px] text-muted-foreground text-center leading-tight">Focus</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Notes Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${state.notesEnabled ? "active" : ""}`}
              onClick={() => updateState({ notesEnabled: !state.notesEnabled })}
              data-testid="toggle-notes"
              role="button"
              aria-label="Toggle notes"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground">
                <path d="M2 3h10M2 6h8M2 9h6M2 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[10px] text-muted-foreground">Notes</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Add Result */}
          <div className="px-2">
            <div 
              className="control-knob"
              onClick={handleAddResult}
              data-testid="button-add-result"
              role="button"
              aria-label="Add cooking result photo"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground">
                <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="4.5" cy="6.5" r="1" fill="currentColor"/>
                <path d="M1.5 10.5L4.5 7.5L6.5 9.5L9.5 5.5L12.5 9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[10px] text-muted-foreground">Result</span>
            </div>
          </div>
        </aside>
        
        {/* Center Recipe Canvas */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="input-result-file"
          />
          
          {/* Header */}
          <header ref={topRef} className={`px-10 pt-10 ${isFocusMode ? "pb-4" : "pb-6"}`}>
            <h1 className={`font-medium text-foreground tracking-tight ${isFocusMode ? "text-2xl" : "text-3xl"}`} data-testid="text-recipe-title">
              Plov
            </h1>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-recipe-meta">
              Source: Personal • Modified by you
            </p>
            {!isFocusMode && state.showMacros && (
              <p className="text-sm text-muted-foreground mt-2" data-testid="text-nutrition-info">
                Protein 42g • Fat 18g • Carbs 22g
              </p>
            )}
          </header>
          
          {/* Sticky Ingredients */}
          <section className="sticky top-0 bg-background z-10 px-10 py-4 border-b hairline">
            <ul className={`${isFocusMode ? "space-y-1" : "space-y-2"}`}>
              {scaledIngredients.map((ing) => (
                <li key={ing.id} className="flex items-center gap-3">
                  {!isFocusMode && (
                    <input 
                      type="checkbox" 
                      checked={checkedIngredients.has(ing.id)}
                      onChange={() => toggleIngredient(ing.id)}
                      className="w-4 h-4 rounded border-gray-300 text-foreground focus-ring-quiet cursor-pointer accent-current"
                      data-testid={`checkbox-ingredient-${ing.id}`}
                      aria-label={`${ing.displayAmount} ${ing.displayUnit} ${ing.name}`}
                    />
                  )}
                  <span className={`text-sm ${!isFocusMode && checkedIngredients.has(ing.id) ? "line-through text-muted-foreground" : ""}`}>
                    <span className="font-medium">{ing.displayAmount} {ing.displayUnit}</span>{" "}
                    <span className="text-foreground">{ing.name}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!isFocusMode && allIngredientsChecked && (
              <p className="text-sm text-muted-foreground mt-3" data-testid="text-ingredients-ready">
                Ingredients ready
              </p>
            )}
          </section>
          
          {/* Notes Section */}
          {!isFocusMode && state.notesEnabled && (
            <section className="px-10 py-4 border-b hairline">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">My notes</label>
              <textarea
                className="w-full bg-transparent border hairline rounded-lg p-3 text-sm text-foreground resize-none focus-ring-quiet placeholder:text-muted-foreground"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your notes here..."
                data-testid="textarea-notes"
              />
            </section>
          )}
          
          {/* Steps */}
          <section className={`px-10 flex-1 ${isFocusMode ? "py-5" : "py-8"}`}>
            {/* Step indicator */}
            <p className="text-sm text-muted-foreground mb-6" data-testid="text-step-indicator">
              Step {state.activeStep} of {steps.length}
            </p>
            
            <div className={isFocusMode ? "space-y-6" : "space-y-10"}>
              {steps.map((step, index) => {
                const stepNum = index + 1;
                const isCompleted = completedSteps.has(stepNum);
                const isPrevious = stepNum < state.activeStep;
                const isActive = stepNum === state.activeStep;
                
                let stepClass = "step-subtle";
                if (isPrevious) stepClass = "step-faded";
                if (isActive) stepClass = "step-active";
                
                // In focus mode, only show active step
                if (isFocusMode && !isActive) return null;
                
                return (
                  <div 
                    key={step.id} 
                    className={`transition-all duration-300 ${stepClass}`}
                    data-testid={`step-${step.id}`}
                  >
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                      Step {step.id}
                      {isCompleted && isPrevious && (
                        <span className="ml-2">✓ Completed</span>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <p className={`${isFocusMode ? "text-base" : "text-lg"} ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.instruction}
                      </p>
                      {isActive && state.helpEnabled && (
                        <button 
                          onClick={toggleHint}
                          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring-quiet rounded-full text-xs ${state.showStepHint ? "bg-muted" : ""}`}
                          data-testid="button-step-help"
                          aria-label="Show step hint"
                        >
                          ?
                        </button>
                      )}
                    </div>
                    
                    {/* Hint */}
                    {isActive && state.showStepHint && state.helpEnabled && (
                      <div className="mt-3 pl-3 border-l-2 hairline" data-testid="text-step-hint">
                        <p className="text-sm text-muted-foreground">
                          {step.hint}
                        </p>
                      </div>
                    )}
                    
                    {/* Timer */}
                    {!isFocusMode && isActive && step.timeMinutes && (
                      <div className="mt-4 flex items-center gap-3">
                        {timerStepId === step.id && timerSeconds !== null ? (
                          <>
                            <span className={`text-lg font-medium tabular-nums ${timerSeconds === 0 ? "text-foreground" : "text-muted-foreground"}`} data-testid="text-timer">
                              {timerSeconds === 0 ? "Done!" : formatTime(timerSeconds)}
                            </span>
                            <button
                              onClick={stopTimer}
                              className="next-btn px-4 py-1.5 rounded-full text-xs"
                              data-testid="button-timer-stop"
                            >
                              Stop
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startTimer(step.id, step.timeMinutes!)}
                            className="next-btn px-4 py-1.5 rounded-full text-xs"
                            data-testid="button-timer-start"
                          >
                            Timer ({step.timeMinutes} min)
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Completed/Finish Button */}
                    {isActive && (
                      <button 
                        onClick={completeStep}
                        disabled={state.finished}
                        className={`next-btn mt-6 px-5 py-2 rounded-full text-sm ${state.finished ? "opacity-50 cursor-not-allowed" : ""}`}
                        data-testid="button-next-step"
                      >
                        {isLastStep ? "Finish" : "Completed"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Back to recipe link */}
            <div className="mt-12">
              <button
                onClick={scrollToTop}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-back-to-recipe"
              >
                Back to recipe
              </button>
            </div>
          </section>
        </main>
        
        {/* Right Image Column */}
        <aside className="w-[320px] flex-shrink-0 p-6 hidden lg:block">
          {resultImage ? (
            <img 
              src={resultImage}
              alt="Cooking result"
              className="w-full h-auto max-h-[400px] object-cover rounded-xl"
              data-testid="image-result"
            />
          ) : (
            <img 
              src={plovImage}
              alt="Plov dish"
              className="w-full h-auto max-h-[400px] object-cover rounded-xl"
              data-testid="image-dish-placeholder"
            />
          )}
        </aside>
      </div>
      
      {/* Click outside to close cup selector */}
      {showCupSelector && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowCupSelector(false)}
        />
      )}
    </div>
  );
}
