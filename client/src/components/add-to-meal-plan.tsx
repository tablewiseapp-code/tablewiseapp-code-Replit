import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchRecipes } from "@/lib/storage";
import { addToPlan, checkAdd, isWeekLocked, mealSlots, readPlan, writePlan, type MealSlot } from "@/lib/meal-plan";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";

const pill = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const choice = (active: boolean) => `min-h-11 rounded-lg border px-3 text-sm ${active ? "border-[#42624e] bg-[#42624e] text-white" : "border-[#d9dfd4] bg-white text-foreground"}`;

export function AddToMealPlanDialog({ open, onOpenChange, recipe, servings, plannerHref, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSaved?: () => void;
  recipe: { id: string; title: string }; servings: number | null; plannerHref: string;
}) {
  const { t, list } = useRecipeViewCopy();
  const days = list("days"), mealNames = list("meals");
  const [day, setDay] = useState(() => new Date().getDay());
  const [meal, setMeal] = useState<MealSlot>("Dinner");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false);
  const [saved, setSaved] = useState<{ day: number; meal: MealSlot } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(null); setError(null); setReplace(false);
    fetchRecipes().then(all => setTitles(Object.fromEntries(all.map(r => [r.id, r.title])))).catch(() => undefined);
  }, [open]);
  useEffect(() => { setReplace(false); setError(null); }, [day, meal]);

  const plan = useMemo(() => (open ? readPlan() : null), [open, saved]);
  const locked = open && isWeekLocked();
  const check = plan ? checkAdd(plan, { recipeId: recipe.id, day, meal }) : { status: "free" as const };
  const slotName = (d: number, m: MealSlot) => ({ day: days[d], meal: mealNames[mealSlots.indexOf(m)].toLowerCase() });

  const confirm = () => {
    if (!plan || locked) return;
    if (check.status === "conflict" && !replace) { setReplace(true); return; }
    try {
      writePlan(addToPlan(plan, { recipeId: recipe.id, day, meal, servings }, replace));
      setSaved({ day, meal });
      onSaved?.();
    } catch { setError(t("planFailed")); }
  };

  const message = locked ? t("planLocked")
    : check.status === "same" ? t("planSame", slotName(day, meal))
    : check.status === "full" ? t("planFull", { count: plan?.selectedIds.length ?? 0 })
    : check.status === "conflict" ? t("planConflict", { ...slotName(day, meal), title: titles[check.existing.recipeId] ?? "…",
      span: check.existing.spanDays > 1 ? t("planSpan", { count: check.existing.spanDays }) : "" })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="add-to-plan-dialog">
        <DialogHeader>
          <DialogTitle>{t("planTitle")}</DialogTitle>
          <DialogDescription>{recipe.title}{servings ? ` · ${t("servings", { count: servings })}` : ""}</DialogDescription>
        </DialogHeader>
        {saved ? (
          <div className="space-y-4" role="status" data-testid="add-to-plan-success">
            <p className="text-sm">{t("planSaved", slotName(saved.day, saved.meal))}</p>
            <DialogFooter className="gap-2 sm:gap-2">
              <button type="button" className={`${pill} border border-[#d9dfd4] bg-white text-foreground`} onClick={() => onOpenChange(false)}>{t("planClose")}</button>
              <Link href={plannerHref} className={`${pill} bg-[#42624e] text-white`} data-testid="link-open-planner">{t("planViewPlanner")}</Link>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("planDay")}</legend>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((name, index) => (
                  <button key={index} type="button" aria-pressed={day === index} onClick={() => setDay(index)}
                    data-testid={`plan-day-${index}`} className={`${choice(day === index)} px-0 text-xs`}>{name}</button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("planMeal")}</legend>
              <div className="grid grid-cols-3 gap-1.5">
                {mealSlots.map((slot, index) => (
                  <button key={slot} type="button" aria-pressed={meal === slot} onClick={() => setMeal(slot)}
                    data-testid={`plan-meal-${slot}`} className={choice(meal === slot)}>{mealNames[index]}</button>
                ))}
              </div>
            </fieldset>
            {message && <p role={check.status === "conflict" && !locked ? "status" : "alert"} className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="add-to-plan-message">{message}</p>}
            {error && <p role="alert" className="text-sm text-red-600" data-testid="add-to-plan-error">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-2">
              <button type="button" className={`${pill} border border-[#d9dfd4] bg-white text-foreground`} onClick={() => onOpenChange(false)}>{t("cancel")}</button>
              <button type="button" onClick={confirm} disabled={locked || check.status === "same" || check.status === "full"}
                data-testid="button-confirm-add-to-plan" className={`${pill} bg-[#42624e] text-white disabled:opacity-50`}>
                {check.status === "conflict" ? t("planReplace") : t("planConfirm")}
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
