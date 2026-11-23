import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Camera, Check, ChevronDown, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecipeCard } from "@/components/recipe-card";
import { Chip, offeredDiets, toggle } from "@/components/household-controls";
import { useI18n } from "@/lib/i18n";
import { onHandText, type OnHandKey } from "@/lib/on-hand-copy";
import { settingsText } from "@/lib/settings-copy";
import { loadSettings } from "@/lib/basic-settings";
import { toPlannerRecipes } from "@/lib/planner-recipes";
import { recipeText, useRecipeTranslations } from "@/lib/recipe-translation";
import { askURL } from "@/hooks/use-cook-now";
import { ingredientType } from "@/lib/on-hand";
import { checkedLast } from "@/lib/checked-last";
import { groceryMeasure } from "@/lib/grocery-meal-removal";
import { findMyDish, nextDish, otherIngredients, proteinChoices, specificProteins, type DishSearch, type Protein, type ProteinKey } from "@/lib/find-my-dish";
import { allergens, ingredientPrefIds, type Allergen, type DietPattern } from "@shared/food-rules";
import type { PlannerRecipe } from "@/lib/planner-recipes";
import type { Recipe } from "@/lib/storage";

type Option = { key: string; label: string; specific?: boolean };

/** An editable single-select dropdown: closed at first; the arrow, ArrowDown or typing opens it. Typing narrows the
 * options; Enter or "Use “…”" takes the person's own text. Same pattern as the grocery list's product search. */
function Combo({ id, label, value, onValue, options, onAccept, placeholder, typed, testid, addOnEnter = false }: {
  /** Enter with the list closed adds the text (Leave out) instead of submitting the form (protein). */
  addOnEnter?: boolean; id: string; label: string; value: string; onValue: (text: string) => void; options: Option[]; onAccept: (text: string, key: string | null) => void;
  placeholder: string; typed: (text: string) => string; testid: string;
}) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = value.trim().toLocaleLowerCase(lang);
  const low = (o: Option) => o.label.toLocaleLowerCase(lang);
  const matches = !q ? options.filter(o => !o.specific)
    : options.filter(o => low(o).includes(q)).sort((a, b) => Number(!low(a).startsWith(q)) - Number(!low(b).startsWith(q)));
  const items: (Option & { own?: boolean })[] = [...matches, ...(q && !matches.some(o => low(o) === q) ? [{ key: "", label: value.trim(), own: true }] : [])];
  const accept = (item?: Option & { own?: boolean }) => {
    if (item) onAccept(item.label, item.own ? null : item.key); else if (q) onAccept(value.trim(), options.find(o => low(o) === q)?.key ?? null);
    setOpen(false); setActive(-1);
  };
  const shown = open && items.length > 0;
  return (
    <div className="relative">
      <div className="flex items-center rounded-lg border border-input bg-card focus-within:outline focus-within:outline-2 focus-within:outline-ring">
        <input id={id} value={value} maxLength={60} placeholder={placeholder} autoComplete="off" data-testid={testid}
          className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base placeholder:text-muted-foreground focus:outline-none"
          role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={`${id}-list`}
          aria-activedescendant={shown && active >= 0 ? `${id}-opt-${active}` : undefined}
          onChange={e => { onValue(e.target.value); setOpen(true); setActive(-1); }} onBlur={() => setOpen(false)}
          onKeyDown={e => {
            if (e.key === "Escape" && open) { setOpen(false); setActive(-1); }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault(); setOpen(true);
              if (items.length) setActive(p => e.key === "ArrowDown" ? (p + 1) % items.length : p <= 0 ? items.length - 1 : p - 1);
            }
            if (e.key === "Enter" && (shown || (addOnEnter && q))) { e.preventDefault(); accept(shown && active >= 0 ? items[active] : undefined); }
          }} />
        <button type="button" tabIndex={-1} aria-label={label} className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground"
          onPointerDown={e => e.preventDefault()} onClick={() => { setOpen(o => !o); document.getElementById(id)?.focus(); }} data-testid={`${testid}-toggle`}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      {shown && <ul id={`${id}-list`} role="listbox" aria-label={label} data-testid={`${testid}-options`}
        className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        {items.map((item, i) => <li key={`${item.key}:${item.label}`} id={`${id}-opt-${i}`} role="option" aria-selected={active === i}
          onPointerDown={e => e.preventDefault()} onClick={() => accept(item)} data-testid={`${testid}-option`}
          className={`flex min-h-11 cursor-pointer items-center rounded px-3 text-sm ${active === i ? "bg-accent" : "hover:bg-accent"}`}>
          {item.own ? typed(item.label) : item.label}</li>)}
      </ul>}
    </div>
  );
}

/** A bottom sheet on a phone, a dialog on wider screens (as Cook with what I have). */
const sheet = "bottom-0 top-auto max-h-[92dvh] w-full max-w-none translate-y-0 gap-4 overflow-y-auto rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%] sm:rounded-2xl";

/** Home → Find my dish: opens on an eligible main dish at once; a protein (and optional Leave out ingredients and
 * dietary needs) narrows it; tapping ingredients as had steers Try another. Never asks for setup and writes nothing;
 * its state lives only while the sheet is open. */
export function FindMyDish({ open, onClose, catalog }: { open: boolean; onClose: () => void; catalog: Recipe[] }) {
  const { lang } = useI18n();
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && <DialogContent data-testid="find-my-dish" className={sheet}
        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
        // Escape closes an open list first, not the sheet.
        onEscapeKeyDown={e => { if (document.querySelector('[role="combobox"][aria-expanded="true"]')) e.preventDefault(); }}>
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle>{onHandText(lang, "findDish")}</DialogTitle>
          <DialogDescription className="sr-only">{onHandText(lang, "examplesHint")}</DialogDescription>
        </DialogHeader>
        <Search catalog={catalog} />
      </DialogContent>}
    </Dialog>
  );
}

function Search({ catalog }: { catalog: Recipe[] }) {
  const { lang } = useI18n();
  const c = (key: OnHandKey, values?: Record<string, string | number>) => onHandText(lang, key, values);
  const s = (key: string) => settingsText(lang, key);
  const [, setLocation] = useLocation();
  const translations = useRecipeTranslations();
  const settings = useMemo(loadSettings, []);
  const planner = useMemo(() => toPlannerRecipes(catalog), [catalog]);
  const byId = useMemo(() => new Map(catalog.map(r => [r.id, r])), [catalog]);

  const proteinOptions: Option[] = useMemo(() => [
    ...proteinChoices.map(([key]) => ({ key, label: c(`p_${key}` as OnHandKey) })),
    ...specificProteins.map(([key]) => ({ key, label: c(`p_${key}` as OnHandKey), specific: true })),
  ], [lang]);
  const leaveOptions: Option[] = useMemo(() => ingredientPrefIds.map(key => ({ key, label: s(`ing_${key}`) })), [lang]);

  const [protein, setProtein] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [term, setTerm] = useState("");
  const [leaveOut, setLeaveOut] = useState<{ key: string | null; label: string }[]>([]);
  const [diets, setDiets] = useState<DietPattern[]>([]);
  const [allergies, setAllergies] = useState<Allergen[]>([]);
  // Opening the sheet shows a dish at once, with no selection.
  const [results, setResults] = useState<{ list: PlannerRecipe[]; id: string; seen: Set<string>; last: boolean; protein: string } | null>(() => {
    const list = findMyDish(planner, settings, { leaveOut: [], diets: [], allergies: [] });
    return list.length ? { list, id: list[0].id, seen: new Set([list[0].id]), last: false, protein: "" } : null;
  });
  const [none, setNone] = useState(!results);
  /** Ingredients tapped as had in this sheet (ingredientType → label without quantity), in tap order. Not a quantity. */
  const [have, setHave] = useState<Map<string, string>>(new Map());
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (focusKey !== null) listRef.current?.querySelector<HTMLElement>(`[data-line="${focusKey}"]`)?.focus({ preventScroll: true });
  }, [focusKey, have]);

  /** A label in the reader's language picks that choice; anything else is the person's own words. */
  const toProtein = (text: string): Protein => {
    const hit = proteinOptions.find(o => o.label.toLocaleLowerCase(lang) === text.trim().toLocaleLowerCase(lang));
    return hit ? { key: hit.key as ProteinKey } : { text: text.trim() };
  };
  const haveKeys = new Set(have.keys());
  const find = () => {
    const text = protein;
    const search: DishSearch = { protein: text.trim() ? toProtein(text) : undefined, leaveOut: leaveOut.map(x => x.key ?? x.label), diets, allergies };
    const list = findMyDish(planner, settings, search);
    const first = nextDish(list, new Set(), haveKeys, !!text.trim());
    setNone(!first);
    setResults(first ? { list, id: first.id, seen: new Set([first.id]), last: false, protein: text.trim() } : null);
  };

  const addLeaveOut = (label: string, key: string | null) => {
    if (label.trim() && !leaveOut.some(x => x.label.toLocaleLowerCase(lang) === label.trim().toLocaleLowerCase(lang))) setLeaveOut([...leaveOut, { key, label: label.trim() }]);
    setTerm("");
  };
  const held = { diets: settings.dietary.diets, allergies: settings.dietary.allergies };

  if (results) {
    const recipe = byId.get(results.id)!;
    const lines = recipeText(recipe, translations.get(recipe.id), lang as never).ingredients;
    const rows = otherIngredients(recipe, !!results.protein).map(i => ({ i, type: ingredientType(recipe.ingredients[i]) }));
    const shown = checkedLast(rows, r => have.has(r.type));
    const toggleHave = (i: number, type: string) => {
      const next = new Map(have);
      if (next.has(type)) next.delete(type); else next.set(type, groceryMeasure(lines[i]).name.split(/[,(]/)[0].trim() || type);
      setHave(next); setFocusKey(i);
    };
    const names = [...new Set([results.protein, ...have.values()].filter(Boolean))];
    const allHad = rows.length > 0 && rows.every(r => have.has(r.type));
    return <div className="grid gap-4" data-testid="find-my-dish-result">
      <RecipeCard recipe={recipe} href={`/recipe/${encodeURIComponent(recipe.id)}`} row testId={`find-my-dish-recipe-${recipe.id}`} />
      {names.length > 0 && <p className="text-sm" aria-live="polite" data-testid="find-my-dish-have">{c("youHave", { name: names.join(", ") })}</p>}
      <div>
        <h3 className="text-sm font-semibold" data-testid="find-my-dish-need-title">{c(allHad ? "haveAll" : "alsoNeed")}</h3>
        <p className="text-sm text-muted-foreground">{c("tapHave")}</p>
        <ul ref={listRef} className="mt-1 grid text-sm" data-testid="find-my-dish-ingredients">
          {shown.map(({ i, type }) => {
            const on = have.has(type);
            return <li key={i}><button type="button" aria-pressed={on} data-line={i} data-testid="find-my-dish-ingredient" onClick={() => toggleHave(i, type)}
              className="flex min-h-11 w-full items-center gap-2 rounded text-start hover:bg-accent">
              {on ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className={on ? "line-through text-muted-foreground" : ""}>{lines[i]}</span>
            </button></li>;
          })}
        </ul>
      </div>
      {results.last && <p role="status" className="text-sm" data-testid="find-my-dish-no-other">{c("noOther")}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => setLocation(`/recipe/${encodeURIComponent(recipe.id)}?cook`)} data-testid="find-my-dish-start">{c("startCooking")}</button>
        <button type="button" className="btn btn-secondary" data-testid="find-my-dish-another" onClick={() => {
          const next = nextDish(results.list, results.seen, haveKeys, !!results.protein);
          setFocusKey(null);
          setResults(next ? { ...results, id: next.id, seen: new Set([...results.seen, next.id]), last: false } : { ...results, last: true });
        }}>{c("tryAnother")}</button>
        <button type="button" className="btn btn-text" onClick={() => { setResults(null); setFocusKey(null); }} data-testid="find-my-dish-edit">{c("editSearch")}</button>
      </div>
    </div>;
  }

  return <form className="grid gap-4" onSubmit={e => { e.preventDefault(); find(); }}>
    <div className="grid gap-1">
      <label htmlFor="find-protein" className="text-sm font-medium">{c("homeTitle")}</label>
      <Combo id="find-protein" label={c("showProteins")} value={protein} onValue={v => { setProtein(v); setNone(false); }} options={proteinOptions}
        onAccept={text => { setProtein(text); setNone(false); }} placeholder={c("proteinPlaceholder")} typed={name => c("useTyped", { name })} testid="find-protein" />
    </div>

    {have.size > 0 && <div className="grid gap-1">
      <p className="text-sm font-medium">{c("haveLabel")}</p>
      <ul className="flex flex-wrap gap-2" data-testid="find-have-list">{[...have].map(([type, label]) => (
        <li key={type}><button type="button" className="chip" aria-label={c("remove", { name: label })} data-testid="find-have-remove"
          onClick={() => { const next = new Map(have); next.delete(type); setHave(next); }}>{label} <X className="h-3.5 w-3.5" aria-hidden="true" /></button></li>
      ))}</ul>
    </div>}

    {!leaving ? <button type="button" className="btn btn-text -ms-2 justify-self-start" onClick={() => setLeaving(true)} data-testid="find-leave-out-open">{c("leaveOutOpen")}</button>
      : <div className="grid gap-1">
        <label htmlFor="find-leave-out" className="text-sm font-medium">{c("leaveOut")}</label>
        <Combo id="find-leave-out" label={c("showIngredients")} value={term} onValue={v => { setTerm(v); setNone(false); }} options={leaveOptions}
          onAccept={(text, key) => { addLeaveOut(text, key); setNone(false); }} placeholder={c("leaveOutPlaceholder")} typed={name => c("useTyped", { name })} testid="find-leave-out" addOnEnter />
        {leaveOut.length > 0 && <ul className="mt-1 flex flex-wrap gap-2" data-testid="find-leave-out-list">{leaveOut.map(x => (
          <li key={x.label}><button type="button" className="chip" aria-label={c("remove", { name: x.label })} data-testid="find-leave-out-remove"
            onClick={() => { setLeaveOut(leaveOut.filter(y => y !== x)); setNone(false); }}>{x.label} <X className="h-3.5 w-3.5" aria-hidden="true" /></button></li>
        ))}</ul>}
      </div>}

    {/* For this search only, on top of the household's own requirements (never removed). */}
    <details data-testid="find-dietary">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{c("dietaryNeeds")}</summary>
      {(held.diets.length > 0 || held.allergies.length > 0) && <p className="text-sm text-muted-foreground" data-testid="find-dietary-held">
        {c("fromHousehold")}: {[...held.diets.map(d => s(`diet_${d}`)), ...held.allergies.map(a => s(`allergen_${a}`))].join(", ")}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {offeredDiets.filter(d => !held.diets.includes(d)).map(d => <Chip key={d} on={diets.includes(d)} onClick={() => { setDiets(toggle(diets, d)); setNone(false); }} testid={`find-diet-${d}`}>{s(`diet_${d}`)}</Chip>)}
        {allergens.filter(a => !held.allergies.includes(a)).map(a => <Chip key={a} on={allergies.includes(a)} onClick={() => { setAllergies(toggle(allergies, a)); setNone(false); }} testid={`find-allergy-${a}`}>{s(`allergen_${a}`)}</Chip>)}
      </div>
    </details>

    {/* Not built: no file chooser, no device permission. */}
    <button type="button" disabled className="btn btn-secondary justify-self-start gap-2 opacity-60" aria-describedby="find-fridge-soon" data-testid="find-fridge">
      <Camera className="h-4 w-4" aria-hidden="true" />{c("fridge")}
      <span id="find-fridge-soon" className="text-xs text-muted-foreground">{c("comingSoon")}</span>
    </button>

    {none && <p role="status" className="text-sm" data-testid="find-my-dish-none">{c("noDish")}{" "}
      {settings.kitchen.devices !== null && <Link href={askURL(["kitchen"], "/")} className="font-medium text-primary underline underline-offset-4" data-testid="find-edit-kitchen">{c("editKitchen")}</Link>}</p>}
    <button type="submit" className="btn btn-primary" data-testid="find-my-dish-submit">{c("findDish")}</button>
  </form>;
}
