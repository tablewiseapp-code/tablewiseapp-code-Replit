import { createContext, useContext, useState, type ReactNode } from "react";
import { Check, Salad } from "lucide-react";
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

export function NutritionDetailsToggle({ context }: { context?: string }) {
  const { showNutrition, setShowNutrition } = useRecipeDisplay();
  const { t } = useI18n();
  return (
    <button type="button" aria-pressed={showNutrition}
      onClick={() => setShowNutrition(!showNutrition)}
      data-testid={context ? `nutrition-details-toggle-${context}` : "nutrition-details-toggle"}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a] ${showNutrition ? "border-[#42624e] bg-[#42624e] text-white" : "border-[#d9dfd4] bg-white text-[#52665a] hover:bg-[#f2f6ef]"}`}>
      <Salad className="h-3.5 w-3.5" aria-hidden="true" />
      {t("display.nutritionDetails")}
      {showNutrition && <Check className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}
