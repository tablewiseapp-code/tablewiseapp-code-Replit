import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addBatch, cookedOn, maxDishes, readPlan, writePlan } from "@/lib/meal-plan";
import { householdCounts, loadSettings } from "@/lib/basic-settings";
import { calendarDate, currentWeek } from "@/lib/week-plan";
import { shiftDate } from "@shared/cooking-plan";
import { useI18n } from "@/lib/i18n";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { useRecipeDisplay } from "@/components/recipe-display";
import { RecipeCard } from "@/components/recipe-card";

const pill = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const choice = (active: boolean) => `relative min-h-11 rounded-lg border px-1 text-xs ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground"}`;

/** The dishes already cooked on the chosen date, as the Week's compact cards (only Dietary tags among the details, as there). */
function DayDishes({ recipeIds }: { recipeIds: string[] }) {
  const { data } = useRecipeCatalog();
  const { recipeView } = useRecipeDisplay();
  const view = { ...recipeView, details: recipeView.details.filter(d => d === "dietaryTags") };
  const recipes = recipeIds.map(id => data?.find(r => r.id === id)).filter(r => !!r);
  if (!recipes.length) return null;
  return <div className="space-y-2" data-testid="add-to-plan-day-dishes">
    {recipes.map((r, i) => <RecipeCard key={`${r.id}-${i}`} recipe={r} compact href={`/recipe/${r.id}`} view={view} testId={`add-to-plan-dish-${r.id}`} />)}
  </div>;
}

/** Recipe page and My Ideas → "Add to plan": a dish cooked on a date of this week, beside anything already there.
 * Its first serving date is the cooking date at the household's adults and kids (Edit servings on the Week changes it). */
export function AddToMealPlanDialog({ open, onOpenChange, recipe, plannerHref, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSaved?: () => void;
  recipe: { id: string; title: string }; plannerHref: string;
}) {
  const { lang } = useI18n();
  const { t } = useRecipeViewCopy();
  const week = currentWeek();
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
  const [date, setDate] = useState(() => calendarDate(new Date()));
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setSaved(null); setError(null); } }, [open]);
  const fmt = (d: string, long = false) => new Intl.DateTimeFormat(lang, long ? { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  const plan = useMemo(() => (open ? readPlan() : null), [open, saved]);
  const again = !!plan && cookedOn(plan, date).some(b => b.recipeId === recipe.id);
  const full = !!plan && plan.batches.length >= maxDishes;
  const cooking = new Set(plan?.batches.map(b => b.cookDate));
  const confirm = () => {
    if (!plan || full) return;
    try {
      writePlan(addBatch(plan, recipe.id, date, householdCounts(loadSettings())));
      setSaved(date);
      onSaved?.();
    } catch { setError(t("planFailed")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="add-to-plan-dialog">
        <DialogHeader>
          <DialogTitle>{t("planTitle")}</DialogTitle>
          <DialogDescription>{recipe.title}</DialogDescription>
        </DialogHeader>
        {saved ? (
          <div className="space-y-4" role="status" data-testid="add-to-plan-success">
            <p className="text-sm">{t("planAdded", { date: fmt(saved, true) })}</p>
            <DialogFooter className="gap-2 sm:gap-2">
              <button type="button" className={`${pill} border border-border bg-white text-foreground`} onClick={() => onOpenChange(false)}>{t("planClose")}</button>
              <Link href={plannerHref} className={`${pill} bg-primary text-white`} data-testid="link-open-planner">{t("planViewPlanner")}</Link>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("planDay")}</legend>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map(d => (
                  <button key={d} type="button" aria-pressed={date === d} aria-label={cooking.has(d) ? `${fmt(d, true)}, ${t("planCookingDay")}` : fmt(d, true)} onClick={() => setDate(d)}
                    data-testid={`plan-date-${d}`} data-cooking={cooking.has(d) || undefined} className={choice(date === d)}>
                    {fmt(d)}
                    {cooking.has(d) && <span aria-hidden className={`absolute bottom-1 start-1/2 size-1.5 -translate-x-1/2 rtl:translate-x-1/2 rounded-full ${date === d ? "bg-white" : "bg-primary"}`} />}
                  </button>
                ))}
              </div>
            </fieldset>
            {plan && <DayDishes recipeIds={cookedOn(plan, date).map(b => b.recipeId)} />}
            {(again || full) && <p role="status" className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="add-to-plan-message">
              {full ? t("planFull", { count: plan!.batches.length }) : t("planAgain", { date: fmt(date, true) })}</p>}
            {error && <p role="alert" className="text-sm text-red-600" data-testid="add-to-plan-error">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-2">
              <button type="button" className={`${pill} border border-border bg-white text-foreground`} onClick={() => onOpenChange(false)}>{t("cancel")}</button>
              <button type="button" onClick={confirm} disabled={full} data-testid="button-confirm-add-to-plan" className={`${pill} bg-primary text-white disabled:opacity-50`}>{t("planConfirm")}</button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
