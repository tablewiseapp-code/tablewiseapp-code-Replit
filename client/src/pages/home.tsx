import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageContainer } from "@/components/layout/page-container";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { mealSlots, mealsOnDay, readPlan } from "@/lib/meal-plan";
import { buildGroceryItems, type GroceryExtra } from "@/lib/grocery-items";
import { readGroceryPrefs } from "@/lib/grocery-progress";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { homePreview, localDate, type HomeTask } from "@shared/home-tasks";

const mealKey = { Breakfast: "meals.breakfast", Lunch: "meals.lunch", Dinner: "meals.dinner" } as const;

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
  const [plan] = useState(readPlan);
  const catalog = useRecipeCatalog();
  const extras = useQuery<GroceryExtra[]>({ queryKey: ["/api/grocery-extras"], retry: false });

  const today = mealsOnDay(plan, now.getDay());
  const recipes = new Map((catalog.data ?? []).map(r => [r.id, r]));
  const usesCatalog = plan.selectedIds.length > 0 || plan.planAssignments.length > 0;

  const grocery = () => {
    if ((usesCatalog && catalog.isError) || extras.isError) return "error";
    if ((usesCatalog && catalog.isPending) || extras.isPending) return "loading";
    const { items } = buildGroceryItems(catalog.data ?? [], plan.selectedIds, plan.planAssignments, extras.data ?? []);
    const checked = readGroceryPrefs().checked;
    return { total: items.size, left: [...items.keys()].filter(key => !checked.has(key)).length };
  };
  const groceryState = grocery();
  const tx = useHomeTaskText();
  const tasks = useHomeTasks();
  const [editing, setEditing] = useState<HomeTask | null>(null);
  const preview = homePreview(tasks.data ?? [], localDate());

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-10" dir={dir}>
      <PageContainer size="md" className="py-8 sm:py-10">
        <header className="page-header">
          <h1 className="page-title" data-testid="text-page-title">{text("title")}</h1>
          <p className="page-subtitle" data-testid="text-home-date">
            {now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <section className="card p-4 sm:p-5" aria-labelledby="home-meals" data-testid="home-meals">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="home-meals" className="text-base font-semibold">{text("todaysMeals")}</h2>
              <Link href="/meals?plan" className="btn btn-text">{text("viewWeek")}</Link>
            </div>
            {today.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">{text("noMeals")}</p>
                <Link href="/meals" className="btn btn-primary" data-testid="home-plan-meals">{text("planMeals")}</Link>
              </div>
            ) : catalog.isPending || catalog.isError ? (
              <SectionState error={catalog.isError} retry={() => catalog.refetch()} text={text} />
            ) : (
              mealSlots.map(slot => {
                const rows = today.filter(a => a.mealType === slot && recipes.has(a.recipeId));
                if (!rows.length) return null;
                return (
                  <div key={slot} className="mt-2 first:mt-0">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(mealKey[slot])}</h3>
                    <ul>
                      {rows.map(a => {
                        const recipe = recipes.get(a.recipeId)!;
                        return (
                          <li key={`${slot}-${a.recipeId}`}>
                            <Link href={`/recipe/${encodeURIComponent(recipe.id)}`} data-testid={`home-meal-${recipe.id}`}
                              className="flex min-h-11 items-center gap-3 rounded-md py-1 hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                              {recipe.image && <img src={recipe.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />}
                              <span className="text-sm font-medium">{recipe.title}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="home-groceries" data-testid="home-groceries">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="home-groceries" className="text-base font-semibold">{text("groceries")}</h2>
              <Link href="/grocery-list" className="btn btn-text">{text("openList")}</Link>
            </div>
            {groceryState === "error" || groceryState === "loading" ? (
              <SectionState error={groceryState === "error"} retry={() => { void catalog.refetch(); void extras.refetch(); }} text={text} />
            ) : groceryState.total === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{text("noItems")}</p>
                <Link href="/grocery-list?add" className="btn btn-secondary" data-testid="home-add-item">{text("addItem")}</Link>
              </div>
            ) : (
              <p className="text-sm" data-testid="home-grocery-count">
                {groceryState.left === 0 ? text("allChecked") : groceryState.left === 1 ? text("toBuyOne") : text("toBuy", { count: groceryState.left })}
              </p>
            )}
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="home-tasks" data-testid="home-task-preview">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="home-tasks" className="text-base font-semibold">{tx("title")}</h2>
              <Link href="/home-tasks" className="btn btn-text" data-testid="link-view-all-tasks">{tx("viewAll")}</Link>
            </div>
            {tasks.isPending || tasks.isError ? <SectionState error={tasks.isError} retry={() => tasks.refetch()} text={text} />
              : preview.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="home-nothing-due">{tx("nothingDue")}</p>
              : <ul>{preview.map(task => <TaskRow key={task.id} task={task} onOpen={setEditing} />)}</ul>}
          </section>
        </div>
      </PageContainer>
      <TaskDialog task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
