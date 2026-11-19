import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecipeCreditLine } from "@/components/recipe-credit";
import { RecipeViewRows } from "@/components/recipe-summary";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";
import { activePreferenceChips } from "@/lib/active-preferences";
import { householdServings, loadSettings } from "@/lib/basic-settings";
import { addToPlan, checkAdd, isWeekLocked, readPlan, writePlan, type MealSlot } from "@/lib/meal-plan";
import { checkEligibility, personalize } from "@/lib/preference-engine";
import { householdText } from "@/lib/household-copy";
import { toPlannerRecipes } from "@/lib/planner-recipes";
import type { Recipe } from "@/lib/storage";

/** Home "+ Add lunch": suggest one recipe for today's empty meal from the household settings, and add it only when the person agrees.
 * mode "cook" (Home → Suggest a recipe): the same eligibility, but "Start cooking" opens Zen mode and the Week is not changed. */
export function MealSuggestion({ meal, day, catalog, onClose, onAdded, mode = "add" }: {
  meal: MealSlot | null; day: number; catalog: Recipe[]; onClose: () => void; onAdded: () => void; mode?: "add" | "cook";
}) {
  const { t, lang } = useI18n();
  const { t: view } = useRecipeViewCopy();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  const settings = useMemo(() => loadSettings(), [meal]);
  const mealName = meal ? t(`meals.${meal.toLowerCase()}`) : "";
  const text = (key: Parameters<typeof homeText>[1]) => homeText(lang, key, { meal: mealName.toLocaleLowerCase(lang), Meal: mealName });
  const cook = mode === "cook";
  const h = (key: Parameters<typeof householdText>[1]) => householdText(lang, key);

  // Basic Settings only (household, allergies, diets, devices, this meal's rule). Week → Plan filters are not applied here.
  const chips = meal ? activePreferenceChips(settings, lang, m => t(`meals.${m.toLowerCase()}`))
    .filter(c => c.group === "hard" || c.id === "household" || c.id === "servings" || c.id === `meal-${meal.toLowerCase()}`) : [];
  const suggestions = useMemo(() => {
    if (!meal) return [];
    const planned = cook ? new Set<string>() : new Set(readPlan().planAssignments.map(a => a.recipeId));
    // The one eligibility rule (with today's weeknight limit), then ranking by the household's preferences.
    const candidates = toPlannerRecipes(catalog).filter(r => r.mealType === meal && !planned.has(r.id) && checkEligibility(r, settings, undefined, meal, day).eligible);
    return personalize(candidates, settings, { meals: [meal], day: day === 0 || day === 6 ? "weekend" : "weekday" }).eligible.map(e => e.recipe);
  }, [meal, catalog, settings, day, cook]);
  const recipe = suggestions.length ? suggestions[index % suggestions.length] : null;

  const locked = !cook && meal !== null && isWeekLocked();
  const check = meal && recipe ? checkAdd(readPlan(), { recipeId: recipe.id, day, meal }) : null;
  const blocked = locked ? view("planLocked") : check?.status === "full" ? view("planFull", { count: readPlan().selectedIds.length }) : null;

  const close = () => { setIndex(0); setError(false); onClose(); };
  const add = () => {
    if (!meal || !recipe || blocked) return;
    try { writePlan(addToPlan(readPlan(), { recipeId: recipe.id, day, meal, servings: householdServings(settings) })); onAdded(); close(); }
    catch { setError(true); }
  };

  return (
    <Dialog open={meal !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-w-md" data-testid="meal-suggestion">
        <DialogHeader>
          <DialogTitle>{cook ? h("suggestTitle") : text("pickTitle")}</DialogTitle>
          <DialogDescription>{cook ? h("suggestUsing") : text("pickUsing")}</DialogDescription>
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
            <RecipeViewRows recipe={recipe} testId="meal-suggestion-view" />
            <RecipeCreditLine recipe={recipe} />
          </div>
        ) : (
          <p className="rounded-lg bg-foreground/5 p-3 text-sm" role="status" data-testid="meal-suggestion-none">{cook ? h("suggestNone") : text("pickNone")}</p>
        )}
        {blocked && <p role="alert" className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="meal-suggestion-blocked">{blocked}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{view("planFailed")}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          {suggestions.length > 1 && <button type="button" className="btn btn-secondary" onClick={() => setIndex(i => i + 1)} data-testid="meal-suggestion-another">{text("pickAnother")}</button>}
          {recipe && cook
            ? <Link href={`/recipe/${encodeURIComponent(recipe.id)}?cook`} className="btn btn-primary" data-testid="meal-suggestion-cook">{h("startCooking")}</Link>
            : recipe
            ? <button type="button" className="btn btn-primary" onClick={add} disabled={Boolean(blocked)} data-testid="meal-suggestion-add">{text("pickAdd")}</button>
            : <Link href="/meals?plan" className="btn btn-secondary">{text("pickOpenWeek")}</Link>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
