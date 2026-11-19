import { useState } from "react";
import { Link } from "wouter";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Minus, MoreHorizontal, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { mealSlots, moveOrSwap, occupant, setRecipeAt, setServingsAt, type MealSlot, type PlanState, type Slot } from "@/lib/meal-plan";
import { baseServings } from "@/lib/ingredient-scale";
import { recipeNameMatches } from "@/lib/planner-filters";
import { usePlannerCopy } from "@/lib/planner-copy";
import type { PlannerRecipe } from "@/lib/planner-recipes";
import type { RecipeTimeMode } from "@/lib/recipe-time";
import { NutritionRow, RecipeMeta } from "@/components/recipe-summary";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const pill = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ${focus}`;
const primary = `${pill} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`;
const secondary = `${pill} border border-border bg-white text-foreground hover:bg-accent`;
const choice = (active: boolean) =>
  `min-h-11 rounded-lg border px-1 text-sm ${focus} ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground"}`;

type Modal =
  | { kind: "pick"; slot: Slot }
  | { kind: "move"; slot: Slot }
  | { kind: "servings"; slot: Slot };

/** One day of the shown week, in display order (Monday first). `day` is the plan day (0 = Sunday). */
export type BoardDay = { day: number; short: string; long: string };

type Props = {
  plan: PlanState;
  recipes: Map<string, PlannerRecipe>;
  locked: boolean;
  /** Applies an edit and persists it. Returns false when nothing was saved (the page shows the error). */
  commit: (edit: (plan: PlanState) => PlanState) => boolean;
  notify: (message: string, destructive?: boolean) => void;
  days: BoardDay[];
  mealNames: Record<MealSlot, string>;
  recipeHref: (recipeId: string) => string;
  /** Eligible recipes for one slot, best first (Swap and Choose recipe). */
  options: (slot: Slot) => PlannerRecipe[];
  onPicked?: (recipeId: string) => void;
  servingsFallback: number | null;
  timeMode: RecipeTimeMode;
  showNutrition: boolean;
};

function Stepper({ value, onChange, label, fewer, more }: { value: number; onChange: (value: number) => void; label: string; fewer: string; more: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full border border-border">
      <button type="button" aria-label={fewer} disabled={value <= 1} onClick={() => onChange(value - 1)} className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
      <span className="min-w-8 text-center text-sm font-medium" aria-live="polite" data-testid="servings-value">{value}</span>
      <button type="button" aria-label={more} disabled={value >= 99} onClick={() => onChange(value + 1)} className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  );
}

function SlotCard({ slot, day, props, onOpen }: { slot: Slot; day: BoardDay; props: Props; onOpen: (modal: Modal) => void }) {
  const t = usePlannerCopy();
  const { plan, recipes, locked, mealNames, recipeHref, timeMode, showNutrition } = props;
  const { meal } = slot;
  const found = occupant(plan, meal, slot.day);
  const recipe = found ? recipes.get(found.recipeId) : undefined;
  const continued = !!found && found.startDay < slot.day;
  const drop = useDroppable({ id: `drop-${meal}-${slot.day}`, data: slot, disabled: locked });
  const drag = useDraggable({ id: `slot-${meal}-${slot.day}`, data: { from: slot }, disabled: locked || !recipe || continued });
  const title = recipe?.title ?? "";
  const label = recipe ? t("slotFilled", { day: day.long, meal: mealNames[meal], title }) : t("slotEmpty", { day: day.long, meal: mealNames[meal] });
  return (
    <article ref={drop.setNodeRef} aria-label={label} data-testid={`cell-${meal}-${slot.day}`} data-recipe={recipe?.id ?? ""}
      className={`rounded-lg border p-2 ${drop.isOver ? "border-primary bg-primary/10" : recipe ? "border-border bg-white" : "border-dashed border-amber-300 bg-amber-50/60"}`}>
      <div ref={drag.setNodeRef} {...(locked || continued ? {} : drag.listeners)} className={drag.isDragging ? "opacity-40" : ""}>
        <div className="flex items-start gap-1">
          <p className="min-w-0 flex-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{mealNames[meal]}</p>
          {recipe && !locked && !continued && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={t("more", { title })} data-testid={`menu-${meal}-${slot.day}`}
                className={`-me-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-foreground/5 ${focus}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onOpen({ kind: "servings", slot })} data-testid={`servings-${meal}-${slot.day}`}>{t("changeServings")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpen({ kind: "move", slot })} data-testid={`move-${meal}-${slot.day}`}>{t("move")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {recipe ? (
          <div className="space-y-1">
            <Link href={recipeHref(recipe.id)} className={`block break-words text-sm font-medium leading-snug text-foreground hover:underline ${focus}`} data-testid={`recipe-link-${meal}-${slot.day}`}>
              {continued ? "↳ " : ""}{title}
            </Link>
            <RecipeMeta recipe={{ ...recipe, servings: found?.servings ? String(found.servings) : recipe.servings }} mode={timeMode}
              className="gap-x-3 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5" testId={`meta-${meal}-${slot.day}`} />
            {showNutrition && <NutritionRow recipe={recipe} testId={`nutrition-${meal}-${slot.day}`} />}
          </div>
        ) : (
          <p className="text-sm text-amber-900" data-testid={`open-${meal}-${slot.day}`}>{locked ? "—" : t("noEligible")}</p>
        )}
      </div>
      {!locked && !continued && (
        <button type="button" onClick={() => onOpen({ kind: "pick", slot })} data-testid={`${recipe ? "swap" : "choose"}-${meal}-${slot.day}`}
          className={`mt-1 -ms-1 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-primary hover:bg-accent ${focus}`}>
          {recipe ? t("swap") : t("choose")}
        </button>
      )}
    </article>
  );
}

export function PlannerBoard(props: Props) {
  const { plan, recipes, locked, commit, notify, days, mealNames, options, onPicked, servingsFallback } = props;
  const t = usePlannerCopy();
  const [modal, setModal] = useState<Modal | null>(null);
  // Mouse drags after a short move; touch needs a long press, so scrolling the agenda on a phone never starts a drag.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const dayOf = (day: number) => days.find(d => d.day === day)!;
  const name = ({ day, meal }: Slot) => ({ day: dayOf(day).long, meal: mealNames[meal].toLowerCase() });
  const close = () => setModal(null);
  const move = (from: Slot, to: Slot) => { if (commit(p => moveOrSwap(p, from, to))) notify(t("moved", name(to))); };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const to = over?.data.current as Slot | undefined;
    const from = active.data.current?.from as Slot | undefined;
    if (to && from && !locked) move(from, to);
  };

  const current = modal ? occupant(plan, modal.slot.meal, modal.slot.day) : null;
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {/* One layout: a stacked agenda on phones; on wide screens seven columns whose meal rows line up (subgrid). */}
      <div className="space-y-5 lg:grid lg:grid-cols-7 lg:grid-rows-[auto_repeat(3,auto)] lg:gap-x-2 lg:gap-y-2 lg:space-y-0" data-testid="week-calendar">
        {days.map(day => (
          <section key={day.day} aria-labelledby={`day-heading-${day.day}`} className="space-y-2 lg:row-span-4 lg:grid lg:grid-rows-subgrid lg:gap-y-2 lg:space-y-0" data-testid={`day-${day.day}`}>
            <h2 id={`day-heading-${day.day}`} className="text-base font-medium text-foreground lg:text-sm">
              <span className="lg:hidden">{day.long}</span><span className="hidden lg:inline">{day.short}</span>
            </h2>
            {mealSlots.map(meal => <SlotCard key={meal} slot={{ day: day.day, meal }} day={day} props={props} onOpen={setModal} />)}
          </section>
        ))}
      </div>

      <Dialog open={!!modal} onOpenChange={open => !open && close()}>
        <DialogContent className="max-w-md" data-testid="planner-dialog">
          {modal?.kind === "pick" && (
            <PickForm slot={modal.slot} currentId={current?.recipeId ?? null} title={t(current ? "swapTitle" : "chooseTitle", name(modal.slot))}
              options={options(modal.slot)} onClose={close}
              onPick={recipe => {
                if (!commit(p => setRecipeAt(p, modal.slot, recipe.id, servingsFallback ?? baseServings(recipe.servings)))) return;
                onPicked?.(recipe.id);
                notify(t("swapped", { ...name(modal.slot), title: recipe.title }));
                close();
              }} />
          )}
          {modal?.kind === "move" && current && (
            <MoveForm from={modal.slot} plan={plan} title={recipes.get(current.recipeId)?.title ?? ""} days={days} mealNames={mealNames}
              titleOf={id => recipes.get(id)?.title ?? ""} onClose={close} onSubmit={to => { move(modal.slot, to); close(); }} />
          )}
          {modal?.kind === "servings" && current && (
            <ServingsForm title={recipes.get(current.recipeId)?.title ?? ""} initial={current.servings ?? servingsFallback ?? baseServings(recipes.get(current.recipeId)?.servings) ?? 1}
              onClose={close} onSubmit={value => commit(p => setServingsAt(p, modal.slot.meal, modal.slot.day, value)) && close()} />
          )}
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

/** The recipe picker for one slot: eligible alternatives, best first, with a name search. Cancel keeps the current recipe. */
function PickForm({ slot, currentId, title, options, onPick, onClose }: {
  slot: Slot; currentId: string | null; title: string; options: PlannerRecipe[]; onPick: (recipe: PlannerRecipe) => void; onClose: () => void;
}) {
  const t = usePlannerCopy();
  const [query, setQuery] = useState("");
  const shown = options.filter(r => r.id !== currentId && (!query.trim() || recipeNameMatches(r.title, query.trim())));
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{t("search")}</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label={t("search")} placeholder={t("search")} maxLength={120}
          className="min-h-11 w-full rounded-full border border-border bg-white ps-9 pe-3 text-base" data-testid="pick-search" />
      </div>
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto" data-testid={`pick-list-${slot.meal}-${slot.day}`}>
        {shown.length === 0 && <li className="text-sm text-muted-foreground">{t("noOptions")}</li>}
        {shown.map(recipe => (
          <li key={recipe.id}>
            <button type="button" onClick={() => onPick(recipe)} data-testid={`pick-${recipe.id}`}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-white p-2 text-start text-sm hover:bg-accent ${focus}`}>
              <span className="min-w-0 flex-1 break-words font-medium">{recipe.title}</span>
              <RecipeMeta recipe={{ ...recipe, servings: null }} className="shrink-0 text-xs" />
            </button>
          </li>
        ))}
      </ul>
      <DialogFooter><button type="button" className={secondary} onClick={onClose} data-testid="pick-cancel">{t("cancel")}</button></DialogFooter>
    </>
  );
}

/** Move meal without dragging: pick a day and meal. An occupied target trades places with this meal. */
function MoveForm({ from, plan, title, days, mealNames, titleOf, onSubmit, onClose }: {
  from: Slot; plan: PlanState; title: string; days: BoardDay[]; mealNames: Record<MealSlot, string>; titleOf: (id: string) => string;
  onSubmit: (to: Slot) => void; onClose: () => void;
}) {
  const t = usePlannerCopy();
  const [day, setDay] = useState(from.day);
  const [meal, setMeal] = useState<MealSlot>(from.meal);
  const same = day === from.day && meal === from.meal;
  const other = same ? null : occupant(plan, meal, day);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("moveTitle", { title })}</DialogTitle>
        <DialogDescription className="sr-only">{t("day")} / {t("meal")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("day")}</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(d => (
              <button key={d.day} type="button" aria-pressed={day === d.day} aria-label={d.long} onClick={() => setDay(d.day)} data-testid={`move-day-${d.day}`} className={`${choice(day === d.day)} text-xs`}>{d.short}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("meal")}</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {mealSlots.map(slot => (
              <button key={slot} type="button" aria-pressed={meal === slot} onClick={() => setMeal(slot)} data-testid={`move-meal-${slot}`} className={choice(meal === slot)}>{mealNames[slot]}</button>
            ))}
          </div>
        </fieldset>
        {other && <p role="status" className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="move-trade">
          {t("moveTrade", { day: days.find(d => d.day === day)!.long, meal: mealNames[meal].toLowerCase(), title: titleOf(other.recipeId) })}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={secondary} onClick={onClose}>{t("cancel")}</button>
          <button type="button" disabled={same} onClick={() => onSubmit({ day, meal })} data-testid="button-confirm-move" className={primary}>{t("moveBtn")}</button>
        </DialogFooter>
      </div>
    </>
  );
}

function ServingsForm({ title, initial, onSubmit, onClose }: { title: string; initial: number; onSubmit: (value: number) => void; onClose: () => void }) {
  const t = usePlannerCopy();
  const [value, setValue] = useState(initial);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("servingsTitle", { title })}</DialogTitle>
        <DialogDescription className="sr-only">{t("servingsLabel")}</DialogDescription>
      </DialogHeader>
      <Stepper value={value} onChange={setValue} label={t("servingsLabel")} fewer={t("fewer")} more={t("more2")} />
      <DialogFooter className="gap-2 sm:gap-2">
        <button type="button" className={secondary} onClick={onClose}>{t("cancel")}</button>
        <button type="button" className={primary} onClick={() => onSubmit(value)} data-testid="button-save-servings">{t("save")}</button>
      </DialogFooter>
    </>
  );
}
