import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { PageContainer } from "@/components/layout/page-container";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { cookedOn, readPlan, removeBatch, servedFrom, writePlan, type Batch } from "@/lib/meal-plan";
import { usePlannerCopy } from "@/lib/planner-copy";
import { batchTotal, currentMeal, mealOf, mealSlots, type MealSlot } from "@shared/cooking-plan";
import { baseServings } from "@/lib/ingredient-scale";
import { calendarDate, currentWeek, plannerRecipeURL } from "@/lib/week-plan";
import { MealGenerator, type MealAdded, type MealTarget } from "@/components/meal-generator";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { askURL } from "@/hooks/use-cook-now";
import { FindMyDish } from "@/components/find-my-dish";
import { exampleDishes } from "@/lib/find-my-dish";
import { toPlannerRecipes } from "@/lib/planner-recipes";
import { onHandText } from "@/lib/on-hand-copy";
import { householdText } from "@/lib/household-copy";
import { loadSettings, missingAnswers } from "@/lib/basic-settings";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { homePreview, localDate, type HomeTask } from "@shared/home-tasks";
import { RecipeCard } from "@/components/recipe-card";
import { useRecipeDisplay } from "@/components/recipe-display";
import { useRecipeTranslations } from "@/lib/recipe-translation";
import { NutritionGrid, RecipeMeta, recipeViewNutrients } from "@/components/recipe-summary";
import { recipeStageMinutes } from "@/lib/recipe-time";
import type { Recipe } from "@/lib/storage";


function SectionState({ error, retry, text }: { error: boolean; retry: () => void; text: (k: "loading" | "loadError" | "retry") => string }) {
  return error
    ? <p role="alert" className="text-sm text-muted-foreground">{text("loadError")}{" "}
        <button type="button" className="btn btn-text" onClick={retry}>{text("retry")}</button></p>
    : <p className="text-sm text-muted-foreground" aria-busy="true">{text("loading")}</p>;
}

export default function Home() {
  const { t, lang, dir } = useI18n();
  const text = (key: Parameters<typeof homeText>[1], values?: Record<string, string | number>) => homeText(lang, key, values);
  // Today: the local calendar date in the current week's plan.
  const [now] = useState(() => new Date());
  const today = calendarDate(now);
  const [plan, setPlan] = useState(readPlan);
  // ?add=dinner: + Add dinner after its missing household answers were asked (askURL), resumed here.
  const [generating, setGenerating] = useState<MealTarget | null>(() => {
    const meal = mealSlots.find(m => m.toLowerCase() === new URLSearchParams(window.location.search).get("add"));
    return meal ? { meal, day: new Date().getDay(), date: calendarDate(new Date()) } : null;
  });
  // Find my dish: never asks for setup; its search lives only while the sheet is open.
  const [finding, setFinding] = useState(false);
  const [, setLocation] = useLocation();
  useEffect(() => { if (generating) setLocation("/", { replace: true }); }, []); // a reload must not reopen it
  const openGenerator = (target: MealTarget) => {
    const missing = missingAnswers(loadSettings());
    if (missing.length) setLocation(askURL(missing, `/?add=${target.meal.toLowerCase()}`)); else setGenerating(target);
  };
  const catalog = useRecipeCatalog();
  const translations = useRecipeTranslations();
  const { recipeView } = useRecipeDisplay();
  const [allNutrition, setAllNutrition] = useState<ReadonlySet<string>>(new Set()); // collapsed dishes showing every nutrient
  const { toast } = useToast();
  // Focus goes back to that meal's + Add button.
  const focusAdd = (meal: MealSlot) => requestAnimationFrame(() => {
    const add = document.querySelector<HTMLElement>(`[data-testid="home-add-${meal.toLowerCase()}"]`);
    add?.closest("details")?.setAttribute("open", ""); // an empty meal is collapsed; reopen it so focus lands
    add?.focus();
  });
  const added = ({ batchId, recipeId, date }: MealAdded) => {
    setPlan(readPlan());
    toast({ title: text("genAdded"), action: <ToastAction altText={text("genUndo")} data-testid="home-meal-undo" onClick={() => {
      // Only this dish is undone, and only while it is still that recipe on that date.
      const current = readPlan();
      const dish = current.batches.find(b => b.id === batchId);
      if (!dish || dish.recipeId !== recipeId || dish.cookDate !== date) { toast({ title: text("genUndoGone") }); return; }
      try { writePlan(removeBatch(current, batchId)); setPlan(readPlan()); } catch { toast({ variant: "destructive", title: text("genSaveError") }); }
    }}>{text("genUndo")}</ToastAction> });
  };

  // Remove dish: the same action as the Week's "⋯" menu (the whole dish, every serving date), with Undo.
  const p = usePlannerCopy();
  const remove = (batch: Batch, title: string) => {
    const before = readPlan(), at = before.batches.findIndex(b => b.id === batch.id);
    try { writePlan(removeBatch(before, batch.id)); setPlan(readPlan()); } catch { toast({ variant: "destructive", title: text("genSaveError") }); return; }
    toast({ title: p("removed", { title }), action: <ToastAction altText={p("undo")} data-testid="home-remove-undo" onClick={() => {
      const current = readPlan();
      if (current.batches.some(b => b.id === batch.id)) return;
      const batches = [...current.batches]; batches.splice(Math.min(at, batches.length), 0, batch);
      try { writePlan({ ...current, batches }); setPlan(readPlan()); } catch { toast({ variant: "destructive", title: text("genSaveError") }); }
    }}>{p("undo")}</ToastAction> });
  };

  const recipes = new Map((catalog.data ?? []).map(r => [r.id, r]));
  const cooking = cookedOn(plan, today).filter(b => recipes.has(b.recipeId));
  const eating = servedFrom(plan, today).filter(b => recipes.has(b.recipeId));
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
  /** "35 min total · Make 4 servings" for a dish cooked today; "Cooked Sun" for one cooked earlier. */
  const meta = (recipe: Recipe, batch: Batch, cookedToday: boolean) => {
    const minutes = recipeStageMinutes(recipe, "total");
    return [cookedToday && minutes !== null ? t("card.totalMinutes", { count: minutes }) : null,
      cookedToday ? text("makeServings", { count: number.format(batchTotal(batch, baseServings(recipe.servings))) })
        : text("cookedOn", { date: weekday.format(new Date(`${batch.cookDate}T12:00:00Z`)) })].filter(Boolean).join(" · ");
  };
  const todays = [...cooking.map(b => [b, true] as const), ...eating.map(b => [b, false] as const)];
  // Nothing for today: up to three example dishes (beef, chicken, plant-based) within the household's requirements.
  const planner = useMemo(() => toPlannerRecipes(catalog.data ?? []), [catalog.data]);
  const examples = todays.length ? [] : exampleDishes(planner, loadSettings(), now).map(r => recipes.get(r.id)!);

  const tx = useHomeTaskText();
  const tasks = useHomeTasks();
  const [editing, setEditing] = useState<HomeTask | null>(null);
  const preview = homePreview(tasks.data ?? [], localDate());

  return (
    <div className="sm:pb-10" dir={dir}>
      <PageContainer size="md" className="py-4 sm:py-10">
        <header className="page-header mb-4 sm:mb-6">
          <h1 className="page-title sr-only sm:not-sr-only" data-testid="text-page-title">{text("title")}</h1>
          <p className="page-subtitle" data-testid="text-home-date">
            {now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:gap-4">
          <section className="card p-3 sm:p-5" aria-labelledby="home-meals" data-testid="home-meals">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 id="home-meals" className="text-base font-semibold">{text("todaysMeals")}</h2>
              <Link href="/meals?plan" className="btn btn-text">{text("viewWeek")}</Link>
            </div>
            {plan.batches.some(b => b.cookDate === today || b.serves.some(x => x.date === today)) && (catalog.isPending || catalog.isError) ? (
              <SectionState error={catalog.isError} retry={() => catalog.refetch()} text={text} />
            ) : examples.length ? (
              <div data-testid="home-examples">
                <p className="text-sm text-muted-foreground">{onHandText(lang, "examples")}</p>
                <ul className="mt-2 grid gap-3">{examples.map(recipe => (
                  <li key={recipe.id}>
                    <RecipeCard recipe={recipe} meta={<RecipeMeta recipe={{ ...recipe, servings: null }} />} href={`/recipe/${encodeURIComponent(recipe.id)}`} compact
                      testId={`home-example-${recipe.id}`}>
                      <span className="block text-xs text-muted-foreground">{onHandText(lang, "example")}</span>
                    </RecipeCard>
                  </li>))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-x-4">{mealSlots.map(meal => (
                  <button key={meal} type="button" onClick={() => openGenerator({ meal, day: now.getDay(), date: today })} disabled={!catalog.data}
                    data-testid={`home-add-${meal.toLowerCase()}`} className="btn btn-text -ms-2">{text(`add${meal}`)}</button>))}
                </div>
              </div>
            ) : (
              // Breakfast, Lunch and Dinner, as in the Week (2026-11-20); each meal has its own + Add.
              <div data-testid="home-today" className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {mealSlots.map(meal => {
                  const list = todays.filter(([batch]) => mealOf(batch) === meal);
                  const name = t(`meals.${meal.toLowerCase()}`);
                  const add = <button type="button" onClick={() => openGenerator({ meal, day: now.getDay(), date: today })} disabled={!catalog.data}
                    data-testid={`home-add-${meal.toLowerCase()}`} className="btn btn-text -ms-2">{text(`add${meal}`)}</button>;
                  // Only the meal of this time of day is open (6–11 Breakfast, 11–16 Lunch, 16–23 Dinner; `currentMeal`); every other
                  // meal is collapsed to its name and each dish's nutrition, and opens to its dishes and + Add (2026-11-22).
                  // From 23:00 to 6:00 every meal is collapsed.
                  const night = now.getHours() < 6 || now.getHours() >= 23;
                  const order = night ? -1 : mealSlots.indexOf(meal) - mealSlots.indexOf(currentMeal(now));
                  const dishes = list.length > 0 && <ul className={`mt-1 grid gap-3 ${order === 0 ? "max-w-xl" : ""}`}>
                    {list.map(([batch, cookedToday]) => {
                      const recipe = recipes.get(batch.recipeId)!;
                      const href = plannerRecipeURL(recipe.id, currentWeek(), batch.id);
                      const line = <span className="block text-xs text-muted-foreground" data-testid={`home-meal-meta-${recipe.id}`}>{meta(recipe, batch, cookedToday)}</span>;
                      return (
                        <li key={batch.id}>
                          {/* The recipe's own servings stay on the card for per-serving nutrition; the line shows time only ("Make X servings" is below). */}
                          <RecipeCard recipe={recipe} meta={<RecipeMeta recipe={{ ...recipe, servings: null }} />} href={href} compact={order !== 0}
                            testId={`home-meal-${recipe.id}`} ids={{ view: `home-meal-view-${recipe.id}` }}>
                            {line}
                            <button type="button" onClick={() => remove(batch, recipe.title)} className="btn btn-text -ms-2 self-start"
                              data-testid={`home-remove-${batch.id}`}>{p("removeDish")}</button>
                          </RecipeCard>
                        </li>
                      );
                    })}
                  </ul>;
                  if (!list.length || order !== 0) return (
                    <details key={meal} className="group" data-testid={`home-slot-${meal.toLowerCase()}`}>
                      <summary className="flex min-h-11 cursor-pointer flex-col justify-center">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name}</span>
                        {/* Collapsed: each dish's name and nutrition, styled as on its recipe card; hidden once the cards are open. */}
                        {list.length > 0 && <div className="mt-1 grid gap-3 pb-2 text-xs text-muted-foreground group-open:hidden" data-testid={`home-slot-${meal.toLowerCase()}-summary`}>
                          {list.map(([batch]) => {
                            const recipe = recipes.get(batch.recipeId)!;
                            const all = allNutrition.has(batch.id), id = `home-slot-summary-${batch.id}`;
                            const shown = recipeViewNutrients(recipe, recipeView);
                            return <div key={batch.id}>
                              {/* One line: the name (cut short if long), the first two nutrients and "…", which shows all of them below. */}
                              <div className="flex min-w-0 max-w-xl items-baseline gap-3">
                                <span className="min-w-0 truncate text-base font-semibold leading-snug text-foreground">{translations.get(recipe.id)?.title ?? recipe.title}</span>
                                {!all && <NutritionGrid recipe={recipe} testId={id} limit={2} />}
                                {shown > 2 && <button type="button" aria-expanded={all} aria-label={text("moreNutrition")} data-testid={`${id}-more`}
                                  className="-my-3 min-h-11 shrink-0 px-2 text-sm font-semibold text-foreground underline underline-offset-4"
                                  onClick={e => { e.preventDefault(); setAllNutrition(prev => { const next = new Set(prev); if (all) next.delete(batch.id); else next.add(batch.id); return next; }); }}>…</button>}
                              </div>
                              {all && <div className="mt-1.5"><NutritionGrid recipe={recipe} testId={id} small /></div>}
                            </div>;
                          })}
                        </div>}
                      </summary>
                      {dishes}
                      {add}
                    </details>
                  );
                  return (
                    <div key={meal} data-testid={`home-slot-${meal.toLowerCase()}`} data-current={order === 0 || undefined}>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name}</h3>
                      {dishes}
                      {add}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Opens Find my dish on a dish at once, with or without meals today. Never changes the Week or groceries. */}
            <button type="button" onClick={() => setFinding(true)} disabled={!catalog.data} className="btn btn-secondary mt-3" data-testid="home-find-my-dish">{householdText(lang, "suggestRecipe")}</button>
          </section>

          <details className="card p-3 sm:p-5" data-testid="home-task-preview">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-semibold">
              {tx("title")}
              {tasks.data && <span className="rounded-full bg-muted px-2 text-sm font-medium text-muted-foreground" data-testid="home-task-count">{preview.length}</span>}
            </summary>
            {tasks.isPending || tasks.isError ? <SectionState error={tasks.isError} retry={() => tasks.refetch()} text={text} />
              : preview.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="home-nothing-due">{tx("nothingDue")}</p>
              : <ul>{preview.map(task => <TaskRow key={task.id} task={task} onOpen={setEditing} />)}</ul>}
            <Link href="/home-tasks" className="btn btn-text" data-testid="link-view-all-tasks">{tx("viewAll")}</Link>
          </details>
        </div>
      </PageContainer>
      <MealGenerator target={generating} catalog={catalog.data ?? []} onClose={meal => { setGenerating(null); focusAdd(meal); }} onAdded={added} />
      <FindMyDish open={finding && !!catalog.data} onClose={() => setFinding(false)} catalog={catalog.data ?? []} />
      <TaskDialog task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
