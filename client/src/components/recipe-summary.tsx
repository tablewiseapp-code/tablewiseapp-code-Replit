import { Clock3, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { recipeStageMinutes, type RecipeTimeData, type RecipeTimeMode } from "@/lib/recipe-time";
import { nutritionAmounts, nutritionBasis, servingRange, usableNutrition, type NutritionFields } from "@shared/recipe-nutrition";

// Only these tags are meaningful to people choosing a recipe. Everything else (ai-generated, meal:dinner,
// provenance and development markers, cuisines, meal types) stays internal.
const DIETARY: Record<string, string> = {
  vegetarian: "meals.vegetarian", vegan: "card.vegan", glutenfree: "meals.glutenFree",
  dairyfree: "card.dairyFree", kidfriendly: "meals.kidFriendly",
};
const dietKey = (tag: string) => DIETARY[tag.toLowerCase().replace(/[\s_-]+/g, "")];

/** Translation keys for a recipe's dietary labels, deduplicated, in stored order. */
export function dietaryLabelKeys(tags?: readonly string[] | null): string[] {
  return Array.from(new Set((tags ?? []).map(dietKey).filter((key): key is string => Boolean(key))));
}

export function DietaryTags({ tags, testId }: { tags?: readonly string[] | null; testId?: string }) {
  const { t } = useI18n();
  const keys = dietaryLabelKeys(tags);
  if (!keys.length) return null;
  return <ul className="flex flex-wrap gap-1.5" aria-label={t("card.dietary")} data-testid={testId}>
    {keys.map(key => <li key={key} className="tag">{t(key)}</li>)}
  </ul>;
}

/** "4 servings" for plain counts and ranges; a yield such as "12 muffins" is shown as written. */
export function useServingsText() {
  const { t } = useI18n();
  return (servings?: string | null) => {
    const value = servings?.trim();
    if (!value) return null;
    return servingRange(value) ? t("card.servings", { count: value.replace(/\s*(servings?|portions?|people|persons?)$/i, "") }) : value;
  };
}

/** Time and servings on one line; missing values are omitted, never "not specified". */
export function RecipeMeta({ recipe, mode = "total", className = "", testId }: {
  recipe: RecipeTimeData & { id: string; servings?: string | null };
  mode?: RecipeTimeMode; className?: string; testId?: string;
}) {
  const { t } = useI18n();
  const servingsText = useServingsText()(recipe.servings);
  const minutes = recipeStageMinutes(recipe, mode);
  if (minutes === null && !servingsText) return null;
  return <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground ${className}`} data-testid={testId}>
    {minutes !== null && <span className="inline-flex items-center gap-1.5" data-testid={testId ? `${testId}-time` : undefined}>
      <Clock3 className="h-4 w-4" aria-hidden="true" />{t(mode === "preparation" ? "card.prepMinutes" : "card.totalMinutes", { count: minutes })}
    </span>}
    {servingsText && <span className="inline-flex items-center gap-1.5" data-testid={testId ? `${testId}-servings` : undefined}>
      <Users className="h-4 w-4" aria-hidden="true" />{servingsText}
    </span>}
  </p>;
}

/**
 * Compact nutrition: calories, protein, carbs, fat with an explicit basis and estimate label.
 * Missing data reads "Nutrition unavailable"; zero is never substituted and nothing is generated here.
 */
export function NutritionRow({ recipe, testId }: {
  recipe: NutritionFields & { id: string; servings?: string | null }; testId?: string;
}) {
  const { t, lang } = useI18n();
  const id = testId ?? `nutrition-row-${recipe.id}`;
  const nutrition = usableNutrition(recipe.nutrition);
  if (!nutrition) return <p className="text-sm text-muted-foreground" data-testid={id} data-state="unavailable">{t("nutrition.unavailableShort")}</p>;
  const basis = nutritionBasis(recipe.servings);
  const amounts = Object.fromEntries(nutritionAmounts(nutrition, recipe.servings).map(a => [a.key, a]));
  const show = (key: "caloriesKcal" | "proteinG" | "carbsG" | "fatG") => {
    const { min, max } = amounts[key];
    const digits = key === "caloriesKcal" ? 0 : 1;
    const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: digits });
    const value = fmt(min) === fmt(max) ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
    return t(`card.${key}`, { value });
  };
  const basisText = !basis ? t("nutrition.perRecipe") : basis.unit === "portion" ? t("nutrition.perServing") : t(`nutrition.per.${basis.unit}`);
  return <div className="text-sm" data-testid={id} data-state="available">
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-foreground">
      {(["caloriesKcal", "proteinG", "carbsG", "fatG"] as const).map(key =>
        <span key={key} className="tabular-nums" data-testid={`${id}-${key}`}>{show(key)}</span>)}
    </p>
    <p className="text-muted-foreground" data-testid={`${id}-basis`}>{basisText} · {t("nutrition.estimateLabel")}</p>
  </div>;
}
