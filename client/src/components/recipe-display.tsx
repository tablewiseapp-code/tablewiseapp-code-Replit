import { createContext, useContext, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { normalizeFactOrder, readFactOrder, recipeFactOrderKey, type RecipeFactId } from "@/lib/recipe-fact-layout";

export const nutritionDisplayKey = "tablewise:nutrition-details:v1";
const DisplayContext = createContext<{
  showNutrition: boolean; setShowNutrition: (value: boolean) => void;
  factOrder: RecipeFactId[]; setFactOrder: (value: readonly RecipeFactId[]) => void;
} | null>(null);

export function RecipeDisplayProvider({ children }: { children: ReactNode }) {
  const [factOrder, updateFactOrder] = useState(readFactOrder);
  const setFactOrder = (value: readonly RecipeFactId[]) => {
    const normalized = normalizeFactOrder(value);
    updateFactOrder(normalized);
    try { localStorage.setItem(recipeFactOrderKey, JSON.stringify(normalized)); }
    catch { /* Browser-only layout preference. */ }
  };
  const [showNutrition, update] = useState(() => {
    try { return localStorage.getItem(nutritionDisplayKey) === "true"; }
    catch { return false; }
  });
  const setShowNutrition = (value: boolean) => {
    update(value);
    try { localStorage.setItem(nutritionDisplayKey, String(value)); }
    catch { /* Display preference only; never modify recipe/planner data. */ }
  };
  return <DisplayContext.Provider value={{ showNutrition, setShowNutrition, factOrder, setFactOrder }}>{children}</DisplayContext.Provider>;
}

export function useRecipeDisplay() {
  const value = useContext(DisplayContext);
  if (!value) throw new Error("Recipe display controls require RecipeDisplayProvider.");
  return value;
}

/** "Show nutrition: Off / On" — one switch (role="switch"), styled as a two-part control; the state is announced. */
export function NutritionDetailsToggle({ context }: { context?: string }) {
  const { showNutrition, setShowNutrition } = useRecipeDisplay();
  const { t } = useI18n();
  const id = context ? `nutrition-details-toggle-${context}` : "nutrition-details-toggle";
  return (
    <div className="inline-flex items-center gap-2">
      <span id={`${id}-label`} className="text-sm text-muted-foreground">{t("display.showNutrition")}</span>
      <button type="button" role="switch" aria-checked={showNutrition} aria-labelledby={`${id}-label`}
        onClick={() => setShowNutrition(!showNutrition)} data-testid={id} className="segmented">
        <span aria-hidden="true" className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm ${!showNutrition ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>{t("display.off")}</span>
        <span aria-hidden="true" className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm ${showNutrition ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>{t("display.on")}</span>
      </button>
      {!context && <span className="sr-only" aria-live="polite">{`${t("display.showNutrition")}: ${t(showNutrition ? "display.on" : "display.off")}`}</span>}
    </div>
  );
}
