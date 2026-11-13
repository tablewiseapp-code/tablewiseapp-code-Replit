import { useI18n } from "@/lib/i18n";
import { nutritionAmounts, nutritionBasis, usableNutrition, type NutritionFields } from "@shared/recipe-nutrition";
import { RecipeFactLayout, type RecipeFactBlock } from "./recipe-fact-layout";
import { NutritionRow } from "./recipe-summary";

export function useNutritionBlocks({ recipe, compact = false, context = "detail" }: {
  recipe: NutritionFields & { id: string; servings?: string | null };
  compact?: boolean; context?: string;
}): RecipeFactBlock[] {
  const { t, lang } = useI18n();
  const nutrition = usableNutrition(recipe.nutrition);
  if (!nutrition) return [{ id: "nutrition-status", label: t("nutrition.aiEstimate"), content:
    <div>{t(recipe.nutritionStatus === "unavailable" ? "nutrition.unavailable" : "nutrition.notAnalyzed")}</div> }];
  const portions = nutritionBasis(recipe.servings);
  const estimateBasis = `${t("nutrition.aiEstimate")} · ${t(!portions ? "nutrition.wholeRecipe"
    : portions.unit === "portion" ? "nutrition.perPortion" : `nutrition.per.${portions.unit}`)}${
      portions && portions.min !== portions.max
        ? ` (${recipe.servings}${portions.unit === "portion" ? ` ${t("nutrition.portions")}` : ""})` : ""}`;
  const number = (value: number, calories: boolean) =>
    value.toLocaleString(lang, { maximumFractionDigits: calories ? 0 : 1 });
  return [
    ...nutritionAmounts(nutrition, recipe.servings).map(({ key, min, max }): RecipeFactBlock => {
          const calories = key === "caloriesKcal";
          const low = number(min, calories);
          const high = number(max, calories);
          return { id: key, label: t(`nutrition.${key}`), content: <div className="min-w-0 max-w-full break-words" title={estimateBasis} aria-description={estimateBasis} data-testid={`nutrition-${context}-${recipe.id}-${key}`}>
            {t(`nutrition.${key}`)}: {low === high ? low : `${low}–${high}`} {calories ? "kcal" : "g"}
          </div> };
        }),
    ...(!compact ? [{ id: "nutrition-details" as const, label: t("nutrition.details"), content: <details className="break-words">
        <summary className="cursor-pointer">{t("nutrition.details")}</summary>
        <p>{estimateBasis}</p>
        <p>{t("nutrition.caution")}</p>
        <p>{nutrition.model === "replit-assisted-analysis" ? t("nutrition.assistedAnalysis") : nutrition.model}
          {" · "}<time dateTime={nutrition.analyzedAt}>{new Date(nutrition.analyzedAt).toLocaleDateString(lang)}</time></p>
        <ul className="list-disc ps-4">{nutrition.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </details> }] : []),
  ];
}

export function RecipeNutritionSummary(props: {
  recipe: NutritionFields & { id: string; servings?: string | null }; compact?: boolean; context?: string;
}) {
  const blocks = useNutritionBlocks(props);
  const context = props.context ?? "detail";
  return <div className={props.compact ? "text-[10px]" : "text-xs"}>
    <RecipeFactLayout blocks={blocks} context={`${context}-${props.recipe.id}`} interactive={!props.compact}
      testId={`nutrition-${context}-${props.recipe.id}`} />
  </div>;
}

/** Cooking-view nutrition: real AI estimates only, collapsed, not draggable; mock/missing data is never shown as numbers. */
export function RecipeNutritionPanel({ recipe }: { recipe: NutritionFields & { id: string; servings?: string | null } }) {
  const { t } = useI18n();
  const blocks = useNutritionBlocks({ recipe, context: "detail" });
  if (!usableNutrition(recipe.nutrition)) return <p className="text-sm text-muted-foreground" data-testid="nutrition-unavailable">{t("nutrition.unavailableShort")}</p>;
  return <div className="space-y-3" data-testid="nutrition-panel">
    <NutritionRow recipe={recipe} testId="nutrition-detail-row" />
    <details className="text-sm text-muted-foreground">
    <summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary">{t("nutrition.details")}</summary>
    <div className="mt-3"><RecipeFactLayout blocks={blocks} context={`detail-${recipe.id}`} interactive={false} testId={`nutrition-detail-${recipe.id}`} /></div>
  </details>
  </div>;
}
