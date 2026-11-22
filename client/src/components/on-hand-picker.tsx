import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RecipeCard } from "@/components/recipe-card";
import { useI18n } from "@/lib/i18n";
import { onHandText, type OnHandKey } from "@/lib/on-hand-copy";
import { boughtProteins, findWithWhatIHave, newItems, parseAmount, typesOf, type FindResult, type OnHand } from "@/lib/on-hand";
import { readGroceryPrefs } from "@/lib/grocery-progress";
import { buildRecipeGroceryRows } from "@/lib/grocery-meal-removal";
import { readPlan } from "@/lib/meal-plan";
import { loadSettings } from "@/lib/basic-settings";
import { cookNowOptions } from "@/lib/week-suggestions";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import type { Extra } from "@/lib/grocery-items";
import type { useCookNow } from "@/hooks/use-cook-now";
import type { Recipe } from "@/lib/storage";

/** One row of the picker. A suggestion (bought last week) starts unticked; a typed protein starts ticked. */
export type Entry = { id: number; name: string; amount: string; amountOpen: boolean; selected: boolean; required: boolean };
let nextId = 1;
const entry = (name: string, selected: boolean): Entry => ({ id: nextId++, name, amount: "", amountOpen: false, selected, required: false });
export const suggestedEntries = (extras: readonly Extra[]) => boughtProteins(readGroceryPrefs().checked, extras).map(name => entry(name, false));
/** Ticked, named rows; an amount that cannot be read blocks the action. */
export const chosen = (entries: Entry[]) => entries.filter(e => e.selected && e.name.trim());
export const entriesReady = (entries: Entry[]) => chosen(entries).length > 0 && chosen(entries).every(e => !e.amount.trim() || parseAmount(e.amount));
export const toOnHand = (entries: Entry[], minimize: boolean): OnHand =>
  ({ minimize, items: chosen(entries).map(e => ({ name: e.name.trim(), amount: e.amount.trim() ? parseAmount(e.amount) : null })) });
export const useGroceryExtras = (enabled = true) => useQuery<Extra[]>({ queryKey: ["/api/grocery-extras"], enabled });

/** The protein inputs shared by Home and the Week: tick, correct, add an amount, remove; Minimize groceries; the camera
 * placeholder (disabled: requests no device permission). `mustInclude` (Home, Cook now) marks a protein as required;
 * without `onMinimize` (Cook now opens one recipe) there is no Minimize groceries switch. */
export function OnHandPicker({ entries, onChange, minimize = false, onMinimize, mustInclude = false, addLabel }: {
  entries: Entry[]; onChange: (next: Entry[]) => void; minimize?: boolean; onMinimize?: (on: boolean) => void; mustInclude?: boolean; addLabel: OnHandKey;
}) {
  const { lang } = useI18n();
  const c = (key: OnHandKey, values?: Record<string, string | number>) => onHandText(lang, key, values);
  const [typed, setTyped] = useState("");
  const edit = (id: number, patch: Partial<Entry>) => onChange(entries.map(e => (e.id === id ? { ...e, ...patch } : e)));
  const add = () => { if (typed.trim()) { onChange([...entries, entry(typed.trim(), true)]); setTyped(""); } };
  return (
    <div className="grid gap-3">
      {entries.length > 0 && <ul className="grid gap-2" data-testid="on-hand-entries">
        {entries.map(e => {
          const bad = !!e.amount.trim() && !parseAmount(e.amount);
          return (
            <li key={e.id} className="rounded-lg border p-2" data-testid="on-hand-entry">
              <div className="flex items-center gap-2">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={e.selected} onChange={ev => edit(e.id, { selected: ev.target.checked })}
                  aria-label={c("use", { name: e.name })} data-testid="on-hand-select" />
                <input className="min-h-11 min-w-0 flex-1 rounded border bg-background px-2" value={e.name} maxLength={80}
                  aria-label={c("nameLabel")} onChange={ev => edit(e.id, { name: ev.target.value })} data-testid="on-hand-name" />
                <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-foreground/5"
                  aria-label={c("remove", { name: e.name })} onClick={() => onChange(entries.filter(x => x.id !== e.id))} data-testid="on-hand-remove">
                  <X className="h-4 w-4" aria-hidden="true" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3">
                {!e.amountOpen && <button type="button" className="btn btn-text -ms-2" onClick={() => edit(e.id, { amountOpen: true })} data-testid="on-hand-add-amount">{c("addAmount")}</button>}
                {mustInclude && <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={e.required} onChange={ev => edit(e.id, { required: ev.target.checked, selected: ev.target.checked || e.selected })}
                    data-testid="on-hand-required" />{c("mustInclude")}</label>}
              </div>
              {e.amountOpen && <label className="block text-sm">{c("howMuch")}
                <input className="mt-1 block min-h-11 w-full rounded border bg-background px-2" value={e.amount} maxLength={30} placeholder={c("amountHint")}
                  aria-invalid={bad} onChange={ev => edit(e.id, { amount: ev.target.value })} data-testid="on-hand-amount" />
                {bad && <span className="text-destructive" role="alert">{c("amountInvalid")}</span>}
              </label>}
            </li>
          );
        })}
      </ul>}
      <form className="flex flex-wrap items-center gap-2" onSubmit={ev => { ev.preventDefault(); add(); }}>
        <input className="min-h-11 min-w-40 flex-1 rounded border bg-background px-2" value={typed} maxLength={80} placeholder={c("placeholder")}
          aria-label={c(addLabel)} onChange={ev => setTyped(ev.target.value)} data-testid="on-hand-input" />
        <button type="submit" className="btn btn-secondary" disabled={!typed.trim()} data-testid="on-hand-add">{c("add")}</button>
        <button type="button" disabled className="btn btn-text -ms-2 gap-1 opacity-60" data-testid="on-hand-camera">
          <Camera className="h-4 w-4" aria-hidden="true" />{c("camera")}</button>
      </form>
      {onMinimize && <label className="flex min-h-11 items-center justify-between gap-3">
        <span><span className="block text-sm font-medium">{c("minimize")}</span><span className="block text-xs text-muted-foreground">{c("minimizeHint")}</span></span>
        <Switch checked={minimize} onCheckedChange={onMinimize} data-testid="on-hand-minimize" />
      </label>}
    </div>
  );
}

/** A bottom sheet on a phone, a dialog on wider screens. */
const sheet = "bottom-0 top-auto max-h-[92dvh] w-full max-w-none translate-y-0 gap-4 overflow-y-auto rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%] sm:rounded-2xl";

/** Home → Cook with what I have: proteins → eligible recipes using at least one of them. Read-only: never changes the
 * Week or Groceries; a recipe opens on its page, where Servings scales it. */
export function CookWithWhatIHave({ open, onClose, catalog }: { open: boolean; onClose: () => void; catalog: Recipe[] }) {
  const { lang } = useI18n();
  const c = (key: OnHandKey, values?: Record<string, string | number>) => onHandText(lang, key, values);
  const extras = useGroceryExtras(open);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [minimize, setMinimize] = useState(false);
  const [result, setResult] = useState<FindResult<PlannerRecipe> | null>(null);
  const suggested = useMemo(() => (extras.isFetched ? suggestedEntries(extras.data ?? []) : []), [extras.isFetched, extras.data]);
  const shown = entries ?? suggested;
  const byId = useMemo(() => new Map(catalog.map(r => [r.id, r])), [catalog]);
  // The active grocery list: this week's approved dishes and the products added by hand.
  const have = useMemo(() => typesOf([...buildRecipeGroceryRows(readPlan().approved ?? [], catalog).values()].map(r => r.ingredient)
    .concat((extras.data ?? []).map(e => e.text))), [catalog, extras.data, open]);
  const find = () => {
    const eligible = cookNowOptions(toPlannerRecipes(catalog), loadSettings(), new Date());
    setResult(findWithWhatIHave(eligible, chosen(shown).map(e => ({ name: e.name.trim(), required: e.required })), { minimize, have }));
  };
  const close = () => { setResult(null); onClose(); };
  const names = chosen(shown).map(e => e.name.trim());
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      {open && <DialogContent data-testid="cook-with-what-i-have" className={sheet}
        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle>{result ? c("results") : c("homeTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{c("homeAction")}</DialogDescription>
        </DialogHeader>
        {!result ? <>
          <OnHandPicker entries={shown} onChange={setEntries} minimize={minimize} onMinimize={setMinimize} mustInclude addLabel="homeTitle" />
          <button type="button" className="btn btn-primary" disabled={!entriesReady(shown)} onClick={find} data-testid="on-hand-find">{c("find")}</button>
        </> : <>
          {result.noMatch ? <p role="status" className="text-sm" data-testid="on-hand-none">{c(`none_${result.noMatch}`)}</p>
            : <ul className="grid gap-3" data-testid="on-hand-results">{result.recipes.slice(0, 10).map(r => {
              const recipe = byId.get(r.id);
              return recipe && <li key={r.id}>
                <RecipeCard recipe={recipe} href={`/recipe/${encodeURIComponent(r.id)}`} row testId={`on-hand-result-${r.id}`}>
                  {minimize && <span className="block text-xs text-muted-foreground">{c("newItems", { count: newItems(r, have, names) })}</span>}
                </RecipeCard>
              </li>;
            })}</ul>}
          <button type="button" className="btn btn-secondary" onClick={() => setResult(null)} data-testid="on-hand-edit">{c("editSearch")}</button>
        </>}
      </DialogContent>}
    </Dialog>
  );
}

/** Cook now: "What protein do you have?" before the recipe opens. Find a recipe opens the first eligible recipe using a
 * ticked protein (every Must include one among them); Skip opens Cook now's usual first recipe. */
export function CookNowProteins({ cookNow }: { cookNow: ReturnType<typeof useCookNow> }) {
  const { lang } = useI18n();
  const c = (key: OnHandKey, values?: Record<string, string | number>) => onHandText(lang, key, values);
  const extras = useGroceryExtras(cookNow.asking);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [noMatch, setNoMatch] = useState<FindResult<PlannerRecipe>["noMatch"]>(null);
  const suggested = useMemo(() => (extras.isFetched ? suggestedEntries(extras.data ?? []) : []), [extras.isFetched, extras.data]);
  const shown = entries ?? suggested;
  const close = () => { setNoMatch(null); cookNow.close(); };
  const find = () => setNoMatch(cookNow.run(chosen(shown).map(e => ({ name: e.name.trim(), required: e.required }))).noMatch);
  return (
    <Dialog open={cookNow.asking} onOpenChange={o => { if (!o) close(); }}>
      {cookNow.asking && <DialogContent data-testid="cook-now-proteins" className={sheet}
        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle>{c("homeTitle")}</DialogTitle>
          <DialogDescription>{c("cookNowIntro")}</DialogDescription>
        </DialogHeader>
        <OnHandPicker entries={shown} onChange={next => { setEntries(next); setNoMatch(null); }} mustInclude addLabel="homeTitle" />
        {noMatch && <p role="status" className="text-sm" data-testid="on-hand-none">{c(`none_${noMatch}`)}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={!entriesReady(shown)} onClick={find} data-testid="cook-now-find">{c("findOne")}</button>
          <button type="button" className="btn btn-secondary" onClick={() => { setNoMatch(null); cookNow.run(); }} data-testid="cook-now-skip">{c("skip")}</button>
        </div>
      </DialogContent>}
    </Dialog>
  );
}
