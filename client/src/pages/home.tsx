import { useState } from "react";
import { Link } from "wouter";
import { PageContainer } from "@/components/layout/page-container";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { mealSlots, mealsOnDay, readPlan, type MealSlot } from "@/lib/meal-plan";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { MealSuggestion } from "@/components/meal-suggestion";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { homePreview, localDate, type HomeTask } from "@shared/home-tasks";
import { householdText } from "@/lib/household-copy";
import { RecipeViewRows, useServingsText } from "@/components/recipe-summary";
import { recipeStageMinutes } from "@/lib/recipe-time";
import type { Recipe } from "@/lib/storage";

const mealKey = { Breakfast: "meals.breakfast", Lunch: "meals.lunch", Dinner: "meals.dinner" } as const;
const addKey = { Breakfast: "addBreakfast", Lunch: "addLunch", Dinner: "addDinner" } as const;

function SectionState({ error, retry, text }: { error: boolean; retry: () => void; text: (k: "loading" | "loadError" | "retry") => string }) {
  return error
    ? <p role="alert" className="text-sm text-muted-foreground">{text("loadError")}{" "}
        <button type="button" className="btn btn-text" onClick={retry}>{text("retry")}</button></p>
    : <p className="text-sm text-muted-foreground" aria-busy="true">{text("loading")}</p>;
}

export default function Home() {
  const { t, lang, dir } = useI18n();
  const text = (key: Parameters<typeof homeText>[1], values?: Record<string, string | number>) => homeText(lang, key, values);
  // Local date and weekday: the plan is not dated, so "today" is today's weekday in the current plan.
  const [now] = useState(() => new Date());
  const [plan, setPlan] = useState(readPlan);
  const [picking, setPicking] = useState<MealSlot | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const catalog = useRecipeCatalog();

  const today = mealsOnDay(plan, now.getDay());
  const servingsText = useServingsText();
  /** "35 min total · 4 servings": the Week's servings for this meal, else the recipe's; unknown values are left out. */
  const meta = (recipe: Recipe, servings?: number | null) => {
    const minutes = recipeStageMinutes(recipe, "total");
    return [minutes !== null ? t("card.totalMinutes", { count: minutes }) : null, servingsText(servings ? String(servings) : recipe.servings)].filter(Boolean).join(" · ");
  };
  const recipes = new Map((catalog.data ?? []).map(r => [r.id, r]));

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
            {today.length > 0 && (catalog.isPending || catalog.isError) ? (
              <SectionState error={catalog.isError} retry={() => catalog.refetch()} text={text} />
            ) : (
              mealSlots.map(slot => {
                const rows = today.filter(a => a.mealType === slot && recipes.has(a.recipeId));
                return (
                  <div key={slot} className="flex items-start gap-3" data-testid={`home-slot-${slot.toLowerCase()}`}>
                    <h3 className="w-24 shrink-0 break-words pt-3.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(mealKey[slot])}</h3>
                    {rows.length === 0 ? (
                      <button type="button" onClick={() => setPicking(slot)} disabled={!catalog.data} data-testid={`home-add-${slot.toLowerCase()}`}
                        className="flex min-h-11 flex-1 items-center rounded-md py-1 text-start text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        {text(addKey[slot])}
                      </button>
                    ) : (
                    <ul className="min-w-0 flex-1">
                      {rows.map(a => {
                        const recipe = recipes.get(a.recipeId)!;
                        return (
                          <li key={`${slot}-${a.recipeId}`}>
                            <Link href={`/recipe/${encodeURIComponent(recipe.id)}`} data-testid={`home-meal-${recipe.id}`}
                              className="flex min-h-11 items-center gap-3 rounded-md py-1 hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                              {recipe.image && <img src={recipe.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />}
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{recipe.title}</span>
                                {meta(recipe, a.servings) && <span className="block text-xs text-muted-foreground" data-testid={`home-meal-meta-${recipe.id}`}>{meta(recipe, a.servings)}</span>}
                                <RecipeViewRows recipe={recipe} testId={`home-meal-view-${recipe.id}`} />
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    )}
                  </div>
                );
              })
            )}
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
      <MealSuggestion meal={picking} day={now.getDay()} catalog={catalog.data ?? []} onClose={() => setPicking(null)} onAdded={() => setPlan(readPlan())} />
      <MealSuggestion mode="cook" meal={suggesting ? "Dinner" : null} day={now.getDay()} catalog={catalog.data ?? []} onClose={() => setSuggesting(false)} onAdded={() => undefined} />
      <TaskDialog task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
