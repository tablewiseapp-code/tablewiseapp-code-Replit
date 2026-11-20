import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecipeCreditLine } from "@/components/recipe-credit";
import { RecipeCard } from "@/components/recipe-card";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { householdText } from "@/lib/household-copy";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";
import { activePreferenceChips } from "@/lib/active-preferences";
import { cookingStyles, householdServings, loadSettings, servingLimits, type CookingStyle } from "@/lib/basic-settings";
import { addToPlan, checkAdd, isWeekLocked, readPlan, writePlan, type AddRequest, type MealSlot, type PlanState } from "@/lib/meal-plan";
import { generateMeals, generatorTimes, type GeneratorInput, type NoMatch } from "@/lib/meal-generator";
import { total } from "@/lib/preference-engine";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { baseServings, scaleIngredient, servingFactor } from "@/lib/ingredient-scale";
import { settingsText } from "@/lib/settings-copy";
import { myRecipesKey, type MyRecipes, type Recipe } from "@/lib/storage";

// Diets the catalog marks explicitly (the same four Your household offers).
const flowDiets = ["vegetarian", "vegan", "glutenFree", "dairyFree"] as const;
export type MealTarget = { meal: MealSlot; day: number };
export type MealAdded = { before: PlanState; request: AddRequest };

/** Home "+ Add breakfast/lunch/dinner": a request (words, time, style, household) → one catalog recipe → Add to that meal.
 * The target is fixed when the sheet opens. The Week changes only on Add; servings and diets edited here stay in this flow. */
export function MealGenerator({ target, catalog, onClose, onAdded }: {
  target: MealTarget | null; catalog: Recipe[]; onClose: (focusSlot: MealSlot) => void; onAdded: (added: MealAdded) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={open => { if (!open && target) onClose(target.meal); }}>
      {/* Keyed by target: every opening starts from the defaults. */}
      {target && <GeneratorSheet key={`${target.meal}-${target.day}`} target={target} catalog={catalog} onAdded={onAdded} onClose={() => onClose(target.meal)} />}
    </Dialog>
  );
}

function GeneratorSheet({ target, catalog, onAdded, onClose }: { target: MealTarget; catalog: Recipe[]; onAdded: (added: MealAdded) => void; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { t: view } = useRecipeViewCopy();
  const { meal, day } = target;
  const mealName = t(`meals.${meal.toLowerCase()}`);
  const text = (key: Parameters<typeof homeText>[1], values: Record<string, string | number> = {}) =>
    homeText(lang, key, { meal: mealName.toLocaleLowerCase(lang), Meal: mealName, ...values });
  const h = (key: Parameters<typeof householdText>[1], values?: Record<string, string | number>) => householdText(lang, key, values);

  const [settings] = useState(loadSettings);
  const [input, setInput] = useState<GeneratorInput>(() => ({ meal, day, query: "", maxMinutes: null, style: "quick",
    servings: householdServings(settings), diets: [...settings.dietary.diets] }));
  const [step, setStep] = useState<"form" | "result" | "mine">("form");
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<{ recipes: PlannerRecipe[]; noMatch: NoMatch | null } | null>(null);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const done = useRef(false); // set synchronously: a second tap before React re-renders must not add again
  const [problem, setProblem] = useState<"error" | "locked" | "full" | null>(null);
  // The slot was filled elsewhere while the sheet was open: what is there now, and the recipe the person wanted.
  const [changed, setChanged] = useState<{ now: string; pick: string } | null>(null);
  const planner = useMemo(() => toPlannerRecipes(catalog), [catalog]);
  const byId = useMemo(() => new Map(catalog.map(r => [r.id, r])), [catalog]);
  const mine = useQuery<MyRecipes>({ queryKey: myRecipesKey, enabled: step === "mine" });

  const set = (patch: Partial<GeneratorInput>) => setInput(x => ({ ...x, ...patch }));
  const generate = () => { setResult(generateMeals(planner, settings, input)); setIndex(0); setProblem(null); setChanged(null); setStep("result"); };
  const recipe = result && index < result.recipes.length ? byId.get(result.recipes[index].id) ?? null : null;
  const planned = result && index < result.recipes.length ? result.recipes[index] : null;

  // One assignment per tap: the guard plus addToPlan's own "same recipe already here" check.
  const add = (recipeId: string, replace = false) => {
    if (done.current) return;
    setProblem(null);
    if (isWeekLocked()) { setProblem("locked"); return; }
    const before = readPlan();
    const request = { recipeId, day, meal, servings: input.servings };
    const check = checkAdd(before, request);
    if (check.status === "conflict" && !replace) { setChanged({ now: check.existing.recipeId, pick: recipeId }); return; }
    if (check.status === "full") { setProblem("full"); return; }
    setSaving(true); done.current = true;
    try {
      if (check.status !== "same") writePlan(addToPlan(before, request, replace));
    } catch { setProblem("error"); setSaving(false); done.current = false; return; }
    onAdded({ before, request });
    onClose();
  };

  const chips = activePreferenceChips({ ...settings, dietary: { ...settings.dietary, diets: input.diets } }, lang, m => t(`meals.${m.toLowerCase()}`))
    .filter(c => c.group === "hard");
  const householdLine = [input.servings ? h("servings", { n: input.servings }) : null, ...chips.map(c => c.text),
    settings.shopping.budgetFriendly ? text("genBudget") : null].filter(Boolean).join(" · ") || text("genNoPrefs");
  const date = new Date();
  date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7));

  const pill = "chip min-h-11";
  const notices = <>
    {changed && <div role="alert" className="grid gap-2 rounded-lg bg-foreground/5 p-3 text-sm" data-testid="meal-generator-changed">
      <p>{text("genChanged", { title: byId.get(changed.now)?.title ?? "" })}</p>
      <button type="button" className="btn btn-secondary w-fit" disabled={saving} onClick={() => add(changed.pick, true)} data-testid="meal-generator-replace">{text("genReplace")}</button>
    </div>}
    {problem && <p role="alert" className="text-sm text-destructive" data-testid="meal-generator-problem">
      {problem === "locked" ? view("planLocked") : problem === "full" ? view("planFull", { count: readPlan().selectedIds.length }) : text("genSaveError")}</p>}
  </>;
  const back = <button type="button" className="btn btn-text -ms-2" onClick={() => setStep("form")} data-testid="meal-generator-back">{text("genBack")}</button>;

  return (
    <DialogContent data-testid="meal-generator" data-meal={meal}
      // Phone: a bottom sheet that scrolls on its own. Desktop: the compact centred dialog.
      className="bottom-0 top-auto max-h-[92dvh] w-full max-w-none translate-y-0 gap-5 rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%] sm:rounded-2xl"
      // Keep the phone keyboard closed on open: focus the sheet, not the search field.
      onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
      // Home puts focus back on the meal row itself (the + Add button is gone after a save).
      onCloseAutoFocus={e => e.preventDefault()}>
      <DialogHeader className="text-start sm:text-start">
        <DialogTitle>{step === "mine" ? text("genMineTitle") : text("genTitle")}</DialogTitle>
        <DialogDescription data-testid="meal-generator-date">{text("genToday", { date: date.toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric" }) })}</DialogDescription>
      </DialogHeader>

      {step === "form" && <>
        <div className="grid gap-2">
          <label htmlFor="meal-generator-query" className="text-sm font-medium">{text("genQ")}</label>
          <input id="meal-generator-query" type="text" enterKeyHint="search" autoComplete="off" value={input.query} maxLength={200}
            placeholder={text(`ph_${meal}`)} onChange={e => set({ query: e.target.value })} onKeyDown={e => { if (e.key === "Enter") generate(); }}
            className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base" data-testid="meal-generator-query" />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{text("genTime")}</legend>
          <div className="flex flex-wrap gap-2">
            {generatorTimes.map(n => <button key={n ?? "any"} type="button" className={pill} aria-pressed={input.maxMinutes === n}
              onClick={() => set({ maxMinutes: n })} data-testid={`meal-generator-time-${n ?? "any"}`}>{n ? text("genUpTo", { n }) : text("genAny")}</button>)}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{text("genStyle")}</legend>
          <div className="flex flex-wrap gap-2">
            {cookingStyles.map(s => <button key={s} type="button" className={pill} aria-pressed={input.style === s}
              onClick={() => set({ style: s as CookingStyle })} data-testid={`meal-generator-style-${s}`}>{h(`style_${s}`)}</button>)}
          </div>
        </fieldset>
        <div className="grid gap-2 rounded-lg border hairline p-3" data-testid="meal-generator-household">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm"><span className="font-medium">{text("genHousehold")}: </span><span data-testid="meal-generator-household-line">{householdLine}</span></p>
            <button type="button" className="btn btn-text shrink-0" aria-expanded={editing} onClick={() => setEditing(x => !x)} data-testid="meal-generator-edit">
              {editing ? text("genDone") : text("genEdit")}</button>
          </div>
          {editing && <div className="grid gap-3">
            <div role="group" aria-label={h("servingsQ")} className="inline-flex w-fit items-center rounded-full border border-input bg-card">
              <button type="button" aria-label={h("fewer")} disabled={(input.servings ?? 1) <= servingLimits.min} onClick={() => set({ servings: (input.servings ?? 2) - 1 })}
                className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40" data-testid="meal-generator-servings-decrease"><Minus className="h-4 w-4" aria-hidden="true" /></button>
              <span className="min-w-24 text-center text-sm font-medium" aria-live="polite">{h("servings", { n: input.servings ?? "—" })}</span>
              <button type="button" aria-label={h("more")} disabled={(input.servings ?? 0) >= servingLimits.max} onClick={() => set({ servings: (input.servings ?? 0) + 1 })}
                className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40" data-testid="meal-generator-servings-increase"><Plus className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm text-muted-foreground">{text("genDiets")}</legend>
              <div className="flex flex-wrap gap-2">
                {flowDiets.map(d => { const on = input.diets.includes(d); return <button key={d} type="button" className={pill} aria-pressed={on} data-testid={`meal-generator-diet-${d}`}
                  onClick={() => set({ diets: on ? input.diets.filter(x => x !== d) : [...input.diets, d] })}>{settingsText(lang, `diet_${d}`)}</button>; })}
              </div>
            </fieldset>
          </div>}
        </div>
        <div className="grid gap-2">
          <button type="button" className="btn btn-primary w-full" onClick={generate} data-testid="meal-generator-generate">{text("genTitle")}</button>
          <button type="button" className="btn btn-secondary w-full" onClick={() => setStep("mine")} data-testid="meal-generator-mine">{text("genChooseMine")}</button>
        </div>
      </>}

      {step === "result" && result && <>
        {recipe && planned ? (
          <article className="grid gap-3" data-testid="meal-generator-recipe" data-recipe-id={recipe.id}>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{text("genSuggested")}</p>
              <RecipeCard recipe={recipe} servings={input.servings ? String(input.servings) : null} ids={{ view: "meal-generator-view" }}>
                <RecipeCreditLine recipe={recipe} />
              </RecipeCard>
            </div>
            <section aria-label={text("genIngredients")}>
              <h4 className="text-sm font-semibold">{text("genIngredients")}</h4>
              <ul className="mt-1 list-disc ps-5 text-sm" data-testid="meal-generator-ingredients">
                {recipe.ingredients.map((line, i) => <li key={i}>{input.servings ? scaleIngredient(line, servingFactor(input.servings, baseServings(recipe.servings))) : line}</li>)}
              </ul>
            </section>
            <section aria-label={text("genSteps")}>
              <h4 className="text-sm font-semibold">{text("genSteps")}</h4>
              <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </section>
          </article>
        ) : (
          <p role="status" className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="meal-generator-none">
            {result.noMatch ? text(`genNone_${result.noMatch}`, { query: input.query.trim() }) : text("genExhausted")}</p>
        )}
        {notices}
        <div className="grid gap-2">
          {recipe ? <>
            <button type="button" className="btn btn-primary w-full" disabled={saving} onClick={() => add(recipe.id)} data-testid="meal-generator-add">
              {saving ? text("genAdding") : text("genAdd")}</button>
            <button type="button" className="btn btn-secondary w-full" onClick={() => { setIndex(i => i + 1); setChanged(null); setProblem(null); }} data-testid="meal-generator-another">{text("genAnother")}</button>
          </> : <button type="button" className="btn btn-primary w-full" onClick={() => setStep("form")} data-testid="meal-generator-edit-filters">{text("genEditFilters")}</button>}
          {back}
        </div>
      </>}

      {step === "mine" && <>
        {mine.isPending ? <p className="text-sm text-muted-foreground" aria-busy="true">{text("loading")}</p>
          : mine.isError ? <p role="alert" className="text-sm text-muted-foreground">{text("loadError")} <button type="button" className="btn btn-text" onClick={() => mine.refetch()}>{text("retry")}</button></p>
          : (() => {
            const ids = [...new Set([...(mine.data?.liked ?? []), ...(mine.data?.imported ?? [])])].filter(id => byId.has(id));
            return ids.length === 0 ? <p className="rounded-lg bg-foreground/5 p-3 text-sm" data-testid="meal-generator-mine-empty">{text("genMineEmpty")}</p>
              : <ul className="grid gap-1" data-testid="meal-generator-mine-list">{ids.map(id => <li key={id}>
                <button type="button" disabled={saving} onClick={() => add(id)} data-testid={`meal-generator-mine-${id}`}
                  className="flex min-h-11 w-full items-center rounded-md px-2 text-start text-sm font-medium hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{byId.get(id)!.title}</button>
              </li>)}</ul>;
          })()}
        {notices}
        {back}
      </>}
    </DialogContent>
  );
}
