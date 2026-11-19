import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecipeCreditLine } from "@/components/recipe-credit";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";
import { activePreferenceChips } from "@/lib/active-preferences";
import { loadSettings } from "@/lib/basic-settings";
import type { MealSlot } from "@/lib/meal-plan";
import { checkEligibility, personalize } from "@/lib/preference-engine";
import { householdText } from "@/lib/household-copy";
import { toPlannerRecipes } from "@/lib/planner-recipes";
import type { Recipe } from "@/lib/storage";

/** Home → Suggest a recipe: one eligible recipe for today from the household settings; "Start cooking" opens Zen mode.
 * Neither the Week nor groceries change. (+ Add breakfast/lunch/dinner is MealGenerator.) */
export function MealSuggestion({ meal, day, catalog, onClose }: { meal: MealSlot | null; day: number; catalog: Recipe[]; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { t: view } = useRecipeViewCopy();
  const [index, setIndex] = useState(0);
  const settings = useMemo(() => loadSettings(), [meal]);
  const mealName = meal ? t(`meals.${meal.toLowerCase()}`) : "";
  const text = (key: Parameters<typeof homeText>[1]) => homeText(lang, key, { meal: mealName.toLocaleLowerCase(lang), Meal: mealName });
  const h = (key: Parameters<typeof householdText>[1]) => householdText(lang, key);

  // Basic Settings only (household, allergies, diets, devices, this meal's rule). Week → Plan filters are not applied here.
  const chips = meal ? activePreferenceChips(settings, lang, m => t(`meals.${m.toLowerCase()}`))
    .filter(c => c.group === "hard" || c.id === "household" || c.id === "servings" || c.id === `meal-${meal.toLowerCase()}`) : [];
  const suggestions = useMemo(() => {
    if (!meal) return [];
    // The one eligibility rule (with today's weeknight limit), then ranking by the household's preferences.
    const candidates = toPlannerRecipes(catalog).filter(r => r.mealType === meal && checkEligibility(r, settings, undefined, meal, day).eligible);
    return personalize(candidates, settings, { meals: [meal], day: day === 0 || day === 6 ? "weekend" : "weekday" }).eligible.map(e => e.recipe);
  }, [meal, catalog, settings, day]);
  const recipe = suggestions.length ? suggestions[index % suggestions.length] : null;

  const close = () => { setIndex(0); onClose(); };

  return (
    <Dialog open={meal !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-w-md" data-testid="meal-suggestion">
        <DialogHeader>
          <DialogTitle>{h("suggestTitle")}</DialogTitle>
          <DialogDescription>{h("suggestUsing")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5" data-testid="meal-suggestion-filters">
          {chips.length === 0 && <span className="text-sm text-muted-foreground">{text("pickNoSettings")}</span>}
          {chips.map(c => <span key={c.id} className="tag" data-testid={`meal-suggestion-chip-${c.id}`}>{c.text}</span>)}
          <Link href="/settings" className="btn btn-text" data-testid="meal-suggestion-edit-settings">{text("pickEdit")}</Link>
        </div>

        {recipe ? (
          <div className="rounded-lg border hairline bg-white p-3" data-testid="meal-suggestion-recipe" data-recipe-id={recipe.id}>
            <p className="text-xs font-medium text-muted-foreground">{text("pickHowAbout")}</p>
            <Link href={`/recipe/${encodeURIComponent(recipe.id)}`} className="mt-1 block text-base font-semibold text-foreground underline-offset-2 hover:underline">{recipe.title}</Link>
            {recipe.minutes > 0 && <p className="text-sm text-muted-foreground">{recipe.minutes} {view("minutes")}</p>}
            <RecipeCreditLine recipe={recipe} />
          </div>
        ) : (
          <p className="rounded-lg bg-foreground/5 p-3 text-sm" role="status" data-testid="meal-suggestion-none">{h("suggestNone")}</p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {suggestions.length > 1 && <button type="button" className="btn btn-secondary" onClick={() => setIndex(i => i + 1)} data-testid="meal-suggestion-another">{text("pickAnother")}</button>}
          {recipe && <Link href={`/recipe/${encodeURIComponent(recipe.id)}?cook`} className="btn btn-primary" data-testid="meal-suggestion-cook">{h("startCooking")}</Link>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
