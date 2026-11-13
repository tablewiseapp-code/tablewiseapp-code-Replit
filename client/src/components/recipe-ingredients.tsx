import { groupIngredients } from "@/lib/ingredient-groups";
import { useI18n } from "@/lib/i18n";
import { useRecipeDisplay } from "./recipe-display";

const mainGroups = new Set(["protein", "carbs", "vegetables"]);

// mainOnly: grouped view of protein, carbs and vegetables & fruit only (no fats, dairy, seasonings, other).
export function RecipeIngredients({ recipe, compact = false, mainOnly = false }: {
  recipe: { id: string; ingredients: string[] }; compact?: boolean; mainOnly?: boolean;
}) {
  const { showNutrition } = useRecipeDisplay();
  const { t } = useI18n();
  const itemClass = `${compact ? "text-xs text-muted-foreground" : "text-sm text-foreground"} break-words`;
  if (!showNutrition && !mainOnly) return <ul className="list-disc ps-4 space-y-1" data-testid={`ingredients-plain-${recipe.id}`}>
    {recipe.ingredients.map((ingredient, index) => <li key={index} className={itemClass} data-testid={`text-ingredient-${index}`}>{ingredient}</li>)}
  </ul>;
  return <div className="space-y-3" data-testid={`ingredients-grouped-${recipe.id}`}>
    {groupIngredients(recipe.ingredients).filter(group => !mainOnly || mainGroups.has(group.category)).map(group => (
      <section key={group.category} data-testid={`ingredient-group-${recipe.id}-${group.category}`}>
        <h3 className="mb-1 text-xs font-medium text-foreground">{t(`ingredients.group.${group.category}`)}</h3>
        <ul className="list-disc ps-4 space-y-1">
          {group.ingredients.map((ingredient, index) => <li key={index} className={itemClass}>{ingredient}</li>)}
        </ul>
      </section>
    ))}
  </div>;
}
