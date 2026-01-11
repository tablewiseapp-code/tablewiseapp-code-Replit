import { useState } from "react";

const ingredients = [
  { id: 1, quantity: "300g", name: "chicken thighs" },
  { id: 2, quantity: "1 tbsp", name: "olive oil" },
  { id: 3, quantity: "1/2 cup", name: "yogurt" },
  { id: 4, quantity: "1", name: "onion, chopped" },
  { id: 5, quantity: "2 cloves", name: "garlic" },
];

const steps = [
  { id: 1, instruction: "Prep the chicken and vegetables.", hint: "Cut chicken into bite-sized pieces. Dice onion finely for even cooking." },
  { id: 2, instruction: "Sauté onions on low heat for 10 minutes.", hint: "Low heat means the onions soften without browning; stir occasionally." },
  { id: 3, instruction: "Add the chicken and spices.", hint: "Cook chicken until golden on all sides, about 5-7 minutes." },
];

export default function RecipeView() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [servings, setServings] = useState(2);
  const [units, setUnits] = useState<"metric" | "cups">("metric");
  const [showNutrition, setShowNutrition] = useState(false);
  const [helpEnabled, setHelpEnabled] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());

  const toggleIngredient = (id: number) => {
    const newChecked = new Set(checkedIngredients);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedIngredients(newChecked);
  };

  const nextStep = () => {
    setShowHint(false);
    if (activeStepIndex < steps.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    }
  };

  const toggleHint = () => {
    if (helpEnabled) {
      setShowHint(!showHint);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="recipe-surface w-full max-w-[1200px] min-h-[700px] rounded-xl flex overflow-hidden">
        
        {/* Left Control Rail */}
        <aside className="control-rail w-[84px] flex-shrink-0 border-r hairline py-6 flex flex-col gap-1">
          
          {/* Units Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${units === "metric" ? "active" : ""}`}
              onClick={() => setUnits("metric")}
              data-testid="toggle-units-metric"
              role="button"
              aria-label="Switch to metric units"
            >
              <span className="text-xs text-muted-foreground">g / ml</span>
            </div>
            <div 
              className={`control-knob ${units === "cups" ? "active" : ""}`}
              onClick={() => setUnits("cups")}
              data-testid="toggle-units-cups"
              role="button"
              aria-label="Switch to cups"
            >
              <span className="text-xs text-muted-foreground">cups</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Cup Size */}
          <div className="px-2">
            <div className="control-knob">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cup</span>
              <span className="text-xs text-foreground">240 ml</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Servings Stepper */}
          <div className="px-2">
            <div className="flex flex-col items-center gap-1 py-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Servings</span>
              <div className="flex items-center gap-2">
                <button 
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring-quiet rounded"
                  onClick={() => setServings(Math.max(1, servings - 1))}
                  data-testid="button-servings-decrease"
                  aria-label="Decrease servings"
                >
                  –
                </button>
                <span className="text-sm text-foreground w-4 text-center" data-testid="text-servings-count">{servings}</span>
                <button 
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring-quiet rounded"
                  onClick={() => setServings(servings + 1)}
                  data-testid="button-servings-increase"
                  aria-label="Increase servings"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Layout Toggle (decorative) */}
          <div className="px-2">
            <div className="control-knob" role="button" aria-label="Toggle layout">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="9" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className="text-[10px] text-muted-foreground">Layout</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Nutrition Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${showNutrition ? "active" : ""}`}
              onClick={() => setShowNutrition(!showNutrition)}
              data-testid="toggle-nutrition"
              role="button"
              aria-label="Toggle nutrition info"
            >
              <span className="text-xs text-muted-foreground">БЖУ</span>
            </div>
          </div>
          
          <div className="border-t hairline my-3 mx-3" />
          
          {/* Help Toggle */}
          <div className="px-2">
            <div 
              className={`control-knob ${helpEnabled ? "active" : ""}`}
              onClick={() => {
                setHelpEnabled(!helpEnabled);
                if (helpEnabled) setShowHint(false);
              }}
              data-testid="toggle-help"
              role="button"
              aria-label="Toggle step help"
            >
              <span className="text-sm text-muted-foreground">?</span>
            </div>
          </div>
        </aside>
        
        {/* Center Recipe Canvas */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          {/* Header */}
          <header className="px-10 pt-10 pb-6">
            <h1 className="text-3xl font-medium text-foreground tracking-tight" data-testid="text-recipe-title">
              Chicken Curry
            </h1>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-recipe-meta">
              Source: Personal • Last cooked: 2 weeks ago • Modified by you
            </p>
            {showNutrition && (
              <p className="text-sm text-muted-foreground mt-2" data-testid="text-nutrition-info">
                Protein 42g • Fat 18g • Carbs 22g
              </p>
            )}
          </header>
          
          {/* Sticky Ingredients */}
          <section className="sticky top-0 bg-background z-10 px-10 py-4 border-b hairline">
            <ul className="space-y-2">
              {ingredients.map((ing) => (
                <li key={ing.id} className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={checkedIngredients.has(ing.id)}
                    onChange={() => toggleIngredient(ing.id)}
                    className="w-4 h-4 rounded border-gray-300 text-foreground focus-ring-quiet cursor-pointer accent-current"
                    data-testid={`checkbox-ingredient-${ing.id}`}
                    aria-label={`${ing.quantity} ${ing.name}`}
                  />
                  <span className={`text-sm ${checkedIngredients.has(ing.id) ? "line-through text-muted-foreground" : ""}`}>
                    <span className="font-medium">{ing.quantity}</span>{" "}
                    <span className="text-foreground">{ing.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          
          {/* Steps */}
          <section className="px-10 py-8 flex-1">
            <div className="space-y-10">
              {steps.map((step, index) => {
                let stepClass = "step-subtle";
                if (index < activeStepIndex) stepClass = "step-faded";
                if (index === activeStepIndex) stepClass = "step-active";
                
                return (
                  <div 
                    key={step.id} 
                    className={`transition-all duration-300 ${stepClass}`}
                    data-testid={`step-${step.id}`}
                  >
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                      Step {step.id}
                    </div>
                    <div className="flex items-start gap-2">
                      <p className={`text-lg ${index === activeStepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.instruction}
                      </p>
                      {index === activeStepIndex && helpEnabled && (
                        <button 
                          onClick={toggleHint}
                          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring-quiet rounded-full text-xs"
                          data-testid="button-step-help"
                          aria-label="Show step hint"
                        >
                          ?
                        </button>
                      )}
                    </div>
                    
                    {/* Hint */}
                    {index === activeStepIndex && showHint && helpEnabled && (
                      <div className="mt-3 pl-3 border-l-2 hairline" data-testid="text-step-hint">
                        <p className="text-sm text-muted-foreground">
                          {step.hint}
                        </p>
                      </div>
                    )}
                    
                    {/* Next Button */}
                    {index === activeStepIndex && index < steps.length - 1 && (
                      <button 
                        onClick={nextStep}
                        className="next-btn mt-6 px-5 py-2 rounded-full text-sm"
                        data-testid="button-next-step"
                      >
                        Next
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
        
        {/* Right Image Column */}
        <aside className="w-[320px] flex-shrink-0 p-6 hidden lg:block">
          <div 
            className="w-full h-[280px] rounded-xl"
            style={{
              background: "linear-gradient(135deg, hsl(35 30% 85%) 0%, hsl(25 20% 78%) 50%, hsl(30 25% 70%) 100%)"
            }}
            data-testid="image-dish-placeholder"
            aria-label="Dish photo placeholder"
          />
        </aside>
      </div>
    </div>
  );
}
