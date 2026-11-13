import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Heart, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PageContainer } from "@/components/layout/page-container";
import { GeneratedRecipeBody } from "@/components/generate-recipe";
import { NewIdeaPanel, IdeaFilterChips, filterLabelKey } from "@/components/new-idea-panel";
import { AddToMealPlanDialog } from "@/components/add-to-meal-plan";
import { useToast } from "@/hooks/use-toast";
import { useI18n, type Language } from "@/lib/i18n";
import { createRecipe } from "@/lib/storage";
import { readPlan } from "@/lib/meal-plan";
import { budgetPreferences, noIdeaFilters, type BudgetPreference, type IdeaFilters } from "@/lib/recipe-generation";
import {
  clearActivity, clearIdeas, cookingMethods, filterIdeas, getBudget, isInPlan, listIdeas, personalizationEnabled, removeIdea,
  setBudget, setPersonalization, trackRecipeEvent, updateIdea, useIdeas, type Idea, type IdeaSort,
} from "@/lib/my-ideas";

const copy = {
  en: {
    title: "My Ideas", subtitle: "Your growing collection of AI-created recipes.", newIdea: "New idea",
    all: "All ideas", favorites: "Favorites", inPlan: "Added to plan",
    emptyTitle: "Your next favorite recipe starts here", emptyBody: "Create a recipe that fits your taste, time, and cooking style.", createFirst: "Create my first idea",
    noMatches: "No ideas match these filters.", clearFilters: "Clear filters", createNew: "Create new idea",
    search: "Search ideas or ingredients", filters: "Filters", sort: "Sort", newest: "Newest", oldest: "Oldest",
    addToPlan: "Add to week", remove: "Remove", favorite: "Favorite", unfavorite: "Remove from favorites",
    ai: "AI idea", prep: "Prep", total: "Total", min: "min",
    planned: "In weekly plan", saveFailed: "Couldn't save the recipe. Please try again.", removeConfirm: "Remove this idea from My Ideas?",
    tip: "Cooking tip",
    prefsTitle: "Cooking preferences", budget: "Budget", everyday: "Everyday", save_more: "Save more", flexible: "Flexible",
    budgetBody: "Applied to every new idea. Everyday favors reasonably priced ingredients; TableWise never claims exact costs.",
    privacyTitle: "Personalization", privacyToggle: "Use my ideas and favorites to vary future recipes",
    privacyBody: "Stored only in this browser. When on, generation sends just the titles of your last 8 ideas (to avoid repeats) and which cooking methods you favorite. Your filters, including dietary needs, are always applied as strict rules and never inferred.",
    clearActivity: "Delete activity history", clearAll: "Delete all ideas and activity",
    clearAllConfirm: "Delete all ideas and activity history? Recipes already saved to My Recipes stay.", cleared: "Deleted.",
  },
  ru: {
    title: "Мои идеи", subtitle: "Ваша растущая коллекция рецептов, созданных ИИ.", newIdea: "Новая идея",
    all: "Все идеи", favorites: "Избранное", inPlan: "В плане",
    emptyTitle: "Ваш следующий любимый рецепт начинается здесь", emptyBody: "Создайте рецепт под ваш вкус, время и стиль готовки.", createFirst: "Создать первую идею",
    noMatches: "Нет идей по этим фильтрам.", clearFilters: "Сбросить фильтры", createNew: "Создать новую идею",
    search: "Поиск по идеям и ингредиентам", filters: "Фильтры", sort: "Сортировка", newest: "Сначала новые", oldest: "Сначала старые",
    addToPlan: "В план недели", remove: "Удалить", favorite: "В избранное", unfavorite: "Убрать из избранного",
    ai: "Идея ИИ", prep: "Подготовка", total: "Всего", min: "мин",
    planned: "В плане недели", saveFailed: "Не удалось сохранить рецепт. Попробуйте ещё раз.", removeConfirm: "Удалить эту идею?",
    tip: "Совет",
    prefsTitle: "Предпочтения в готовке", budget: "Бюджет", everyday: "Обычный", save_more: "Экономный", flexible: "Гибкий",
    budgetBody: "Применяется ко всем новым идеям. «Обычный» — продукты по разумной цене; TableWise не называет точную стоимость.",
    privacyTitle: "Персонализация", privacyToggle: "Учитывать мои идеи и избранное для разнообразия рецептов",
    privacyBody: "Хранится только в этом браузере. Если включено, при создании отправляются лишь названия 8 последних идей (чтобы не повторяться) и любимые способы приготовления. Ваши фильтры, включая диетические, всегда строгие правила и никогда не угадываются.",
    clearActivity: "Удалить историю действий", clearAll: "Удалить все идеи и историю",
    clearAllConfirm: "Удалить все идеи и историю действий? Рецепты в «Мои рецепты» останутся.", cleared: "Удалено.",
  },
  he: {
    title: "הרעיונות שלי", subtitle: "האוסף ההולך וגדל שלכם של מתכונים שנוצרו ב-AI.", newIdea: "רעיון חדש",
    all: "כל הרעיונות", favorites: "מועדפים", inPlan: "בתפריט",
    emptyTitle: "המתכון האהוב הבא שלכם מתחיל כאן", emptyBody: "צרו מתכון שמתאים לטעם, לזמן ולסגנון הבישול שלכם.", createFirst: "צרו את הרעיון הראשון",
    noMatches: "אין רעיונות שתואמים למסננים.", clearFilters: "ניקוי מסננים", createNew: "יצירת רעיון חדש",
    search: "חיפוש רעיונות או מרכיבים", filters: "מסננים", sort: "מיון", newest: "החדשים ביותר", oldest: "הישנים ביותר",
    addToPlan: "הוספה לשבוע", remove: "הסרה", favorite: "מועדף", unfavorite: "הסרה מהמועדפים",
    ai: "רעיון AI", prep: "הכנה", total: "סה״כ", min: "דק׳",
    planned: "בתפריט השבועי", saveFailed: "לא ניתן לשמור את המתכון. נסו שוב.", removeConfirm: "להסיר את הרעיון?",
    tip: "טיפ",
    prefsTitle: "העדפות בישול", budget: "תקציב", everyday: "יומיומי", save_more: "חסכוני", flexible: "גמיש",
    budgetBody: "חל על כל רעיון חדש. יומיומי מעדיף מרכיבים במחיר סביר; TableWise לא מציגה עלויות מדויקות.",
    privacyTitle: "התאמה אישית", privacyToggle: "שימוש ברעיונות ובמועדפים שלי לגיוון מתכונים",
    privacyBody: "נשמר רק בדפדפן הזה. כשמופעל, נשלחים ביצירה רק שמות 8 הרעיונות האחרונים (כדי למנוע חזרות) ושיטות הבישול המועדפות. המסננים שלכם, כולל צרכים תזונתיים, תמיד חלים ככללים מחייבים ולעולם אינם מנוחשים.",
    clearActivity: "מחיקת היסטוריית פעילות", clearAll: "מחיקת כל הרעיונות והפעילות",
    clearAllConfirm: "למחוק את כל הרעיונות והיסטוריית הפעילות? מתכונים שנשמרו במתכונים שלי יישארו.", cleared: "נמחק.",
  },
} satisfies Record<Language, Record<string, string>>;

type View = "all" | "favorites" | "inPlan";
const outline = "btn btn-secondary";
const primary = "btn btn-primary";

export default function MyIdeas() {
  const { lang, dir, t: tr } = useI18n();
  const t = (key: keyof typeof copy.en) => copy[lang][key];
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const ideas = useIdeas();
  const [view, setView] = useState<View>("all");
  const [text, setText] = useState("");
  const [filters, setFilters] = useState<IdeaFilters>(noIdeaFilters);
  const [sort, setSort] = useState<IdeaSort>("newest");
  const [panelOpen, setPanelOpen] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  const plan = useMemo(() => readPlan(), [planVersion, ideas]);
  const [viewing, setViewing] = useState<Idea | null>(null);
  const [planning, setPlanning] = useState<{ ideaId: string; id: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [personalize, setPersonalize] = useState(personalizationEnabled);
  const [budget, setBudgetState] = useState<BudgetPreference>(getBudget);

  const inView = ideas.filter(i => view === "favorites" ? i.isFavorite : view === "inPlan" ? isInPlan(i, plan) : true);
  const shown = filterIdeas(inView, text, filters, sort);
  const filtering = text.trim() !== "" || JSON.stringify(filters) !== JSON.stringify(noIdeaFilters);
  const activeFilters = filters.dietary.length + filters.mealType.length + filters.cookingMethod.length + (filters.maxMinutes ? 1 : 0);
  const clearFilters = () => { setText(""); setFilters(noIdeaFilters); };
  const safely = (work: () => void) => { try { work(); } catch { toast({ title: t("saveFailed"), variant: "destructive" }); } };

  /** Saves the idea as a regular recipe once (the planner and grocery list need one), then reuses that recipe. */
  const ensureSaved = async (idea: Idea) => {
    if (idea.recipeId) return idea.recipeId;
    const saved = await createRecipe(idea.recipe);
    updateIdea(idea.id, { recipeId: saved.id });
    return saved.id;
  };
  const openPlan = async (idea: Idea) => {
    setBusy(idea.id);
    try { setPlanning({ ideaId: idea.id, id: await ensureSaved(idea), title: idea.recipe.title }); }
    catch { toast({ title: t("saveFailed"), variant: "destructive" }); }
    finally { setBusy(null); }
  };
  const toggleFavorite = (idea: Idea) => safely(() => {
    updateIdea(idea.id, { isFavorite: !idea.isFavorite });
    if (!idea.isFavorite) trackRecipeEvent("recipe_favorited", idea.id);
  });
  const remove = (idea: Idea) => {
    if (!window.confirm(t("removeConfirm"))) return;
    safely(() => { removeIdea(idea.id); trackRecipeEvent("recipe_deleted"); toast({ title: t("cleared") }); });
  };
  /** Saved ideas open the regular recipe page; unsaved ones show the same body in a dialog (no copy in My Recipes yet). */
  const open = (idea: Idea) => {
    trackRecipeEvent("recipe_viewed", idea.id);
    if (idea.recipeId) navigate(`/recipe/${idea.recipeId}`); else setViewing(idea);
  };
  const newIdea = <button type="button" className={primary} onClick={() => setPanelOpen(true)} data-testid="button-new-idea">
    <Sparkles className="h-4 w-4" aria-hidden="true" />{t("newIdea")}
  </button>;

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <PageContainer size="md" className="py-6 sm:py-10">
        <header className="page-header flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title" data-testid="text-page-title">{t("title")}</h1>
            <p className="page-subtitle">{t("subtitle")}</p>
          </div>
          {ideas.length > 0 && newIdea}
        </header>

        {ideas.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-background p-8 text-center" data-testid="my-ideas-empty">
            <h2 className="text-base font-semibold text-foreground">{t("emptyTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
            <button type="button" className={`${primary} mt-4`} onClick={() => setPanelOpen(true)} data-testid="button-create-first-idea">
              <Sparkles className="h-4 w-4" aria-hidden="true" />{t("createFirst")}
            </button>
          </div>
        ) : <>
          <div role="tablist" className="mt-6 flex flex-wrap gap-2">
            {(["all", "favorites", "inPlan"] as const).map(key => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} data-testid={`my-ideas-filter-${key}`}
                className="chip">{t(key)}</button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input type="search" value={text} onChange={e => setText(e.target.value)} placeholder={t("search")} aria-label={t("search")}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-input bg-card px-4 text-base" data-testid="input-idea-search" />
            <select value={sort} onChange={e => setSort(e.target.value as IdeaSort)} aria-label={t("sort")}
              className="min-h-11 rounded-full border border-input bg-card px-3 text-base text-foreground" data-testid="select-idea-sort">
              <option value="newest">{t("newest")}</option>
              <option value="oldest">{t("oldest")}</option>
            </select>
          </div>
          <details className="card mt-3 px-4 py-1" data-testid="my-ideas-filters">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">{t("filters")}{activeFilters > 0 && ` (${activeFilters})`}</summary>
            <div className="mt-3"><IdeaFilterChips value={filters} onChange={setFilters} testId="idea-filters" /></div>
          </details>

          {shown.length === 0 ? (
            filtering ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-background p-6 text-center" data-testid="my-ideas-no-matches">
                <p className="text-sm text-foreground">{t("noMatches")}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button type="button" className={outline} onClick={clearFilters} data-testid="button-clear-idea-filters">{t("clearFilters")}</button>
                  <button type="button" className={primary} onClick={() => setPanelOpen(true)}>{t("createNew")}</button>
                </div>
              </div>
            ) : <p className="mt-6 text-sm text-muted-foreground" data-testid="my-ideas-tab-empty">{t("noMatches")}</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map(idea => {
                const { recipe } = idea;
                const planned = isInPlan(idea, plan);
                const total = recipe.prepTime != null && recipe.cookTime != null ? recipe.prepTime + recipe.cookTime : null;
                return (
                  <li key={idea.id} className="card relative flex flex-col p-4 transition-colors hover:border-input" data-testid={`card-idea-${idea.id}`}>
                    <div className="flex items-start gap-3">
                      {recipe.image && <img src={recipe.image} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" loading="lazy" />}
                      <div className="min-w-0 flex-1">
                        {/* The title button stretches over the whole card; the other buttons sit above it. */}
                        <button type="button" onClick={() => open(idea)} data-testid="button-idea-view"
                          className="text-start text-base font-semibold leading-snug text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-primary">
                          <span className="break-words" data-testid="text-idea-title">{recipe.title}</span>
                        </button>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[recipe.prepTime != null && `${t("prep")} ${recipe.prepTime} ${t("min")}`, total != null && `${t("total")} ${total} ${t("min")}`,
                            cookingMethods(idea).map(m => filterLabelKey[m] ? tr(filterLabelKey[m]) : m).join(", ")].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1" data-testid="badge-idea-ai"><Sparkles className="h-3 w-3" aria-hidden="true" />{t("ai")}</span>
                          {planned && <span className="tag" data-testid="badge-idea-planned">{t("planned")}</span>}
                        </p>
                      </div>
                      <button type="button" onClick={() => toggleFavorite(idea)} aria-pressed={idea.isFavorite}
                        aria-label={idea.isFavorite ? t("unfavorite") : t("favorite")} data-testid="button-idea-favorite"
                        className="relative z-10 -m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-accent">
                        <Heart className={`h-5 w-5 ${idea.isFavorite ? "fill-[#b5534a] text-[#b5534a]" : "text-[#9aa49b]"}`} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="relative z-10 mt-3 flex flex-wrap gap-2 self-start">
                      <button type="button" onClick={() => openPlan(idea)} disabled={busy === idea.id} aria-busy={busy === idea.id} className={outline} data-testid="button-idea-add-to-plan">{t("addToPlan")}</button>
                      <button type="button" onClick={() => remove(idea)} className="btn btn-text" data-testid="button-idea-remove">{t("remove")}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>}

        <section className="mt-10 border-t hairline pt-6 text-sm" data-testid="my-ideas-preferences">
          <h2 className="text-lg font-semibold text-foreground">{t("prefsTitle")}</h2>
          <label className="mt-3 flex min-h-11 flex-wrap items-center gap-3">
            {t("budget")}
            <select value={budget} data-testid="select-budget" className="min-h-11 rounded-full border border-input bg-card px-3 text-base"
              onChange={e => safely(() => { const value = e.target.value as BudgetPreference; setBudget(value); setBudgetState(value); })}>
              {budgetPreferences.map(level => <option key={level} value={level}>{t(level)}</option>)}
            </select>
          </label>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("budgetBody")}</p>
        </section>

        <section className="mt-6 text-sm" data-testid="my-ideas-privacy">
          <h2 className="text-lg font-semibold text-foreground">{t("privacyTitle")}</h2>
          <label className="mt-3 flex min-h-11 items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={personalize} data-testid="toggle-personalization"
              onChange={e => safely(() => { setPersonalization(e.target.checked); setPersonalize(e.target.checked); })} />
            {t("privacyToggle")}
          </label>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("privacyBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={outline} data-testid="button-clear-activity" onClick={() => { clearActivity(); toast({ title: t("cleared") }); }}>{t("clearActivity")}</button>
            <button type="button" className={outline} data-testid="button-clear-ideas"
              onClick={() => { if (window.confirm(t("clearAllConfirm"))) safely(() => { clearIdeas(); clearActivity(); toast({ title: t("cleared") }); }); }}>{t("clearAll")}</button>
          </div>
        </section>
      </PageContainer>

      <NewIdeaPanel open={panelOpen} onOpenChange={setPanelOpen}
        onAddToWeek={id => { const idea = listIdeas().find(i => i.id === id); if (idea) void openPlan(idea); }} />

      <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}>
        <DialogContent dir={dir} className="max-h-[90dvh] overflow-y-auto rounded-2xl border-border bg-background sm:max-w-xl" data-testid="idea-dialog">
          {viewing && <>
            <DialogTitle className="pe-6 text-xl font-semibold text-foreground">{viewing.recipe.title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">{viewing.description}</DialogDescription>
            <GeneratedRecipeBody recipe={viewing.recipe} />
            {viewing.tip && <p className="mt-3 text-sm text-foreground"><span className="font-medium">{t("tip")}:</span> {viewing.tip}</p>}
            <button type="button" className={`${primary} mt-4`} onClick={() => { const idea = viewing; setViewing(null); void openPlan(idea); }}>{t("addToPlan")}</button>
          </>}
        </DialogContent>
      </Dialog>
      {planning && <AddToMealPlanDialog open onOpenChange={o => { if (!o) { setPlanning(null); setPlanVersion(v => v + 1); } }}
        recipe={planning} servings={null} plannerHref="/meals"
        onSaved={() => { trackRecipeEvent("recipe_added_to_plan", planning.ideaId); setPlanVersion(v => v + 1); }} />}
    </div>
  );
}
