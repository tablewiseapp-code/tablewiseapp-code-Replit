import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Minus, MoreHorizontal, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addToPlan, checkAdd, mealSlots, moveTo, occupant, removeAt, repeatOn, setServingsAt, type MealSlot, type PlanState, type Slot } from "@/lib/meal-plan";
import { baseServings } from "@/lib/ingredient-scale";
import { recipeStageMinutes } from "@/lib/recipe-time";
import { usePlannerCopy } from "@/lib/planner-copy";
import type { PlannerRecipe } from "@/lib/planner-recipes";

// Same tokens as the Recipe View (recipe-detail.tsx / add-to-meal-plan.tsx).
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const pill = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ${focus}`;
const primary = `${pill} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`;
const secondary = `${pill} border border-border bg-white text-foreground hover:bg-accent`;
const choice = (active: boolean, disabled = false) =>
  `min-h-11 rounded-lg border px-3 text-sm ${focus} ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground"} ${disabled ? "opacity-40" : ""}`;

type Modal =
  | { kind: "plan"; recipeId: string; day?: number; meal?: MealSlot }
  | { kind: "pick"; day: number; meal: MealSlot; replace: boolean }
  | { kind: "repeat"; recipeId: string; day: number; meal: MealSlot }
  | { kind: "servings"; day: number; meal: MealSlot }
  | { kind: "remove"; day: number; meal: MealSlot };

type Props = {
  recipes: PlannerRecipe[];
  plan: PlanState;
  locked: boolean;
  /** Applies an edit and persists it. Returns false when nothing was saved (the page shows the error). */
  commit: (edit: (plan: PlanState) => PlanState) => boolean;
  notify: (message: string, destructive?: boolean) => void;
  dayNames: string[];
  mealNames: string[];
  onView: (recipeId: string) => void;
  /** Whether a recipe meets a meal's own settings; the slot picker lists those first. */
  fitsMeal?: (recipe: PlannerRecipe, meal: MealSlot) => boolean;
  /** Label above the recipes that don't meet the meal's settings. */
  othersLabel?: string;
};

/** addToPlan drops a replaced recipe from the shortlist; the planner keeps it so it can be planned again. */
const addKeepingShortlist = (plan: PlanState, req: Parameters<typeof addToPlan>[1], replace: boolean): PlanState => {
  const next = addToPlan(plan, req, replace);
  return next === plan ? plan : { ...next, selectedIds: Array.from(new Set([...plan.selectedIds, ...next.selectedIds])) };
};

function Stepper({ value, onChange, label, fewer, more }: { value: number; onChange: (value: number) => void; label: string; fewer: string; more: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full border border-border">
      <button type="button" aria-label={fewer} disabled={value <= 1} onClick={() => onChange(value - 1)} className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
      <span className="min-w-8 text-center text-sm font-medium" aria-live="polite">{value}</span>
      <button type="button" aria-label={more} disabled={value >= 99} onClick={() => onChange(value + 1)} className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  );
}

function RecipeCard({ recipe, locked, onPlan, onView }: { recipe: PlannerRecipe; locked: boolean; onPlan: () => void; onView: () => void }) {
  const t = usePlannerCopy();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `recipe-${recipe.id}`, data: { recipeId: recipe.id }, disabled: locked });
  const prep = recipeStageMinutes(recipe, "preparation");
  const servings = baseServings(recipe.servings);
  const facts = [prep ? t("prep", { count: prep }) : null, servings ? t("servings", { count: servings }) : null].filter(Boolean).join(" · ");
  return (
    <li ref={setNodeRef} {...(locked ? {} : listeners)} {...(locked ? {} : attributes)} aria-roledescription={locked ? undefined : "draggable"}
      className={`flex items-center gap-3 rounded-lg border hairline bg-white p-3 ${locked ? "" : "cursor-grab"} ${isDragging ? "opacity-40" : ""}`} data-testid={`selected-recipe-${recipe.id}`}>
      {recipe.image && <img src={recipe.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{recipe.title}</p>
        {facts && <p className="text-xs text-muted-foreground">{facts}</p>}
        <div className="mt-1 flex items-center gap-1">
          <button type="button" onClick={onView} className={`-ms-2 min-h-11 rounded-full px-2 text-xs font-medium text-primary hover:bg-accent ${focus}`} data-testid={`view-recipe-${recipe.id}`}>{t("view")}</button>
          <button type="button" onClick={onPlan} disabled={locked} className={`${pill} ms-auto bg-primary px-3 text-xs text-white hover:bg-primary-hover disabled:opacity-50`} data-testid={`plan-recipe-${recipe.id}`}>
            <Plus className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t("plan")}
          </button>
        </div>
      </div>
    </li>
  );
}

function SlotCell({ day, meal, plan, recipes, locked, dayName, mealName, onOpen, onView }: {
  day: number; meal: MealSlot; plan: PlanState; recipes: Map<string, PlannerRecipe>; locked: boolean; dayName: string; mealName: string;
  onOpen: (modal: Modal) => void; onView: (recipeId: string) => void;
}) {
  const t = usePlannerCopy();
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${meal}-${day}`, data: { day, meal }, disabled: locked });
  const found = occupant(plan, meal, day);
  const recipe = found ? recipes.get(found.recipeId) : undefined;
  const continued = !!found && found.startDay < day;
  const drag = useDraggable({ id: `slot-${meal}-${day}`, data: { from: { day, meal } }, disabled: locked || !found || continued });
  const title = recipe?.title ?? "…";
  const servings = found?.servings ? t("servings", { count: found.servings }) : null;
  return (
    <div ref={setNodeRef} data-testid={`cell-${meal}-${day}`} role="group"
      aria-label={found ? t("slotFilled", { day: dayName, meal: mealName, title }) : t("slotEmpty", { day: dayName, meal: mealName })}
      className={`rounded-lg border p-2 ${isOver ? "border-primary bg-primary/10" : found ? "border-primary/40 bg-accent" : "border-dashed border-border bg-white"}`}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{mealName}</p>
      {found ? (
        <div className={`flex items-start gap-1 ${drag.isDragging ? "opacity-40" : ""}`}>
          <div ref={drag.setNodeRef} {...(continued || locked ? {} : drag.listeners)} {...(continued || locked ? {} : drag.attributes)} className={`flex min-w-0 flex-1 items-center gap-2 ${continued || locked ? "" : "cursor-grab"}`}>
            {recipe?.image && !continued && <img src={recipe.image} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover" />}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-snug">{continued ? "↳ " : ""}{title}</p>
              {(servings || (!continued && found.spanDays > 1)) && (
                <p className="text-xs text-primary">{[servings, !continued && found.spanDays > 1 ? t("linked", { count: found.spanDays }) : null].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </div>
          {!locked && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={t("more", { title })} data-testid={`menu-${meal}-${day}`} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-foreground/5 ${focus}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(found.recipeId)}>{t("view")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpen({ kind: "pick", day, meal, replace: true })} data-testid={`replace-${meal}-${day}`}>{t("replace")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpen({ kind: "repeat", recipeId: found.recipeId, day, meal })} data-testid={`repeat-${meal}-${day}`}>{t("repeat")}</DropdownMenuItem>
                {baseServings(recipe?.servings) && <DropdownMenuItem onSelect={() => onOpen({ kind: "servings", day, meal })}>{t("changeServings")}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => onOpen({ kind: "remove", day, meal })} data-testid={`remove-${meal}-${day}`} className="text-red-600">{t("remove")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : (
        <button type="button" disabled={locked} onClick={() => onOpen({ kind: "pick", day, meal, replace: false })} data-testid={`add-${meal}-${day}`}
          className={`flex min-h-11 w-full items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:bg-accent hover:text-primary disabled:opacity-50 ${focus}`}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t("addMeal")}
        </button>
      )}
    </div>
  );
}

export function PlannerBoard({ recipes, plan, locked, commit, notify, dayNames, mealNames, onView, fitsMeal, othersLabel }: Props) {
  const t = usePlannerCopy();
  const [modal, setModal] = useState<Modal | null>(null);
  const [dragging, setDragging] = useState<PlannerRecipe | null>(null);
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  // Planned recipes leave the drag list; "Add meal" and Repeat still offer them.
  const plannedIds = new Set(plan.planAssignments.map(a => a.recipeId));
  const unplanned = recipes.filter(recipe => !plannedIds.has(recipe.id));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const name = (day: number, meal: MealSlot) => ({ day: dayNames[day], meal: mealNames[mealSlots.indexOf(meal)].toLowerCase() });
  const close = () => setModal(null);

  const add = (recipeId: string, slot: Slot, servings: number | null | undefined, replace: boolean) => {
    const ok = commit(p => addKeepingShortlist(p, { recipeId, ...slot, servings }, replace));
    if (ok) notify(t(replace ? "replaced" : "added", name(slot.day, slot.meal)));
    return ok;
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const to = over?.data.current as Slot | undefined;
    if (!to || locked) return;
    const from = active.data.current?.from as Slot | undefined;
    if (from) {
      if (commit(p => moveTo(p, from, to))) notify(t("moved", name(to.day, to.meal)));
      else if (occupant(plan, to.meal, to.day)) notify(t("slotTaken"), true);
      return;
    }
    const recipeId = active.data.current?.recipeId as string;
    if (checkAdd(plan, { recipeId, ...to }).status === "free") add(recipeId, to, baseServings(byId.get(recipeId)?.servings), false);
    else setModal({ kind: "plan", recipeId, ...to }); // occupied: let the dialog ask before replacing
  };

  return (
    <DndContext sensors={sensors} onDragStart={e => setDragging(byId.get(e.active.data.current?.recipeId) ?? null)} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
      <section aria-labelledby="selected-heading" className="mb-6">
        <h2 id="selected-heading" className="mb-1 text-sm font-medium">{t("selected")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{locked ? t("locked") : unplanned.length === 0 ? t("allPlanned") : plan.planAssignments.length === 0 ? t("hint") : t("dragHint")}</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {unplanned.map(recipe => (
            <RecipeCard key={recipe.id} recipe={recipe} locked={locked} onView={() => onView(recipe.id)} onPlan={() => setModal({ kind: "plan", recipeId: recipe.id })} />
          ))}
        </ul>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" data-testid="week-calendar">
        {dayNames.map((dayName, day) => (
          <section key={day} aria-label={dayName} className="rounded-lg border hairline bg-white p-3" data-testid={`day-${day}`}>
            <h3 className="mb-2 text-sm font-medium">{dayName}</h3>
            <div className="space-y-2">
              {mealSlots.map((meal, index) => (
                <SlotCell key={meal} day={day} meal={meal} plan={plan} recipes={byId} locked={locked} dayName={dayName} mealName={mealNames[index]} onOpen={setModal} onView={onView} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <DragOverlay>{dragging && <div className="rounded-lg border border-primary bg-white p-3 text-sm font-medium shadow-lg">{dragging.title}</div>}</DragOverlay>

      <Dialog open={!!modal} onOpenChange={open => !open && close()}>
        <DialogContent className="max-w-md" data-testid="planner-dialog">
          {modal?.kind === "plan" && byId.get(modal.recipeId) && (
            <PlanForm recipe={byId.get(modal.recipeId)!} plan={plan} initial={modal} dayNames={dayNames} mealNames={mealNames} onClose={close} titleOf={id => byId.get(id)?.title ?? "…"}
              onSubmit={(slot, servings, replace) => add(modal.recipeId, slot, servings, replace) && close()} />
          )}
          {modal?.kind === "pick" && (
            <>
              <DialogHeader>
                <DialogTitle>{t(modal.replace ? "replaceTitle" : "pickTitle", name(modal.day, modal.meal))}</DialogTitle>
                <DialogDescription className="sr-only">{t("selected")}</DialogDescription>
              </DialogHeader>
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                {recipes.length === 0 && <li className="text-sm text-muted-foreground">{t("pickEmpty")}</li>}
                {(() => {
                  const fits = recipes.filter(r => !fitsMeal || fitsMeal(r, modal.meal));
                  const others = recipes.filter(r => !fits.includes(r));
                  return [...fits, ...others].map(recipe => (
                  <li key={recipe.id}>
                    {recipe === others[0] && <p className="mb-2 mt-3 text-xs text-muted-foreground" data-testid="pick-others">{othersLabel}</p>}
                    <button type="button" disabled={occupant(plan, modal.meal, modal.day)?.recipeId === recipe.id} data-testid={`pick-${recipe.id}`}
                      onClick={() => add(recipe.id, modal, baseServings(recipe.servings), modal.replace) && close()}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-white p-2 text-start text-sm hover:bg-accent disabled:opacity-40 ${focus}`}>
                      {recipe.image && <img src={recipe.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
                      <span className="min-w-0 flex-1 break-words font-medium">{recipe.title}</span>
                    </button>
                  </li>
                  ));
                })()}
              </ul>
              <DialogFooter><button type="button" className={secondary} onClick={close}>{t("cancel")}</button></DialogFooter>
            </>
          )}
          {modal?.kind === "repeat" && byId.get(modal.recipeId) && (
            <RepeatForm recipe={byId.get(modal.recipeId)!} plan={plan} source={modal} dayNames={dayNames} mealNames={mealNames} onClose={close}
              onSubmit={slots => {
                const result = repeatOn(plan, modal.recipeId, slots, occupant(plan, modal.meal, modal.day)?.servings);
                if (!result.added || !commit(() => result.plan)) return;
                notify(t(result.skipped ? "repeatedSkip" : "repeated", { added: result.added, skipped: result.skipped }));
                close();
              }} />
          )}
          {modal?.kind === "servings" && occupant(plan, modal.meal, modal.day) && (
            <ServingsForm recipe={byId.get(occupant(plan, modal.meal, modal.day)!.recipeId)} current={occupant(plan, modal.meal, modal.day)!.servings} onClose={close}
              onSubmit={value => commit(p => setServingsAt(p, modal.meal, modal.day, value)) && close()} />
          )}
          {modal?.kind === "remove" && occupant(plan, modal.meal, modal.day) && (() => {
            const found = occupant(plan, modal.meal, modal.day)!;
            const values = { ...name(modal.day, modal.meal), title: byId.get(found.recipeId)?.title ?? "", count: found.spanDays };
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{t("removeTitle", values)}</DialogTitle>
                  <DialogDescription>{t(found.spanDays > 1 ? "removeLinked" : "removeBody", values)}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-2">
                  <button type="button" className={secondary} onClick={close}>{t("cancel")}</button>
                  <button type="button" data-testid="button-confirm-remove" className={`${pill} bg-red-600 text-white hover:bg-red-700`}
                    onClick={() => { if (commit(p => removeAt(p, modal.meal, modal.day))) { notify(t("removed", name(modal.day, modal.meal))); close(); } }}>{t("remove")}</button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function PlanForm({ recipe, plan, initial, dayNames, mealNames, titleOf, onSubmit, onClose }: {
  titleOf: (id: string) => string; recipe: PlannerRecipe; plan: PlanState; initial: { day?: number; meal?: MealSlot }; dayNames: string[]; mealNames: string[];
  onSubmit: (slot: Slot, servings: number | null, replace: boolean) => void; onClose: () => void;
}) {
  const t = usePlannerCopy();
  const base = baseServings(recipe.servings);
  const [day, setDay] = useState(initial.day ?? new Date().getDay());
  const [meal, setMeal] = useState<MealSlot>(initial.meal ?? "Dinner");
  const [servings, setServings] = useState(base ?? 1);
  const check = checkAdd(plan, { recipeId: recipe.id, day, meal });
  const values = { day: dayNames[day], meal: mealNames[mealSlots.indexOf(meal)].toLowerCase() };
  const existing = check.status === "conflict" ? check.existing : null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("planTitle", { title: recipe.title })}</DialogTitle>
        <DialogDescription className="sr-only">{t("day")} / {t("meal")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("day")}</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {dayNames.map((label, index) => (
              <button key={index} type="button" aria-pressed={day === index} onClick={() => { setDay(index); }} data-testid={`plan-day-${index}`} className={`${choice(day === index)} px-0 text-xs`}>{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("meal")}</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {mealSlots.map((slot, index) => (
              <button key={slot} type="button" aria-pressed={meal === slot} onClick={() => { setMeal(slot); }} data-testid={`plan-meal-${slot}`} className={choice(meal === slot)}>{mealNames[index]}</button>
            ))}
          </div>
        </fieldset>
        {base && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t("servingsLabel")}</span>
            <Stepper value={servings} onChange={setServings} label={t("servingsLabel")} fewer={t("fewer")} more={t("more2")} />
          </div>
        )}
        {existing && <p role="alert" className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="plan-conflict">{t(existing.spanDays > 1 ? "conflictLinked" : "conflict", { ...values, title: titleOf(existing.recipeId), count: existing.spanDays })}</p>}
        {check.status === "same" && <p role="alert" className="rounded-lg bg-foreground/5 p-3 text-sm">{t("same", values)}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={secondary} onClick={onClose}>{t("cancel")}</button>
          <button type="button" disabled={check.status === "same"} data-testid="button-confirm-plan" className={primary}
            onClick={() => onSubmit({ day, meal }, base ? servings : null, !!existing)}>
            {existing ? t("replaceBtn") : t("add")}
          </button>
        </DialogFooter>
      </div>
    </>
  );
}

function RepeatForm({ recipe, plan, source, dayNames, mealNames, onSubmit, onClose }: {
  recipe: PlannerRecipe; plan: PlanState; source: { day: number; meal: MealSlot }; dayNames: string[]; mealNames: string[];
  onSubmit: (slots: Slot[]) => void; onClose: () => void;
}) {
  const t = usePlannerCopy();
  const [days, setDays] = useState<number[]>([]);
  const [meals, setMeals] = useState<MealSlot[]>([source.meal]);
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];
  const slots = days.flatMap(day => meals.map(meal => ({ day, meal }))).filter(slot => !occupant(plan, slot.meal, slot.day));
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("repeatTitle", { title: recipe.title })}</DialogTitle>
        <DialogDescription>{t("repeatHelp")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("day")}</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {dayNames.map((label, index) => (
              <button key={index} type="button" aria-pressed={days.includes(index)} onClick={() => setDays(toggle(days, index))} data-testid={`repeat-day-${index}`} className={`${choice(days.includes(index))} px-0 text-xs`}>{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("meal")}</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {mealSlots.map((slot, index) => (
              <button key={slot} type="button" aria-pressed={meals.includes(slot)} onClick={() => setMeals(toggle(meals, slot))} data-testid={`repeat-meal-${slot}`} className={choice(meals.includes(slot))}>{mealNames[index]}</button>
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="repeat-summary">
          {slots.map(slot => `${dayNames[slot.day]} ${mealNames[mealSlots.indexOf(slot.meal)].toLowerCase()}`).join(", ")}
          {days.length * meals.length > slots.length && ` (${days.length * meals.length - slots.length} ${t("taken")})`}
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={secondary} onClick={onClose}>{t("cancel")}</button>
          <button type="button" disabled={!slots.length} onClick={() => onSubmit(slots)} data-testid="button-confirm-repeat" className={primary}>{t("repeatBtn")}</button>
        </DialogFooter>
      </div>
    </>
  );
}

function ServingsForm({ recipe, current, onSubmit, onClose }: { recipe?: PlannerRecipe; current?: number; onSubmit: (value: number) => void; onClose: () => void }) {
  const t = usePlannerCopy();
  const [value, setValue] = useState(current ?? baseServings(recipe?.servings) ?? 1);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("servingsTitle", { title: recipe?.title ?? "" })}</DialogTitle>
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
