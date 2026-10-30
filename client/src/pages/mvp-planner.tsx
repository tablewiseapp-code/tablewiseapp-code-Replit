import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Leaf, Plus, RotateCcw, Users, UtensilsCrossed } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { useRecipeCatalog, useWeekPlan } from "@/hooks/use-week-workspace";
import { addDays, assignDinner, canConfirm, confirmPlan, parseCalendarDate, plannerURL, plannerRecipeURL, replaceDinner, selectedWeek, toggleDinner, weekDays } from "@/lib/week-plan";
import type { Recipe } from "@/lib/storage";
import { useMvpCopy } from "@/lib/mvp-copy";
import { usePilotPage } from "@/hooks/use-pilot-page";
import { recipeStageMinutes, type RecipeTimeMode } from "@/lib/recipe-time";
import { recipeToolKeys } from "@/lib/recipe-tools";
import { MvpMealFilters } from "@/components/mvp-meal-filters";
import { matchesMealFilters, readMealFilterPreference, saveMealFilterPreference, type MealFilters } from "@/lib/meal-filters";
import { recipeTimePreferenceKey } from "@/lib/recipe-time";

const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a] disabled:cursor-not-allowed disabled:opacity-45";

function localDate(value: string, locale: string, options: Intl.DateTimeFormatOptions) {
  const date = parseCalendarDate(value);
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : value;
}

type TimeMode = RecipeTimeMode;

function RecipeFacts({ recipe, context, timeMode, week }: { recipe: Recipe; context: "catalog" | "selected"; timeMode: TimeMode; week: string }) {
  const { t } = useMvpCopy();
  const portions = recipe.servings?.trim();
  const tools = recipeToolKeys(recipe.steps, recipe.equipment);
  const minutes = recipeStageMinutes(recipe, timeMode);
  const hasTime = minutes !== null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#798279]"
      data-testid={`mvp-${context}-facts-${recipe.id}`}>
      <span className="inline-flex items-center gap-1">
        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {portions ? t("portions", { count: portions }) : t("portionsUnknown")}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {hasTime ? `${t(timeMode)}: ${minutes} ${t("minutesShort")}`
          : t(timeMode === "preparation" ? "preparationTimeUnknown" : "totalTimeUnknown")}
      </span>
      {timeMode === "total" && recipe.prepTime != null &&
        <span>{t("preparation")}: {recipe.prepTime} {t("minutesShort")}</span>}
      <span className="basis-full">{t("toolsUsed")}: {tools.length ? tools.map(tool => t(tool)).join(", ") : t("toolsUnknown")}</span>
      {recipe.metadataEstimated && <span className="basis-full">{t("developmentEstimates")}</span>}
      <Link href={plannerRecipeURL(recipe.id, week)} aria-label={`${t("showRecipe")}: ${recipe.title}`}
        data-testid={`mvp-show-${context}-${recipe.id}`}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9dfd4] bg-white px-3 font-medium text-[#42624e] hover:bg-[#f2f6ef]">
        {t("showRecipe")}
      </Link>
    </div>
  );
}

function PlannerForWeek({ week }: { week: string }) {
  usePilotPage("planner_opened", week);
  const { lang, dir, t } = useMvpCopy();
  const [, setLocation] = useLocation();
  const workspace = useWeekPlan(week);
  const catalog = useRecipeCatalog();
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [filters, setFilters] = useState(readMealFilterPreference);
  const [preferenceSaveFailed, setPreferenceSaveFailed] = useState(false);
  const changeFilters = (next: MealFilters) => {
    setFilters(next);
    setPreferenceSaveFailed(!saveMealFilterPreference(next));
  };
  const [timeMode, setTimeMode] = useState<TimeMode>(() => {
    try {
      return localStorage.getItem(recipeTimePreferenceKey) === "preparation" ? "preparation" : "total";
    } catch { return "total"; }
  });
  const plan = workspace.plan;
  const recipes = catalog.data ?? [];
  const matchingRecipes = useMemo(() => recipes.filter(recipe => matchesMealFilters(recipe, filters, timeMode)), [recipes, filters, timeMode]);
  const byId = useMemo(() => new Map(recipes.map(recipe => [recipe.id, recipe])), [recipes]);
  const days = weekDays(week);
  const locale = lang === "he" ? "he-IL" : lang === "ru" ? "ru-RU" : "en";
  const canSave = canConfirm(plan) && plan.selectedRecipeIds.every(id => byId.has(id)) &&
    !catalog.isError && !catalog.isFetching && !catalog.isPending && !workspace.issue;
  const issueKey = workspace.issue === "invalid" ? "storageInvalid"
    : workspace.issue === "unavailable" ? "storageUnavailable"
      : workspace.issue === "changed" ? "storageChanged"
        : workspace.issue === "save" ? "storageSave" : null;

  const updatePlan = (next: typeof plan) => {
    if (!workspace.issue) workspace.save(next);
  };
  const jumpToWeek = (date: string) => setLocation(plannerURL(date));
  const resetWeek = () => {
    if (window.confirm(t("resetConfirm"))) workspace.reset();
  };

  return (
    <div dir={dir} className="min-h-[100dvh] bg-[#f5f4ed] text-[#27342e]" data-testid="mvp-planner">
      <AppHeader title="TableWise" subtitle={t("plannerEyebrow")} />
      <PageContainer size="lg" className="py-5 sm:py-9">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d9dfd4] bg-[#fbfbf7] px-3 py-1.5 text-xs font-medium text-[#52675a]">
              <CalendarDays className="h-4 w-4 text-[#b77a4b]" aria-hidden="true" />
              <span>{t("weekOf")}</span>
              <time data-testid="mvp-week" dateTime={week} className="font-semibold text-[#27342e]">
                {localDate(week, locale, { month: "long", day: "numeric", year: "numeric" })}
              </time>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t("previousWeek")} onClick={() => jumpToWeek(addDays(week, -7))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9dfd4] bg-[#fbfbf7] text-[#45594c] hover:bg-white"
                data-testid="mvp-prev-week">
                {dir === "rtl" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              </button>
              <button type="button" aria-label={t("nextWeek")} onClick={() => jumpToWeek(addDays(week, 7))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9dfd4] bg-[#fbfbf7] text-[#45594c] hover:bg-white"
                data-testid="mvp-next-week">
                {dir === "rtl" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <section className="relative overflow-hidden rounded-[1.75rem] border border-[#dbe1d7] bg-[#e8eee4] px-5 py-7 sm:px-9 sm:py-10">
            <div className="pointer-events-none absolute -end-14 -top-24 h-64 w-64 rounded-full border-[1px] border-[#cbd7c9] opacity-70" />
            <div className="pointer-events-none absolute -end-2 -top-12 h-48 w-48 rounded-full border-[1px] border-[#cbd7c9] opacity-70" />
            <div className="relative max-w-2xl">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#697f6c]">
                <Leaf className="h-4 w-4" aria-hidden="true" /> {t("plannerEyebrow")}
              </p>
              <h1 className="max-w-xl text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-[#273b30] sm:text-5xl">{t("plannerTitle")}</h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-[#5c6b60] sm:text-base">{t("plannerIntro")}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#d9e4d5] px-3 py-2 text-sm font-medium text-[#3b5944]" aria-live="polite">
                  <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                  {t("dinnersSelected", { count: plan.selectedRecipeIds.length })}
                </span>
                {plan.confirmed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#faf8ef] px-3 py-2 text-sm font-medium text-[#4d6a52]">
                    <Check className="h-4 w-4" aria-hidden="true" /> {t("confirmed")}
                  </span>
                )}
              </div>
            </div>
          </section>

          {issueKey && (
            <section role="alert" className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#d8a58e] bg-[#fff7f1] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-5 text-[#754b3a]">{t(issueKey)}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={workspace.reload} className={`${buttonBase} border border-[#d8c2b5] bg-white text-[#654d40]`}>{t("reload")}</button>
                <button type="button" onClick={resetWeek} className={`${buttonBase} bg-[#754b3a] text-white`}>{t("reset")}</button>
              </div>
            </section>
          )}

          {(catalog.isError || catalog.isFetching) && (
            <section role={catalog.isError ? "alert" : "status"} className={`mt-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${catalog.isError ? "border-[#d8a58e] bg-[#fff7f1]" : "border-[#d9dfd4] bg-[#fbfbf7]"}`}>
              <div className="text-sm leading-5 text-[#58665c]">
                <p>{catalog.isError ? t("catalogError") : t("loading")}</p>
                {(catalog.isError || catalog.isFetching) && recipes.length > 0 && <p className="mt-1 text-xs">{t("stale")}</p>}
              </div>
              <button type="button" onClick={() => void catalog.refetch()} className={`${buttonBase} border border-[#d9dfd4] bg-white text-[#45594c]`} data-testid="mvp-retry">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t("retry")}
              </button>
            </section>
          )}

          {catalog.isPending && !catalog.data && plan.selectedRecipeIds.length === 0 ? (
            <section className="mt-6 grid gap-3 md:grid-cols-2" aria-label={t("loading")}>
              {[0, 1, 2, 3].map(index => <div key={index} className="h-28 animate-pulse rounded-2xl border border-[#e2e5dc] bg-[#eceee7]" />)}
            </section>
          ) : recipes.length === 0 && !catalog.isFetching && !catalog.isError && plan.selectedRecipeIds.length === 0 ? (
            <section className="mt-6 rounded-2xl border border-dashed border-[#cbd5c7] bg-[#fbfbf7] p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8eee4] text-[#69836c]"><CircleHelp className="h-5 w-5" /></div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{t("noRecipes")}</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#68756a]">{t("noRecipesHint")}</p>
              <Link href="/recipes" className={`${buttonBase} mt-5 bg-[#42624e] text-white hover:bg-[#344f3e]`}>{t("goRecipes")}</Link>
            </section>
          ) : (
            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.88fr)] lg:items-start">
              <section aria-labelledby="mvp-recipe-heading" className="min-w-0">
                <div className="mb-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#9a704f]">{t("recipes")}</p>
                    <h2 id="mvp-recipe-heading" className="mt-1 text-xl font-semibold tracking-tight">{t("browseRecipes")}</h2>
                  </div>
                  {recipes.length > 0 && <span className="text-xs text-[#758077]">{recipes.length}</span>}
                </div>
                <MvpMealFilters filters={filters} onChange={changeFilters} timeMode={timeMode}
                  resultCount={matchingRecipes.length} onTimeModeChange={mode => {
                    setTimeMode(mode);
                    try { localStorage.setItem(recipeTimePreferenceKey, mode); }
                    catch { setPreferenceSaveFailed(true); }
                  }} />
                {preferenceSaveFailed && <p role="status" className="mb-3 text-xs text-[#815b49]">{t("filterStorage")}</p>}
                {recipes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#d5dcd1] bg-[#fbfbf7] p-5 text-sm leading-6 text-[#68756a]">
                    {catalog.isFetching || catalog.isPending ? t("loading") : catalog.isError ? t("catalogError") : t("noRecipes")}
                  </div>
                ) : matchingRecipes.length === 0 ? (
                  <p role="status" data-testid="mvp-no-matches" className="rounded-2xl border border-dashed border-[#d5dcd1] bg-[#fbfbf7] p-5 text-sm leading-6 text-[#68756a]">{t("noFilterMatches")}</p>
                ) : <div className="grid gap-3 sm:grid-cols-2">
                  {matchingRecipes.map(recipe => {
                    const selected = plan.selectedRecipeIds.includes(recipe.id);
                    const canChoose = !selected && plan.selectedRecipeIds.length < 3 &&
                      !workspace.issue && !catalog.isError && !catalog.isFetching;
                    return (
                      <article key={recipe.id} className={`flex min-w-0 flex-col rounded-2xl border p-4 transition-colors ${selected ? "border-[#9eb69d] bg-[#f2f6ef]" : "border-[#dfe3da] bg-[#fbfbf7]"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="min-w-0 text-[0.98rem] font-semibold leading-5 text-[#34443a]">{recipe.title}</h3>
                          {selected && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d9e7d8] text-[#42624e]"><Check className="h-4 w-4" aria-hidden="true" /></span>}
                        </div>
                        <div className="mt-3 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#798279]">
                          <RecipeFacts recipe={recipe} context="catalog" timeMode={timeMode} week={week} />
                          {recipe.tags?.slice(0, 2).map(tag => <span key={tag} className="rounded-full bg-[#eef0e9] px-2 py-1">{tag}</span>)}
                        </div>
                        <button type="button" disabled={!selected && !canChoose} onClick={() => updatePlan(toggleDinner(plan, recipe.id))}
                          aria-label={selected ? `${t("remove")}: ${recipe.title}` : `${t("browseRecipes")}: ${recipe.title}`}
                          className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-45 ${selected ? "border-[#c8d8c5] bg-white text-[#48664e] hover:bg-[#f3f7f1]" : "border-[#dce2d8] bg-white text-[#52665a] hover:border-[#9db39d] hover:bg-[#f4f7f1]"}`}
                          data-testid={selected ? `mvp-card-remove-${recipe.id}` : `mvp-choose-${recipe.id}`}>
                          {selected ? <><Check className="h-4 w-4" />{t("remove")}</> : <><Plus className="h-4 w-4" />{t("browseRecipes")}</>}
                        </button>
                      </article>
                    );
                  })}
                </div>}
              </section>

              <aside className="rounded-2xl border border-[#d9dfd4] bg-[#fbfbf7] p-4 sm:p-5 lg:sticky lg:top-4">
                <div className="flex items-center justify-between gap-2 border-b border-[#e4e7df] pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#9a704f]">{t("weekShort")}</p>
                    <h2 className="mt-1 text-lg font-semibold" data-testid="mvp-selected-heading">{t("selectedDinners")}</h2>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#e9eee5] px-2.5 py-1 text-sm font-semibold text-[#526c56]">{plan.selectedRecipeIds.length}/3</span>
                </div>
                {plan.selectedRecipeIds.length === 0 ? (
                  <div className="py-7 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#f1f0e9] text-[#a37b56]"><UtensilsCrossed className="h-5 w-5" /></div>
                    <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#798279]">{t("emptyBody")}</p>
                  </div>
                ) : (
                  <ol className="divide-y divide-[#e9ebe4]">
                    {plan.selectedRecipeIds.map((id, index) => {
                      const recipe = byId.get(id);
                      const assignedDay = plan.assignments[id];
                      const unavailable = !recipe && catalog.isSuccess && !catalog.isFetching;
                      const occupiedDays = new Set(Object.entries(plan.assignments).filter(([recipeId]) => recipeId !== id).map(([, day]) => day));
                      const replaceOptions = matchingRecipes.filter(candidate => !plan.selectedRecipeIds.includes(candidate.id));
                      return (
                        <li key={id} className="py-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8eee4] text-xs font-semibold text-[#58725d]">{String(index + 1).padStart(2, "0")}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`break-words text-sm font-semibold ${unavailable ? "text-[#815b49]" : "text-[#34443a]"}`}>{recipe?.title ?? id}</p>
                              {recipe && <div className="mt-2"><RecipeFacts recipe={recipe} context="selected" timeMode={timeMode} week={week} /></div>}
                              {unavailable && <p className="mt-1 text-xs text-[#936e5b]">{t("incomplete")}</p>}
                              <label className="mt-3 block">
                                <span className="sr-only">{t("chooseDay")}: {recipe?.title ?? id}</span>
                                <span className="relative block">
                                  <select value={assignedDay ?? ""} disabled={Boolean(workspace.issue)}
                                    onChange={event => updatePlan(assignDinner(plan, id, event.target.value))}
                                    className="min-h-11 w-full appearance-none rounded-xl border border-[#dce2d8] bg-white px-3 pe-9 text-sm text-[#52665a] focus:border-[#8ea58c] focus:outline-none"
                                    data-testid={`mvp-day-${id}`}>
                                    <option value="">{t("unassigned")}</option>
                                    {days.map((day, dayIndex) => <option key={day} value={day} disabled={occupiedDays.has(day)}>
                                      {localDate(day, locale, { weekday: "long", month: "short", day: "numeric" })}
                                    </option>)}
                                  </select>
                                  <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#738076]" />
                                </span>
                              </label>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button type="button" disabled={Boolean(workspace.issue)} onClick={() => { setReplacingId(replacingId === id ? null : id); }}
                                  className="min-h-10 rounded-full px-2 text-xs font-medium text-[#56725b] underline decoration-[#c4d1c1] underline-offset-4 disabled:opacity-45"
                                  data-testid={`mvp-replace-${id}`}>{t("replacing")}</button>
                                <button type="button" disabled={Boolean(workspace.issue)} onClick={() => updatePlan(toggleDinner(plan, id))}
                                  className="min-h-10 rounded-full px-2 text-xs font-medium text-[#8a6651] underline decoration-[#dcc9bd] underline-offset-4 disabled:opacity-45"
                                  data-testid={`mvp-remove-${id}`}>{t("remove")}</button>
                              </div>
                              {replacingId === id && (
                                <label className="mt-2 block">
                                  <span className="sr-only">{t("replace")}: {recipe?.title ?? id}</span>
                                  <select data-testid={`mvp-replacement-select-${id}`} disabled={Boolean(workspace.issue) || catalog.isError || catalog.isFetching || replaceOptions.length === 0} defaultValue=""
                                    onChange={event => {
                                      if (event.target.value) {
                                        updatePlan(replaceDinner(plan, id, event.target.value));
                                        setReplacingId(null);
                                      }
                                    }}
                                    className="min-h-11 w-full rounded-xl border border-[#dce2d8] bg-white px-3 text-sm text-[#52665a] focus:outline-none focus:ring-2 focus:ring-[#afc0aa]">
                                    <option value="">{t("replace")}</option>
                                    {replaceOptions.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
                                  </select>
                                  {replaceOptions.length === 0 && <span role="status" data-testid={`mvp-no-replacements-${id}`} className="mt-2 block text-xs leading-5 text-[#68756a]">{t("noReplacementMatches")}</span>}
                                </label>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {!plan.confirmed && (
                  <div className="mt-2">
                    <button type="button" disabled={!canSave} onClick={() => {
                      if (canSave) updatePlan(confirmPlan(plan));
                    }} className={`${buttonBase} w-full bg-[#42624e] text-white hover:bg-[#344f3e]`} data-testid="mvp-confirm">
                      <Check className="h-4 w-4" aria-hidden="true" /> {t("confirm")}
                    </button>
                    <p className="mt-2 min-h-5 text-center text-xs leading-5 text-[#798279]" aria-live="polite">
                      {plan.selectedRecipeIds.length < 3 ? t("chooseThree")
                        : Object.keys(plan.assignments).length < 3 ? t("assignThree")
                          : (catalog.isError || catalog.isFetching || catalog.isPending) ? t("catalogNeeded") : ""}
                    </p>
                  </div>
                )}
                {plan.confirmed && (
                  <Link href={`/grocery-list?source=mvp&week=${week}`} className={`${buttonBase} mt-2 w-full bg-[#ad7047] text-white hover:bg-[#955f3d]`} data-testid="mvp-view-grocery">
                    <UtensilsCrossed className="h-4 w-4" aria-hidden="true" /> {t("viewGroceries")}
                  </Link>
                )}
                <div className="mt-4 border-t border-[#e4e7df] pt-3">
                  <Link href="/meals" className="inline-flex min-h-11 items-center gap-2 px-1 text-xs font-medium text-[#718075] underline decoration-[#c7d0c3] underline-offset-4 hover:text-[#405b48]">
                    {t("advanced")} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </aside>
            </div>
          )}
          {plan.selectedRecipeIds.length > 0 && !workspace.issue && <p className="mt-7 text-center text-xs text-[#879087]">{t("saved")}</p>}
        </div>
      </PageContainer>
    </div>
  );
}

export default function MvpPlanner() {
  const search = useSearch();
  const { dir, t } = useMvpCopy();
  const week = selectedWeek(search);
  if (!week) {
    return (
      <div dir={dir} className="min-h-[100dvh] bg-[#f5f4ed] text-[#27342e]">
        <AppHeader title="TableWise" subtitle={t("plannerEyebrow")} />
        <PageContainer size="md" className="py-12">
          <section role="alert" className="rounded-2xl border border-[#d8c6b7] bg-[#fffaf4] p-6">
            <h1 className="text-xl font-semibold">{t("invalidWeek")}</h1>
            <p className="mt-2 text-sm text-[#6b746d]">{t("invalidWeekHint")}</p>
            <Link href="/plan" className={`${buttonBase} mt-5 bg-[#42624e] text-white`}>{t("backPlanner")}</Link>
          </section>
        </PageContainer>
      </div>
    );
  }
  return <PlannerForWeek key={week} week={week} />;
}
