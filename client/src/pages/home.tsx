import { useState } from "react";
import { Link } from "wouter";
import { PageContainer } from "@/components/layout/page-container";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { cookedOn, readPlan, removeBatch, servedFrom, writePlan, type Batch } from "@/lib/meal-plan";
import { batchTotal } from "@shared/cooking-plan";
import { baseServings } from "@/lib/ingredient-scale";
import { calendarDate, currentWeek, plannerRecipeURL } from "@/lib/week-plan";
import { MealGenerator, type MealAdded, type MealTarget } from "@/components/meal-generator";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { MealSuggestion } from "@/components/meal-suggestion";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { homePreview, localDate, type HomeTask } from "@shared/home-tasks";
import { householdText } from "@/lib/household-copy";
import { RecipeViewRows } from "@/components/recipe-summary";
import { RecipeCard } from "@/components/recipe-card";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const [generating, setGenerating] = useState<MealTarget | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const catalog = useRecipeCatalog();
  const { toast } = useToast();
  // Focus goes back to the Today section's + Add a dish button.
  const focusAdd = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="home-add-dish"]`)?.focus());
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

  const phone = useIsMobile();
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
            ) : todays.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground" data-testid="home-nothing-today">{text("nothingToday")}</p>
            ) : (
              <ul data-testid="home-today" className={phone ? "grid gap-3" : ""}>
                {todays.map(([batch, cookedToday]) => {
                  const recipe = recipes.get(batch.recipeId)!;
                  const href = plannerRecipeURL(recipe.id, currentWeek(), batch.id);
                  const line = <span className="block text-xs text-muted-foreground" data-testid={`home-meal-meta-${recipe.id}`}>{meta(recipe, batch, cookedToday)}</span>;
                  return (
                    <li key={batch.id}>
                      {phone ? <RecipeCard recipe={{ ...recipe, servings: null }} href={href} testId={`home-meal-${recipe.id}`}
                        ids={{ view: `home-meal-view-${recipe.id}` }}>{line}</RecipeCard> :
                      <Link href={href} data-testid={`home-meal-${recipe.id}`}
                        className="flex min-h-11 items-center gap-3 rounded-md py-1 hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        {recipe.image && <img src={recipe.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{recipe.title}</span>
                          {line}
                          <RecipeViewRows recipe={recipe} testId={`home-meal-view-${recipe.id}`} />
                        </span>
                      </Link>}
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" onClick={() => setGenerating({ meal: "Dinner", day: now.getDay(), date: today })} disabled={!catalog.data} data-testid="home-add-dish"
              className="btn btn-text -ms-2">{text("addDish")}</button>
            {/* Available even when today is empty; never changes the Week or groceries. */}
            <button type="button" onClick={() => setSuggesting(true)} disabled={!catalog.data} className="btn btn-text -ms-2" data-testid="home-suggest-recipe">{householdText(lang, "suggestRecipe")}</button>
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
      <MealGenerator target={generating} catalog={catalog.data ?? []} onClose={() => { setGenerating(null); focusAdd(); }} onAdded={added} />
      <MealSuggestion meal={suggesting ? "Dinner" : null} day={now.getDay()} catalog={catalog.data ?? []} onClose={() => setSuggesting(false)} />
      <TaskDialog task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
