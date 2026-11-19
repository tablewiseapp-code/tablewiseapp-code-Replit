import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { useHouseholdCopy } from "@/lib/household-copy";
import { limitingReasons } from "@/lib/active-preferences";
import { householdServings, loadSettings, updateSettings, type BasicSettings } from "@/lib/basic-settings";
import { addToPlan, moveTo, occupant, removeAt, type PlanState } from "@/lib/meal-plan";
import { total } from "@/lib/preference-engine";
import type { PlannerRecipe } from "@/lib/planner-recipes";
import { cookingEvenings, dinnerEligibility, openEvening, rankedForDay, replaceDinner, swapDinner, weekOrder } from "@/lib/week-suggestions";
import { currentWeek } from "@/lib/week-plan";
import { usePlannerCopy } from "@/lib/planner-copy";

const DINNER = "Dinner" as const;

/** Week → plan: the dinners suggested from Your household, one row per evening. Approve in one action, or swap and update first.
 * Every change goes through the page's commit (same persistence and lock as the board below). */
export function DinnerReview({ plan, recipes, settings, locked, commit, notify, onApprove, onEdit, fits }: {
  plan: PlanState; recipes: PlannerRecipe[]; settings: BasicSettings; locked: boolean; fits: (recipe: PlannerRecipe) => boolean;
  commit: (edit: (plan: PlanState) => PlanState) => boolean; notify: (message: string, destructive?: boolean) => void;
  onApprove: () => void; onEdit: () => void;
}) {
  const { t: app, lang } = useI18n();
  const t = useHouseholdCopy();
  const plannerText = usePlannerCopy();
  const [, setLocation] = useLocation();
  const [choosing, setChoosing] = useState<number | null>(null);
  const byId = new Map(recipes.map(r => [r.id, r]));
  const dayName = (day: number) => app(`meals.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day]}`);
  const evenings = cookingEvenings(settings);
  const days = weekOrder.filter(day => evenings.includes(day) || occupant(plan, DINNER, day));
  const planned = new Set(plan.planAssignments.map(a => a.recipeId));
  const memberName = (id: string) => settings.household.members.find(m => m.id === id)?.name ?? null;

  // The draft bookkeeping lives in Basic Settings: swapped-out dinners are not offered again in this draft.
  const track = (from: string | null, to: string | null) => {
    try {
      updateSettings(s => ({ ...s, setup: { ...s.setup,
        suggested: [...s.setup.suggested.filter(id => id !== from), ...(to && from && s.setup.suggested.includes(from) ? [to] : [])],
        declined: from ? [...new Set([...s.setup.declined, from])] : s.setup.declined } }));
    } catch { /* the swap itself is saved; only the "don't offer again" note is lost */ }
  };
  const swap = (day: number) => {
    const current = occupant(plan, DINNER, day);
    const result = swapDinner(plan, recipes, loadSettings(), day, currentWeek(), fits);
    if (!result) return notify(t("noAlternative", { day: dayName(day) }));
    if (commit(() => result.plan)) { track(current!.recipeId, result.recipe.id); notify(t("swapped", { day: dayName(day), title: result.recipe.title })); }
  };
  const choose = (day: number, recipeId: string) => {
    const current = occupant(plan, DINNER, day);
    const ok = commit(p => current ? replaceDinner(p, day, recipeId)
      : addToPlan(p, { recipeId, day, meal: DINNER, servings: householdServings(settings) }));
    if (ok) { if (current) track(current.recipeId, null); setChoosing(null); }
  };
  const leaveOpen = (day: number) => { if (commit(p => removeAt(p, DINNER, day))) notify(t("leftOpen", { day: dayName(day) })); };
  const move = (from: number, to: number) => { if (commit(p => moveTo(p, { day: from, meal: DINNER }, { day: to, meal: DINNER }))) notify(t("moved", { day: dayName(to) })); };
  const options = choosing === null ? [] : rankedForDay(recipes, loadSettings(), choosing, { exclude: planned, seed: currentWeek(), fits }).slice(0, 12);

  return (
    <section className="card mb-4 p-3 sm:p-4" aria-labelledby="dinner-review-title" data-testid="dinner-review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="dinner-review-title" className="text-base font-semibold">{t("reviewTitle")}</h2>
          <p className="text-sm text-muted-foreground" data-testid="dinner-review-status">{t(locked ? "reviewApproved" : "reviewDraft")}</p>
        </div>
        {locked
          ? <button type="button" onClick={onEdit} className="btn btn-secondary" data-testid="button-edit-week">{t("edit")}</button>
          : <button type="button" onClick={onApprove} disabled={!plan.planAssignments.length} className="btn btn-primary" data-testid="button-approve-week">{t("approve")}</button>}
      </div>
      <ul className="mt-3 divide-y divide-border">
        {days.map(day => {
          const found = occupant(plan, DINNER, day);
          const recipe = found ? byId.get(found.recipeId) : undefined;
          const minutes = recipe ? total(recipe) : null;
          const why = found ? null : openEvening(recipes, settings, day, planned, fits);
          const moveTargets = recipe ? weekOrder.filter(d => d !== day && !occupant(plan, DINNER, d) && dinnerEligibility(recipe, settings, d).eligible) : [];
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid={`dinner-${day}`} data-recipe-id={found?.recipeId ?? ""}>
              <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground">{dayName(day)}</span>
              <div className="min-w-0 flex-1">
                {recipe ? <>
                  <Link href={`/recipe/${encodeURIComponent(recipe.id)}`} className="text-sm font-medium text-foreground underline-offset-2 hover:underline">{recipe.title}</Link>
                  <p className="text-xs text-muted-foreground">{[minutes ? t("minutes", { n: minutes }) : t("timeUnknown"), found?.servings ? t("servings", { n: found.servings }) : null].filter(Boolean).join(" · ")}</p>
                </> : <>
                  <p className="text-sm text-muted-foreground">{t("openEvening")}</p>
                  {why && <div className="text-xs text-muted-foreground" data-testid={`open-reason-${day}`}>
                    {t(why.reason === "noMatch" ? "openNoMatch" : why.reason === "filtered" ? "openFiltered" : why.reason === "allUsed" ? "openAllUsed" : "openFull", { day: dayName(day) })}
                    {why.reason === "noMatch" && <> {t("openBecause")} {limitingReasons(why.excluded, lang, memberName).join("; ")}</>}
                    {" "}<button type="button" className="btn btn-text min-h-0 px-1 text-xs" onClick={() => setLocation("/household")} data-testid={`edit-prefs-${day}`}>{t("editPrefs")}</button>
                  </div>}
                </>}
              </div>
              {!locked && <div className="flex basis-full justify-end gap-1 sm:basis-auto sm:shrink-0">
                {found && <button type="button" onClick={() => swap(day)} className="btn btn-secondary" data-testid={`swap-${day}`}>{t("swap")}</button>}
                <DropdownMenu>
                  <DropdownMenuTrigger className="btn btn-text" data-testid={`update-${day}`}>{t("update")}</DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setChoosing(day)} data-testid={`choose-${day}`}>{t("choose")}</DropdownMenuItem>
                    {moveTargets.length > 0 && <>
                      <DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-muted-foreground">{t("move")}</DropdownMenuLabel>
                      {moveTargets.map(d => <DropdownMenuItem key={d} onSelect={() => move(day, d)} data-testid={`move-${day}-${d}`}>{t("moveTo", { day: dayName(d) })}</DropdownMenuItem>)}
                    </>}
                    {found && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => leaveOpen(day)} data-testid={`leave-open-${day}`}>{t("leaveOpen")}</DropdownMenuItem></>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>}
            </li>
          );
        })}
      </ul>
      <Link href="/household" className="btn btn-text -ms-2 mt-1" data-testid="link-household">{t("changeHousehold")}</Link>

      <Dialog open={choosing !== null} onOpenChange={open => { if (!open) setChoosing(null); }}>
        <DialogContent className="max-w-md" data-testid="choose-dinner">
          <DialogHeader>
            <DialogTitle>{choosing !== null && t("chooseTitle", { day: dayName(choosing) })}</DialogTitle>
            <DialogDescription className="sr-only">{t("choose")}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {options.length === 0 && choosing !== null && <li className="text-sm text-muted-foreground">{t("chooseEmpty", { day: dayName(choosing) })}</li>}
            {options.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => choose(choosing!, r.id)} data-testid={`choose-recipe-${r.id}`}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-2 text-start text-sm hover:bg-accent">
                  <span className="min-w-0 break-words font-medium">{r.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{total(r) ? t("minutes", { n: total(r)! }) : t("timeUnknown")}</span>
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter><button type="button" className="btn btn-secondary" onClick={() => setChoosing(null)}>{plannerText("cancel")}</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
