import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addBatch, cookedOn, maxDishes, readPlan, writePlan } from "@/lib/meal-plan";
import { householdCounts, loadSettings } from "@/lib/basic-settings";
import { calendarDate, currentWeek } from "@/lib/week-plan";
import { shiftDate } from "@shared/cooking-plan";
import { useI18n } from "@/lib/i18n";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";

const pill = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const choice = (active: boolean) => `min-h-11 rounded-lg border px-1 text-xs ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground"}`;

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
                  <button key={d} type="button" aria-pressed={date === d} aria-label={fmt(d, true)} onClick={() => setDate(d)}
                    data-testid={`plan-date-${d}`} className={choice(date === d)}>{fmt(d)}</button>
                ))}
              </div>
            </fieldset>
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
