import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageContainer } from "@/components/layout/page-container";
import { useI18n } from "@/lib/i18n";
import { homeText } from "@/lib/home-copy";
import { mealSlots, mealsOnDay, readPlan, type MealSlot } from "@/lib/meal-plan";
import { buildShoppingList, groceryShoppingQueryKey, type Extra, type ShoppingPreference } from "@/lib/grocery-items";
import { buildRecipeGroceryRows } from "@/lib/grocery-meal-removal";
import { readGroceryPrefs } from "@/lib/grocery-progress";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { MealSuggestion } from "@/components/meal-suggestion";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { homePreview, localDate, type HomeTask } from "@shared/home-tasks";

const mealKey = { Breakfast: "meals.breakfast", Lunch: "meals.lunch", Dinner: "meals.dinner" } as const;
const addKey = { Breakfast: "addBreakfast", Lunch: "addLunch", Dinner: "addDinner" } as const;

function SectionState({ error, retry, text }: { error: boolean; retry: () => void; text: (k: "loading" | "loadError" | "retry") => string }) {
  return error
    ? <p role="alert" className="text-sm text-muted-foreground">{text("loadError")}{" "}
        <button type="button" className="btn btn-text" onClick={retry}>{text("retry")}</button></p>
    : <p className="text-sm text-muted-foreground" aria-busy="true">{text("loading")}</p>;
}

/** How many task rows end above the bottom tab bar (at least one: with large text the page scrolls instead). */
export function rowsThatFit(list: HTMLElement): number {
  const nav = document.querySelector('[data-testid="app-nav-bottom"]')?.getBoundingClientRect().height ?? 0; // 0 when hidden on wide screens
  const limit = window.innerHeight - nav - 16; // the card's bottom padding
  const rows = Array.from(list.children).filter(row => row.getBoundingClientRect().bottom + window.scrollY <= limit);
  return Math.max(1, rows.length);
}

export default function Home() {
  const { t, lang, dir } = useI18n();
  const text = (key: Parameters<typeof homeText>[1], values?: Record<string, string | number>) => homeText(lang, key, values);
  // Local date and weekday: the plan is not dated, so "today" is today's weekday in the current plan.
  const [now] = useState(() => new Date());
  const [plan, setPlan] = useState(readPlan);
  const [picking, setPicking] = useState<MealSlot | null>(null);
  const catalog = useRecipeCatalog();
  const extras = useQuery<Extra[]>({ queryKey: ["/api/grocery-extras"], retry: false, refetchOnMount: "always" });
  const shopping = useQuery<ShoppingPreference[]>({ queryKey: groceryShoppingQueryKey, retry: false, refetchOnMount: "always" });

  const today = mealsOnDay(plan, now.getDay());
  const recipes = new Map((catalog.data ?? []).map(r => [r.id, r]));
  const usesCatalog = plan.selectedIds.length > 0 || plan.planAssignments.length > 0;

  const grocery = () => {
    if ((usesCatalog && catalog.isError) || extras.isError || shopping.isError) return "error";
    if ((usesCatalog && catalog.isPending) || extras.isPending || shopping.isPending) return "loading";
    const recipeRows = buildRecipeGroceryRows(plan, catalog.data ?? []);
    const skipped = new Set(shopping.data?.filter(row => row.skipped).map(row => row.key));
    const { activeRows, purchasedRows } = buildShoppingList(recipeRows, extras.data ?? [], readGroceryPrefs().checked, skipped);
    return { total: activeRows.length + purchasedRows.length, left: activeRows.length };
  };
  const groceryState = grocery();
  const tx = useHomeTaskText();
  const tasks = useHomeTasks();
  const [editing, setEditing] = useState<HomeTask | null>(null);
  const preview = homePreview(tasks.data ?? [], localDate());
  // Show every row, measure before paint, then keep only the rows that fit. Re-measure when anything above can change height.
  const [fit, setFit] = useState(Infinity);
  const listRef = useRef<HTMLUListElement>(null);
  const aboveRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => setFit(Infinity), [preview.length, lang]);
  useLayoutEffect(() => { if (fit === Infinity && listRef.current) setFit(rowsThatFit(listRef.current)); }, [fit, preview.length, lang]);
  useEffect(() => {
    const again = () => setFit(Infinity);
    const observer = new ResizeObserver(again);
    if (aboveRef.current) observer.observe(aboveRef.current);
    window.addEventListener("resize", again);
    return () => { observer.disconnect(); window.removeEventListener("resize", again); };
  }, []);
  const shown = preview.slice(0, fit);

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-10" dir={dir}>
      <PageContainer size="md" className="py-4 sm:py-10">
        <header className="page-header mb-4 sm:mb-6">
          <h1 className="page-title sr-only sm:not-sr-only" data-testid="text-page-title">{text("title")}</h1>
          <p className="page-subtitle" data-testid="text-home-date">
            {now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:gap-4">
          <div ref={aboveRef} className="flex flex-col gap-3 sm:gap-4">
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
                              <span className="text-sm font-medium">{recipe.title}</span>
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
          </section>

          <section className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 sm:p-5" aria-labelledby="home-groceries" data-testid="home-groceries">
            <h2 id="home-groceries" className="text-base font-semibold">{text("groceries")}</h2>
            <Link href="/grocery-list" className="btn btn-text order-last ms-auto">{text("openList")}</Link>
            <div className="min-w-0 flex-1">
            {groceryState === "error" || groceryState === "loading" ? (
              <SectionState error={groceryState === "error"} retry={() => { void catalog.refetch(); void extras.refetch(); void shopping.refetch(); }} text={text} />
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
            </div>
          </section>
          </div>

          <section className="card p-3 sm:p-5" aria-labelledby="home-tasks" data-testid="home-task-preview">
            <div className="mb-1 flex min-h-11 items-center justify-between gap-2">
              <h2 id="home-tasks" className="text-base font-semibold">{tx("title")}</h2>
              {shown.length < preview.length && <Link href="/home-tasks" className="btn btn-text" data-testid="link-view-all-tasks">{tx("viewAll")}</Link>}
            </div>
            {tasks.isPending || tasks.isError ? <SectionState error={tasks.isError} retry={() => tasks.refetch()} text={text} />
              : preview.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="home-nothing-due">{tx("nothingDue")}</p>
              : <ul ref={listRef}>{shown.map(task => <TaskRow key={task.id} task={task} onOpen={setEditing} />)}</ul>}
          </section>
        </div>
      </PageContainer>
      <MealSuggestion meal={picking} day={now.getDay()} catalog={catalog.data ?? []} onClose={() => setPicking(null)} onAdded={() => setPlan(readPlan())} />
      <TaskDialog task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
