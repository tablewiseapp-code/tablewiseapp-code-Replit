// The Week's cooking days (docs/cooking-plan.md): one group per date, Monday to Sunday. A dish appears once, on the day it
// is cooked; its card shows how much to make and the dates it serves. Every action is a visible, labelled button.
import { useState } from "react";
import { Link } from "wouter";
import { Minus, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { addBatch, cookedOn, moveConflicts, moveCookingDay, removeBatch, restoreBatch, servingDateChoices, setServes, swapBatch, type Batch, type PlanState, type Serve } from "@/lib/meal-plan";
import { batchTotal, batchYield, halfServings, serveAmount, shiftDate, weekdayOf, type HouseholdCounts } from "@shared/cooking-plan";
import { baseServings } from "@/lib/ingredient-scale";
import { recipeNameMatches } from "@/lib/planner-filters";
import { usePlannerCopy } from "@/lib/planner-copy";
import type { PlannerRecipe } from "@/lib/planner-recipes";
import type { RecipeTimeMode } from "@/lib/recipe-time";
import { RecipeMeta } from "@/components/recipe-summary";
import { RecipeCard } from "@/components/recipe-card";
import { useIsMobile } from "@/hooks/use-mobile";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const pill = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ${focus}`;
const primary = `${pill} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`;
const secondary = `${pill} border border-border bg-white text-foreground hover:bg-accent`;
const text = `inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-primary hover:bg-accent ${focus}`;
const choice = (active: boolean) =>
  `min-h-11 rounded-lg border px-2 text-sm ${focus} ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground"}`;

type Modal =
  | { kind: "add"; date: string }
  | { kind: "swap"; batch: Batch }
  | { kind: "servings"; batch: Batch }
  | { kind: "move"; date: string };

type Props = {
  plan: PlanState;
  week: string;
  /** Today's date when the shown week is the current one. */
  today: string | null;
  lang: string;
  recipes: Map<string, PlannerRecipe>;
  /** Applies an edit and saves it. Returns false when nothing was saved (the page shows the error). */
  commit: (edit: (plan: PlanState) => PlanState) => boolean;
  recipeHref: (batch: Batch) => string;
  /** Eligible recipes for a weekday (0 = Sunday), best first (+ Add a dish, Swap dish). */
  options: (day: number) => PlannerRecipe[];
  onPicked?: (recipeId: string) => void;
  household: HouseholdCounts | null;
  timeMode: RecipeTimeMode;
};

export function useDateText(lang: string) {
  const day = new Intl.DateTimeFormat(lang, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(lang, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const list = new Intl.ListFormat(lang, { style: "short", type: "conjunction" });
  const at = (date: string) => new Date(`${date}T12:00:00Z`);
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  return { short: (date: string) => day.format(at(date)), long: (date: string) => long.format(at(date)),
    list: (dates: string[]) => list.format(dates.map(d => day.format(at(d)))), number: (n: number) => number.format(n) };
}
const yieldOf = (batch: Batch, recipe: PlannerRecipe | undefined) => batchYield(batch, baseServings(recipe?.servings));

function DishCard({ batch, props, onOpen }: { batch: Batch; props: Props; onOpen: (modal: Modal) => void }) {
  const t = usePlannerCopy();
  const toastApi = useToast();
  const phone = useIsMobile();
  const { plan, recipes, lang, timeMode, commit } = props;
  const dates = useDateText(lang);
  const recipe = recipes.get(batch.recipeId);
  if (!recipe) return null;
  const recipeYield = yieldOf(batch, recipe);
  const total = batchTotal(batch, baseServings(recipe.servings));
  const remove = () => {
    const index = plan.batches.findIndex(b => b.id === batch.id);
    if (!commit(p => removeBatch(p, batch.id))) return;
    toastApi.toast({ title: t("removed", { title: recipe.title }), action: <ToastAction altText={t("undo")} data-testid="undo-remove-dish"
      onClick={() => commit(p => restoreBatch(p, batch, index))}>{t("undo")}</ToastAction> });
  };
  // The shared recipe card (photo, title linking to this batch, time, Recipe View); the plan's own lines and buttons below.
  return (
    <div className="h-full" data-testid={`dish-${batch.id}`} data-recipe={recipe.id} role="group"
      aria-label={t("dishActions", { title: recipe.title, date: dates.long(batch.cookDate) })}>
      <RecipeCard recipe={{ ...recipe, servings: null }} row={!phone} href={props.recipeHref(batch)} mode={timeMode} titleTestId={`dish-link-${batch.id}`}
        ids={{ view: `dish-view-${batch.id}` }}>
        <div className="grid gap-1">
          <p className="text-base font-semibold text-foreground" data-testid={`dish-make-${batch.id}`}>
            {recipeYield === null && total === 0 ? t("yieldNeeded") : t("make", { count: dates.number(total) })}
          </p>
          <p className="text-sm text-muted-foreground" data-testid={`dish-dates-${batch.id}`}>{t("forDates", { dates: dates.list(batch.serves.map(s => s.date)) })}</p>
        </div>
        <div className="-ms-2 flex flex-wrap gap-x-1">
          <button type="button" className={text} onClick={() => onOpen({ kind: "servings", batch })} data-testid={`edit-servings-${batch.id}`}>{t("editServings")}</button>
          <button type="button" className={text} onClick={() => onOpen({ kind: "swap", batch })} data-testid={`swap-${batch.id}`}>{t("swapDish")}</button>
          <button type="button" className={`${text} text-muted-foreground`} onClick={remove} data-testid={`remove-${batch.id}`}>{t("removeDish")}</button>
        </div>
      </RecipeCard>
    </div>
  );
}

export function PlannerBoard(props: Props) {
  const { plan, week, today, lang, recipes, commit, options, onPicked, household } = props;
  const t = usePlannerCopy();
  const { toast } = useToast();
  const dates = useDateText(lang);
  const [modal, setModal] = useState<Modal | null>(null);
  const close = () => setModal(null);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));

  return (
    <>
      <div className="divide-y divide-border border-y border-border" data-testid="week-calendar">
        {days.map(date => {
          const dishes = cookedOn(plan, date).filter(b => recipes.has(b.recipeId));
          const isToday = date === today;
          const heading = (
            <h2 id={`day-${date}`} className={`text-base font-semibold lg:w-44 lg:shrink-0 lg:pt-1 ${isToday ? "text-primary" : "text-foreground"}`}>
              {dates.long(date)}{isToday && <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">{t("today")}</span>}
            </h2>
          );
          const add = <button type="button" className={text} onClick={() => setModal({ kind: "add", date })} data-testid={`add-dish-${date}`}>{t("addDish")}</button>;
          return (
            <section key={date} aria-labelledby={`day-${date}`} data-testid={`day-${date}`} data-today={isToday || undefined}
              className={`py-3 lg:flex lg:gap-6 ${isToday ? "bg-accent/40 -mx-2 px-2" : ""}`}>
              {heading}
              {dishes.length === 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 lg:flex-1" data-testid={`empty-${date}`}>
                  <p className="text-sm text-muted-foreground">{t("noCooking")}</p>{add}
                </div>
              ) : (
                <div className="mt-2 lg:mt-0 lg:flex-1">
                  <div className="grid gap-3 xl:grid-cols-2">
                    {dishes.map(batch => <DishCard key={batch.id} batch={batch} props={props} onOpen={setModal} />)}
                  </div>
                  <div className="-ms-2 mt-2 flex flex-wrap gap-x-1">
                    {add}
                    <button type="button" className={text} onClick={() => setModal({ kind: "move", date })} data-testid={`move-day-${date}`}>{t("moveDay")}</button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={!!modal} onOpenChange={open => !open && close()}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto" data-testid="planner-dialog">
          {modal?.kind === "add" && (
            <PickForm title={t("addTitle", { date: dates.long(modal.date) })} options={options(weekdayOf(modal.date))} currentId={null} onClose={close}
              onPick={recipe => {
                if (!commit(p => addBatch(p, recipe.id, modal.date, household))) return;
                onPicked?.(recipe.id);
                toast({ title: t("added", { title: recipe.title, date: dates.short(modal.date) }) });
                close();
              }} />
          )}
          {modal?.kind === "swap" && (
            <PickForm title={t("swapTitle", { title: recipes.get(modal.batch.recipeId)?.title ?? "" })} options={options(weekdayOf(modal.batch.cookDate))}
              currentId={modal.batch.recipeId} onClose={close}
              onPick={recipe => {
                if (!commit(p => swapBatch(p, modal.batch.id, recipe.id))) return;
                onPicked?.(recipe.id);
                toast({ title: t("swapped", { title: recipe.title }) });
                close();
              }} />
          )}
          {modal?.kind === "servings" && (
            <ServingsForm batch={modal.batch} recipe={recipes.get(modal.batch.recipeId)} week={week} lang={lang} household={household} onClose={close}
              onSubmit={(serves, recipeYield) => commit(p => setServes(p, modal.batch.id, serves, recipeYield)) && close()} />
          )}
          {modal?.kind === "move" && (
            <MoveForm plan={plan} from={modal.date} days={days} recipes={recipes} lang={lang} onClose={close}
              onSubmit={next => { if (commit(() => next)) { toast({ title: t("moved", { date: dates.short(next.batches.at(-1)!.cookDate) }) }); close(); } }} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The recipe picker for a day: eligible recipes, best first, with a name search. Cancel changes nothing. */
function PickForm({ title, currentId, options, onPick, onClose }: {
  title: string; currentId: string | null; options: PlannerRecipe[]; onPick: (recipe: PlannerRecipe) => void; onClose: () => void;
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
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto" data-testid="pick-list">
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

function Stepper({ value, onChange, label, fewer, more, testId }: { value: number; onChange: (value: number) => void; label: string; fewer: string; more: string; testId: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1">
      <span className="w-14 text-xs text-muted-foreground">{label}</span>
      <span className="inline-flex items-center rounded-full border border-border">
        <button type="button" aria-label={fewer} disabled={value <= 0} onClick={() => onChange(value - 1)} className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <span className="min-w-6 text-center text-sm font-medium" aria-live="polite" data-testid={testId}>{value}</span>
        <button type="button" aria-label={more} disabled={value >= 20} onClick={() => onChange(value + 1)} className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </span>
    </div>
  );
}

type Row = { on: boolean; mode: "counts" | "amount"; adults: number; kids: number; amount: string };
/** Edit servings: pick serving dates (any, from the cooking day to the end of next week) and, per date, adults and kids or
 * a direct amount in half servings. The total updates as you go; Cancel discards everything. */
function ServingsForm({ batch, recipe, week, lang, household, onSubmit, onClose }: {
  batch: Batch; recipe: PlannerRecipe | undefined; week: string; lang: string; household: HouseholdCounts | null;
  onSubmit: (serves: Serve[], recipeYield?: number) => void; onClose: () => void;
}) {
  const t = usePlannerCopy();
  const dates = useDateText(lang);
  const original = baseServings(recipe?.servings);
  const known = batchYield(batch, original);
  const [yieldText, setYieldText] = useState(known ? String(known) : "");
  const recipeYield = known ?? (Number(yieldText) > 0 ? halfServings(Number(yieldText)) : null);
  const fresh = (): Row => household ? { on: true, mode: "counts", adults: household.adults, kids: household.kids, amount: "" }
    : { on: true, mode: "amount", adults: 0, kids: 0, amount: recipeYield ? String(recipeYield) : "" };
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(batch.serves.map(s => [s.date,
    s.servings === undefined && (s.adults !== undefined || s.kids !== undefined)
      ? { on: true, mode: "counts", adults: s.adults ?? 0, kids: s.kids ?? 0, amount: "" }
      : { on: true, mode: "amount", adults: household?.adults ?? 0, kids: household?.kids ?? 0, amount: s.servings !== undefined ? String(s.servings) : known ? String(known) : "" }])));
  const set = (date: string, patch: Partial<Row>) => setRows(r => ({ ...r, [date]: { ...(r[date] ?? fresh()), ...patch } }));
  const amountOf = (row: Row) => row.mode === "counts" ? row.adults + row.kids * 0.5 : Number(row.amount) > 0 ? halfServings(Number(row.amount)) : 0;
  const selected = Object.entries(rows).filter(([, row]) => row.on).sort(([a], [b]) => a.localeCompare(b));
  const total = selected.reduce((sum, [, row]) => sum + amountOf(row), 0);
  const error = !known && !recipeYield ? t("errYield") : !selected.length ? t("errNoDates") : !(total > 0) || selected.some(([, r]) => r.mode === "amount" && !(amountOf(r) > 0)) ? t("errTotal") : null;
  const save = () => {
    if (error) return;
    const serves: Serve[] = selected.map(([date, row]) => row.mode === "counts" ? { date, adults: row.adults, kids: row.kids } : { date, servings: amountOf(row) });
    onSubmit(serves, known ? undefined : recipeYield ?? undefined);
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("servingsTitle", { title: recipe?.title ?? "" })}</DialogTitle>
        <DialogDescription className="sr-only">{t("servingDates")}</DialogDescription>
      </DialogHeader>
      {!known && <label className="grid gap-1 text-sm">
        <span>{t("yieldAsk")}</span>
        <input type="number" inputMode="decimal" min={0.5} step={0.5} value={yieldText} onChange={e => setYieldText(e.target.value)} aria-label={t("yieldLabel")}
          className="min-h-11 w-28 rounded-lg border border-border bg-white px-3 text-base" data-testid="servings-yield" />
      </label>}
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("servingDates")}</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {servingDateChoices(batch.cookDate, week).map(date => (
            <button key={date} type="button" aria-pressed={!!rows[date]?.on} aria-label={dates.long(date)} data-testid={`serve-date-${date}`}
              onClick={() => set(date, { on: !rows[date]?.on })} className={`${choice(!!rows[date]?.on)} text-xs`}>{dates.short(date)}</button>
          ))}
        </div>
      </fieldset>
      <ul className="space-y-3">
        {selected.map(([date, row]) => (
          <li key={date} className="rounded-lg bg-foreground/5 p-2" data-testid={`serve-row-${date}`}>
            <p className="text-sm font-medium">{dates.long(date)} · {dates.number(amountOf(row))}</p>
            {row.mode === "counts" ? <div className="flex flex-wrap gap-x-4">
              <Stepper label={t("adults")} value={row.adults} onChange={v => set(date, { adults: v })} fewer={t("fewer", { who: t("adults") })} more={t("more", { who: t("adults") })} testId={`adults-${date}`} />
              <Stepper label={t("kids")} value={row.kids} onChange={v => set(date, { kids: v })} fewer={t("fewer", { who: t("kids") })} more={t("more", { who: t("kids") })} testId={`kids-${date}`} />
            </div> : <input type="number" inputMode="decimal" min={0.5} max={100} step={0.5} value={row.amount} onChange={e => set(date, { amount: e.target.value })}
              aria-label={t("amountFor", { date: dates.long(date) })} className="min-h-11 w-28 rounded-lg border border-border bg-white px-3 text-base" data-testid={`amount-${date}`} />}
            <button type="button" className={`${text} -ms-2`} data-testid={`mode-${date}`}
              onClick={() => set(date, row.mode === "counts" ? { mode: "amount", amount: String(amountOf(row) || "") } : { mode: "counts" })}>
              {row.mode === "counts" ? t("setAmount") : t("useCounts")}</button>
          </li>
        ))}
      </ul>
      <p className="text-base font-semibold" aria-live="polite" data-testid="servings-total">{t("total", { count: dates.number(total) })}</p>
      {error && <p role="alert" className="text-sm text-destructive" data-testid="servings-error">{error}</p>}
      <DialogFooter className="gap-2 sm:gap-2">
        <button type="button" className={secondary} onClick={onClose} data-testid="servings-cancel">{t("cancel")}</button>
        <button type="button" className={primary} onClick={save} disabled={!!error} data-testid="button-save-servings">{t("save")}</button>
      </DialogFooter>
    </>
  );
}

/** Move cooking day: every dish of the day moves together. Portions that would come before the new cooking day are listed
 * by dish, date and amount; each is moved to the new day or removed before Move is enabled. Applied as one change. */
function MoveForm({ plan, from, days, recipes, lang, onSubmit, onClose }: {
  plan: PlanState; from: string; days: string[]; recipes: Map<string, PlannerRecipe>; lang: string;
  onSubmit: (next: PlanState) => void; onClose: () => void;
}) {
  const t = usePlannerCopy();
  const dates = useDateText(lang);
  const [to, setTo] = useState<string | null>(null);
  const [resolve, setResolve] = useState<Record<string, "move" | "remove">>({});
  const amount = (batch: Batch, serve: Serve) => serveAmount(serve, yieldOf(batch, recipes.get(batch.recipeId)));
  const conflicts = to ? moveConflicts(plan, from, to) : [];
  const next = to ? moveCookingDay(plan, from, to, resolve, amount) : null;
  const unresolved = conflicts.some(c => !resolve[`${c.batchId}:${c.date}`]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("moveTitle", { date: dates.long(from) })}</DialogTitle>
        <DialogDescription className="sr-only">{t("moveTo")}</DialogDescription>
      </DialogHeader>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("moveTo")}</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {days.filter(d => d !== from).map(d => (
            <button key={d} type="button" aria-pressed={to === d} aria-label={dates.long(d)} data-testid={`move-to-${d}`}
              onClick={() => { setTo(d); setResolve({}); }} className={`${choice(to === d)} text-xs`}>{dates.short(d)}</button>
          ))}
        </div>
      </fieldset>
      {to && conflicts.length > 0 && <div className="space-y-2" data-testid="move-conflicts">
        <p className="text-sm">{t("moveConflicts")}</p>
        {conflicts.map(c => {
          const batch = plan.batches.find(b => b.id === c.batchId)!;
          const key = `${c.batchId}:${c.date}`;
          return <div key={key} role="group" aria-label={t("conflictRow", { title: recipes.get(batch.recipeId)?.title ?? "", date: dates.short(c.date), count: "" })}
            className="rounded-lg bg-foreground/5 p-2" data-testid={`conflict-${key}`}>
            <p className="text-sm font-medium">{t("conflictRow", { title: recipes.get(batch.recipeId)?.title ?? "", date: dates.long(c.date),
              count: dates.number(amount(batch, batch.serves.find(s => s.date === c.date)!)) })}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={resolve[key] === "move"} className={choice(resolve[key] === "move")} data-testid={`conflict-move-${key}`}
                onClick={() => setResolve(r => ({ ...r, [key]: "move" }))}>{t("conflictMove", { date: dates.short(to) })}</button>
              <button type="button" aria-pressed={resolve[key] === "remove"} className={choice(resolve[key] === "remove")} data-testid={`conflict-remove-${key}`}
                onClick={() => setResolve(r => ({ ...r, [key]: "remove" }))}>{t("conflictRemove")}</button>
            </div>
          </div>;
        })}
      </div>}
      {to && !next && <p role="status" className="text-sm text-muted-foreground" data-testid="move-problem">{unresolved ? t("moveUnresolved") : t("moveEmpty")}</p>}
      <DialogFooter className="gap-2 sm:gap-2">
        <button type="button" className={secondary} onClick={onClose} data-testid="move-cancel">{t("cancel")}</button>
        <button type="button" disabled={!next} onClick={() => next && onSubmit(next)} data-testid="button-confirm-move" className={primary}>{t("moveBtn")}</button>
      </DialogFooter>
    </>
  );
}
