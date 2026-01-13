import { useState } from "react";
import { useLocation } from "wouter";
import { saveCurrentRecipe, generateId, type Recipe } from "@/lib/storage";

export default function ImportRecipe() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");

  const handleSave = () => {
    const parsedIngredients = ingredients
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const parsedSteps = steps
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const recipe: Recipe = {
      id: generateId(),
      title: title.trim() || "Untitled Recipe",
      ingredients: parsedIngredients,
      steps: parsedSteps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    saveCurrentRecipe(recipe);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Import</p>
        <h1 className="text-2xl font-medium text-foreground mb-2">Bring your recipe</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Paste a title, ingredient lines, and steps. Stored locally in your browser.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Quinoa bowls with veggies"
              className="w-full px-4 py-3 text-sm border hairline rounded-lg bg-background focus-ring-quiet"
              data-testid="input-title"
            />
            {!title.trim() && (
              <p className="text-xs text-muted-foreground mt-1">A title helps you find this recipe later</p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Ingredients (one per line)
            </label>
            <textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="200g rice
500g chicken thighs
2 carrots, diced
1 large onion, sliced"
              rows={6}
              className="w-full px-4 py-3 text-sm border hairline rounded-lg bg-background focus-ring-quiet resize-none"
              data-testid="textarea-ingredients"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Steps (one per line)
            </label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder="Rinse the rice and soak for 30 minutes
Cut chicken into pieces and season
Sauté onions until golden brown"
              rows={8}
              className="w-full px-4 py-3 text-sm border hairline rounded-lg bg-background focus-ring-quiet resize-none"
              data-testid="textarea-steps"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90"
              data-testid="button-save"
            >
              Save & open
            </button>
            <button
              onClick={() => setLocation("/")}
              className="px-6 py-2.5 text-sm rounded-full border hairline text-muted-foreground hover:text-foreground"
              data-testid="button-back"
            >
              Back
            </button>
          </div>
        </div>

        <div className="mt-12 p-5 bg-[#FAFAF8] rounded-xl">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">How it works</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Paste your recipe text—we'll split it into lines automatically</li>
            <li>• Your recipe is stored locally in your browser</li>
            <li>• Edit or re-import anytime</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
