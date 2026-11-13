import { createContext, useContext, useState, type ReactNode } from "react";
import { Clock3, Users, Wrench } from "lucide-react";
import { Link } from "wouter";
import { useMvpCopy } from "@/lib/mvp-copy";
import { useI18n } from "@/lib/i18n";
import { recipeStageMinutes, recipeTimePreferenceKey, type RecipeTimeMode, type RecipeTimeData } from "@/lib/recipe-time";
import { RecipeCreditLine } from "./recipe-credit";
import type { RecipeCredit } from "@shared/recipe-credit";
import type { RecipeToolKey } from "@/lib/recipe-tools";
import type { NutritionFields } from "@shared/recipe-nutrition";
import { useNutritionBlocks } from "./recipe-nutrition";
import { RecipeFactLayout, type RecipeFactBlock } from "./recipe-fact-layout";
import { NutritionDetailsToggle, useRecipeDisplay } from "./recipe-display";

const TimeContext = createContext<{
  mode: RecipeTimeMode;
  setMode: (mode: RecipeTimeMode) => void;
} | null>(null);

export function RecipeTimeProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<RecipeTimeMode>(() => {
    try {
      return localStorage.getItem(recipeTimePreferenceKey) === "preparation" ? "preparation" : "total";
    } catch { return "total"; }
  });
  const setMode = (next: RecipeTimeMode) => {
    updateMode(next);
    try { localStorage.setItem(recipeTimePreferenceKey, next); } catch { /* Optional preference only. */ }
  };
  return <TimeContext.Provider value={{ mode, setMode }}>{children}</TimeContext.Provider>;
}

export function useRecipeTime() {
  const context = useContext(TimeContext);
  if (!context) throw new Error("Recipe time controls require RecipeTimeProvider.");
  return context;
}

/** Display preferences (not filters), grouped above the recipe results and kept visually secondary. */
export function RecipeDisplayToolbar() {
  const { mode, setMode } = useRecipeTime();
  const { t } = useI18n();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2" role="group" aria-label={t("display.label")} data-testid="recipe-display-toolbar">
      <div role="group" aria-labelledby="time-display-label" className="inline-flex items-center gap-2">
        <span id="time-display-label" className="text-sm text-muted-foreground">{t("display.time")}</span>
        <div className="segmented">
          {(["preparation", "total"] as const).map(value => (
            <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} data-testid={`meals-time-${value}`}>
              {t(value === "preparation" ? "display.prep" : "display.total")}
            </button>
          ))}
        </div>
      </div>
      <NutritionDetailsToggle />
    </div>
  );
}

export function MealRecipeFacts({ recipe, context, compact = false, interactive, actions, showLink = true }: {
  recipe: RecipeCredit & RecipeTimeData & NutritionFields & { id: string; title?: string; servings?: string | null; equipment?: RecipeToolKey[]; metadataEstimated?: boolean };
  context: string;
  compact?: boolean;
  interactive?: boolean;
  actions?: ReactNode;
  showLink?: boolean;
}) {
  const { mode } = useRecipeTime();
  const { showNutrition } = useRecipeDisplay();
  const { t } = useMvpCopy();
  const minutes = recipeStageMinutes(recipe, mode);
  const portions = recipe.servings?.trim();
  const nutritionBlocks = useNutritionBlocks({ recipe, compact, context })
    .filter(block => context !== "catalog" || block.id !== "nutrition-status");
  // Unknown values are omitted rather than shown as "not specified".
  const hasCredit = recipe.creditKind === "mine" || Boolean(recipe.creditName?.trim() || recipe.chefReference?.trim());
  const blocks: RecipeFactBlock[] = [
    ...(portions ? [{ id: "portions" as const, label: t("portions", { count: portions }), content:
      <div className="flex items-start gap-1"><Users className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <div>{t("portions", { count: portions })}</div></div> }] : []),
    ...(minutes !== null ? [{ id: "time" as const, label: t(mode), content: <div className="flex items-start gap-1">
      <Clock3 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <div>{`${t(mode)}: ${minutes} ${t("minutesShort")}`}</div></div> }] : []),
    ...(recipe.equipment?.length ? [{ id: "tools" as const, label: t("toolsUsed"), content: <div className="flex items-start gap-1">
      <Wrench className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <div data-testid={`meals-${context}-tools-${recipe.id}`}>{t("toolsUsed")}: {recipe.equipment.map(tool => t(tool)).join(", ")}</div></div> }] : []),
    ...(mode === "total" && recipe.prepTime != null ? [{ id: "preparation" as const, label: t("preparation"), content:
      <div>{t("preparation")}: {recipe.prepTime} {t("minutesShort")}</div> }] : []),
    // catalog cards keep credit off the card face
    ...(context === "catalog" || !hasCredit ? [] : [{ id: "credit" as const, label: t("creditChef"), content: <RecipeCreditLine recipe={recipe} /> }]),
    ...(showNutrition ? nutritionBlocks : []),
  ];
  return (
    <div className={`flex min-w-0 basis-full flex-wrap items-start gap-x-3 gap-y-1 text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}
      data-testid={`meals-${context}-facts-${recipe.id}`}>
      <RecipeFactLayout blocks={blocks} context={`${context}-${recipe.id}`} interactive={interactive ?? (!compact && context === "catalog")}
        testId={showNutrition ? `nutrition-${context}-${recipe.id}` : undefined} />
      {context !== "drag" && showLink && (
        <Link href={`/recipe/${recipe.id}`} onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
          aria-label={`${t("showRecipe")}: ${recipe.title ?? recipe.id}`}
          data-testid={context === "catalog" ? `button-open-${recipe.id}` : `meals-show-${context}-${recipe.id}`}
          className="btn btn-secondary">
          {t("showRecipe")}
        </Link>
      )}
      {actions}
      {recipe.metadataEstimated && <span className="basis-full">{t("developmentEstimates")}</span>}
    </div>
  );
}
