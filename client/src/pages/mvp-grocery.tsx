import { useMemo } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Check, CircleAlert, RotateCcw, ShoppingBasket } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { useGroceryChecks, useRecipeCatalog, useWeekPlan } from "@/hooks/use-week-workspace";
import { buildGroceries, groceryCategories, type GroceryCategory } from "@/lib/grocery-engine";
import { parseCalendarDate, plannerURL, selectedWeek } from "@/lib/week-plan";
import { useMvpCopy } from "@/lib/mvp-copy";
import { useI18n } from "@/lib/i18n";
import type { Recipe } from "@/lib/storage";
import { usePilotPage } from "@/hooks/use-pilot-page";

const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45";

function localDate(value: string, locale: string, options: Intl.DateTimeFormatOptions) {
  const date = parseCalendarDate(value);
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : value;
}

const categoryKey: Record<GroceryCategory, string> = {
  "Produce": "grocery.produce",
  "Meat & Poultry": "grocery.meatPoultry",
  "Seafood": "grocery.seafood",
  "Dairy & Eggs": "grocery.dairyEggs",
  "Grains & Pasta": "grocery.grainsPasta",
  "Canned & Jarred": "grocery.cannedJarred",
  "Spices & Seasonings": "grocery.spicesSeasonings",
  "Other": "grocery.other",
};

function GroceryForWeek({ week }: { week: string }) {
  const { lang, dir, t } = useMvpCopy();
  const { t: appT } = useI18n();
  const planDoc = useWeekPlan(week);
  usePilotPage("grocery_list_opened", week, planDoc.plan.confirmed && !planDoc.issue);
  const checkDoc = useGroceryChecks(week);
  const catalog = useRecipeCatalog();
  const recipes = catalog.data ?? [];
  const grocery = useMemo(() => buildGroceries(planDoc.plan, recipes as Pick<Recipe, "id" | "title" | "ingredients">[]), [planDoc.plan, recipes]);
  const visibleIds = useMemo(() => new Set(grocery.items.map(item => item.id)), [grocery.items]);
  const checkedVisible = Array.from(checkDoc.checked).filter(id => visibleIds.has(id));
  const locale = lang === "he" ? "he-IL" : lang === "ru" ? "ru-RU" : "en";
  const interactionBlocked = catalog.isError || catalog.isFetching || catalog.isPending ||
    Boolean(checkDoc.issue) || Boolean(planDoc.issue) || !planDoc.plan.confirmed;
  const checkIssueKey = checkDoc.issue === "invalid" ? "storageInvalid"
    : checkDoc.issue === "unavailable" ? "storageUnavailable"
      : checkDoc.issue === "changed" ? "storageChanged"
        : checkDoc.issue === "save" ? "storageSave" : null;
  const planIssueKey = planDoc.issue === "invalid" ? "storageInvalid"
    : planDoc.issue === "unavailable" ? "storageUnavailable"
      : planDoc.issue === "changed" ? "storageChanged"
        : planDoc.issue === "save" ? "storageSave" : null;

  const clearChecks = () => {
    if (window.confirm(t("clearChecksConfirm"))) checkDoc.clear();
  };
  const resetChecks = () => {
    if (window.confirm(t("resetChecksConfirm"))) checkDoc.reset();
  };

  return (
    <div dir={dir} className="min-h-[100dvh] bg-background text-foreground" data-testid="mvp-grocery">
      <PageContainer size="lg" className="py-5 sm:py-9">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link href={plannerURL(week)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-[#637369] hover:bg-white hover:text-primary-hover" data-testid="mvp-back-plan">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              {t("backPlanner")}
            </Link>
            <time dateTime={week} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-[#607166]">
              {t("weekOf")} {localDate(week, locale, { month: "long", day: "numeric", year: "numeric" })}
            </time>
          </div>

          <header className="relative overflow-hidden rounded-[1.75rem] border border-border bg-accent px-5 py-7 sm:px-9 sm:py-9">
            <div className="pointer-events-none absolute -end-8 -top-16 h-56 w-56 rounded-full border border-border" />
            <div className="relative">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8d674b]"><ShoppingBasket className="h-4 w-4" aria-hidden="true" />{t("groceryEyebrow")}</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#273b30] sm:text-4xl">{t("groceryTitle")}</h1>
              {planDoc.plan.confirmed && catalog.data && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("groceryCount", { count: grocery.items.length, recipes: grocery.recipeTitles.length })}
                </p>
              )}
              {grocery.recipeTitles.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2" aria-label={t("selectedDinners")}>
                  {grocery.recipeTitles.map((title, index) => <span key={`${title}-${index}`} dir="auto" className="rounded-full border border-[#d1dccc] bg-[#f4f6ef] px-3 py-1.5 text-xs font-medium text-[#586e5b]">{title}</span>)}
                </div>
              )}
            </div>
          </header>

          {planIssueKey && (
            <section role="alert" className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#d8a58e] bg-[#fff7f1] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#754b3a]">{t(planIssueKey)}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={planDoc.reload} className={`${buttonBase} border border-[#d8c2b5] bg-white text-[#654d40]`}>{t("reload")}</button>
                <button type="button" onClick={() => { if (window.confirm(t("resetConfirm"))) planDoc.reset(); }} className={`${buttonBase} bg-[#754b3a] text-white`}>{t("reset")}</button>
              </div>
            </section>
          )}
          {checkIssueKey && (
            <section role="alert" className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#d8a58e] bg-[#fff7f1] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#754b3a]">{t(checkIssueKey)}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={checkDoc.reload} className={`${buttonBase} border border-[#d8c2b5] bg-white text-[#654d40]`}>{t("reload")}</button>
                <button type="button" onClick={resetChecks} className={`${buttonBase} bg-[#754b3a] text-white`}>{t("resetChecks")}</button>
              </div>
            </section>
          )}

          {!planDoc.plan.confirmed ? (
            <section className="mt-6 rounded-2xl border border-dashed border-border bg-background p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary"><CircleAlert className="h-5 w-5" aria-hidden="true" /></div>
              <h2 className="mt-4 text-xl font-semibold">{t("noConfirmedPlan")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("finishPlan")}</p>
              <Link href={plannerURL(week)} className={`${buttonBase} mt-5 bg-primary text-white hover:bg-primary-hover`}>{t("backPlanner")}</Link>
            </section>
          ) : (
            <>
              {catalog.isError && (
                <section role="alert" className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#d8a58e] bg-[#fff7f1] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm leading-5 text-[#754b3a]">
                    <p>{t("catalogError")}</p>
                    {recipes.length > 0 && <p className="mt-1 text-xs">{t("stale")}</p>}
                  </div>
                  <button type="button" onClick={() => void catalog.refetch()} className={`${buttonBase} border border-[#d8c2b5] bg-white text-[#654d40]`} data-testid="mvp-retry">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t("retry")}
                  </button>
                </section>
              )}
              {catalog.isFetching && !catalog.isError && (
                <section role="status" className="mt-5 rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                  {t("loading")}
                  {recipes.length > 0 && <p className="mt-1 text-xs">{t("stale")}</p>}
                </section>
              )}
              {catalog.isSuccess && !catalog.isFetching && grocery.missingRecipeIds.length > 0 && (
                <section role="alert" data-testid="mvp-missing-recipes" className="mt-5 flex items-start gap-3 rounded-2xl border border-[#ddc19a] bg-[#fff9ed] p-4 text-[#775d39]">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">{t("incomplete")}</p>
                    <p className="mt-1 text-sm leading-5">{t("missingRecipes", { count: grocery.missingRecipeIds.length })}</p>
                    {!catalog.isError && <button type="button" onClick={() => void catalog.refetch()} className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-4" data-testid="mvp-retry">{t("retry")}</button>}
                  </div>
                </section>
              )}

              {catalog.isPending && !catalog.data ? (
                <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label={t("loading")}>
                  {[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="h-16 animate-pulse rounded-xl bg-border" />)}
                </section>
              ) : catalog.isError && !catalog.data ? null : (
                <>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                      {t("checkedCount", { checked: checkedVisible.length, total: grocery.items.length })}
                    </p>
                    {checkedVisible.length > 0 && (
                      <button type="button" disabled={interactionBlocked} onClick={clearChecks} className="min-h-11 rounded-full px-2 text-xs font-semibold text-muted-foreground underline underline-offset-4 disabled:opacity-45">
                        {t("clearChecks")}
                      </button>
                    )}
                  </div>

                  {grocery.items.length === 0 ? (
                    <section className="mt-5 rounded-2xl border border-dashed border-border bg-background p-6 text-center text-sm text-[#69766d]">{t("emptyGroceries")}</section>
                  ) : (
                    <div className="mt-6 grid gap-6 md:grid-cols-2">
                      {groceryCategories.map(category => {
                        const items = grocery.items.filter(item => item.category === category);
                        if (items.length === 0) return null;
                        return (
                          <section key={category} aria-labelledby={`category-${category.replaceAll(/[^a-z0-9]/gi, "-")}`} className="min-w-0">
                            <div className="mb-2 flex items-end justify-between gap-2 px-1">
                              <h2 id={`category-${category.replaceAll(/[^a-z0-9]/gi, "-")}`} className="text-sm font-semibold text-[#495c4d]">{appT(categoryKey[category])}</h2>
                              <span className="text-xs text-[#889188]">{t("categoryCount", { count: items.length })}</span>
                            </div>
                            <ul className="space-y-2">
                              {items.map(item => {
                                const checked = checkDoc.checked.has(item.id);
                                const sourceTitles = Array.from(new Set(item.sources.map(source => source.recipeTitle)));
                                const itemIndex = grocery.items.indexOf(item);
                                return (
                                  <li key={item.id} data-testid="mvp-grocery-item">
                                    <label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-[#b7cbb3] bg-[#edf3e9]" : "border-border bg-background hover:border-[#becdbb]"}`}>
                                      <input type="checkbox" checked={checked} disabled={interactionBlocked}
                                        onChange={() => checkDoc.toggle(item.id)}
                                        aria-label={item.text}
                                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#54745a] disabled:cursor-not-allowed"
                                        data-testid={`mvp-check-${itemIndex}`} />
                                      <span className="min-w-0 flex-1">
                                        <span dir="auto" data-testid={`mvp-quantity-${itemIndex}`} className={`block break-words text-sm font-medium ${checked ? "text-[#79847b] line-through" : "text-foreground"}`}>{item.text}</span>
                                        {sourceTitles.length > 1 ? (
                                          <span className="mt-1 block text-xs leading-5 text-[#778279]">{t("fromRecipes", { recipes: sourceTitles.join(", ") })}</span>
                                        ) : null}
                                      </span>
                                      {checked && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#56735a]" aria-hidden="true" />}
                                    </label>
                                    {item.sources.length > 1 && (
                                      <details className="px-3 pb-2 text-xs leading-5 text-muted-foreground">
                                        <summary className="min-h-9 cursor-pointer break-words py-2">
                                          {t("fromRecipes", { recipes: sourceTitles.join(", ") })}
                                        </summary>
                                        <ul className="space-y-1">
                                          {item.sources.map(source => (
                                            <li key={`${source.recipeId}:${source.ingredientIndex}`} className="break-words">
                                              <bdi>{source.recipeTitle}</bdi>: <bdi>{source.text}</bdi>
                                            </li>
                                          ))}
                                        </ul>
                                      </details>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        );
                      })}
                    </div>
                  )}
                  {checkDoc.issue === "save" && <p role="alert" className="mt-4 text-sm text-[#8b5640]">{t("checkStorage")}</p>}
                </>
              )}
            </>
          )}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <Link href={plannerURL(week)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#627269] hover:text-primary-hover" data-testid="mvp-back-plan">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {t("backPlanner")}
            </Link>
            <Link href="/meals" className="min-h-11 px-2 py-3 text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4">{t("advancedInfo")}</Link>
          </footer>
        </div>
      </PageContainer>
    </div>
  );
}

export default function MvpGrocery() {
  const search = useSearch();
  const { dir, t } = useMvpCopy();
  const week = selectedWeek(search);
  if (!week) {
    return (
      <div dir={dir} className="min-h-[100dvh] bg-background text-foreground">
        <PageContainer size="md" className="py-12">
          <section role="alert" className="rounded-2xl border border-[#d8c6b7] bg-[#fffaf4] p-6">
            <h1 className="text-xl font-semibold">{t("invalidWeek")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("invalidWeekHint")}</p>
            <Link href="/meals" className={`${buttonBase} mt-5 bg-primary text-white`}>{t("backPlanner")}</Link>
          </section>
        </PageContainer>
      </div>
    );
  }
  return <GroceryForWeek key={week} week={week} />;
}
