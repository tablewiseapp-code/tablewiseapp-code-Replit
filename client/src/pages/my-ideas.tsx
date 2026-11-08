import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Sparkles, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PageContainer } from "@/components/layout/page-container";
import { GenerateRecipe, GeneratedRecipeBody } from "@/components/generate-recipe";
import { AddToMealPlanDialog } from "@/components/add-to-meal-plan";
import { useToast } from "@/hooks/use-toast";
import { useI18n, type Language } from "@/lib/i18n";
import { createRecipe } from "@/lib/storage";
import { readPlan } from "@/lib/meal-plan";
import type { NewRecipe } from "@/lib/recipe-generation";
import {
  clearActivity, clearIdeas, cookingMethods, isInPlan, personalizationEnabled, removeIdea, setPersonalization,
  trackRecipeEvent, updateIdea, useIdeas, type Idea,
} from "@/lib/my-ideas";

const copy = {
  en: {
    title: "My Ideas", subtitle: "Recipes generated for you by AI. They stay here until you remove them.",
    all: "All ideas", favorites: "Favorites", inPlan: "Added to plan", generate: "Generate another recipe",
    emptyTitle: "No ideas yet", emptyBody: "Recipes you generate with AI appear here automatically.", generateFirst: "Generate your first recipe",
    noneInFilter: "Nothing here yet.", view: "View recipe", addToPlan: "Add to weekly plan", remove: "Remove",
    favorite: "Favorite", unfavorite: "Remove from favorites", generated: "Generated", prep: "Prep", min: "min",
    planned: "In weekly plan", saveFailed: "Couldn't save the recipe. Please try again.", removeConfirm: "Remove this idea from My Ideas?",
    privacyTitle: "Personalization", privacyToggle: "Use my ideas and favorites to vary future recipes",
    privacyBody: "Stored only in this browser. When on, generation sends just the titles of your last 8 ideas (to avoid repeats) and which cooking methods you favorite. Your filters, including dietary needs, are always applied as strict rules and never inferred.",
    clearActivity: "Delete activity history", clearAll: "Delete all ideas and activity",
    clearAllConfirm: "Delete all ideas and activity history? Recipes already saved to My Recipes stay.", cleared: "Deleted.",
  },
  ru: {
    title: "Мои идеи", subtitle: "Рецепты, созданные для вас ИИ. Они хранятся здесь, пока вы их не удалите.",
    all: "Все идеи", favorites: "Избранное", inPlan: "В плане", generate: "Создать ещё рецепт",
    emptyTitle: "Пока нет идей", emptyBody: "Рецепты, созданные ИИ, появляются здесь автоматически.", generateFirst: "Создать первый рецепт",
    noneInFilter: "Здесь пока пусто.", view: "Открыть рецепт", addToPlan: "Добавить в план недели", remove: "Удалить",
    favorite: "В избранное", unfavorite: "Убрать из избранного", generated: "Создан", prep: "Подготовка", min: "мин",
    planned: "В плане недели", saveFailed: "Не удалось сохранить рецепт. Попробуйте ещё раз.", removeConfirm: "Удалить эту идею?",
    privacyTitle: "Персонализация", privacyToggle: "Учитывать мои идеи и избранное для разнообразия рецептов",
    privacyBody: "Хранится только в этом браузере. Если включено, при создании отправляются лишь названия 8 последних идей (чтобы не повторяться) и любимые способы приготовления. Ваши фильтры, включая диетические, всегда строгие правила и никогда не угадываются.",
    clearActivity: "Удалить историю действий", clearAll: "Удалить все идеи и историю",
    clearAllConfirm: "Удалить все идеи и историю действий? Рецепты в «Мои рецепты» останутся.", cleared: "Удалено.",
  },
  he: {
    title: "הרעיונות שלי", subtitle: "מתכונים שנוצרו עבורכם על ידי AI. הם נשמרים כאן עד שתסירו אותם.",
    all: "כל הרעיונות", favorites: "מועדפים", inPlan: "בתפריט", generate: "יצירת מתכון נוסף",
    emptyTitle: "עדיין אין רעיונות", emptyBody: "מתכונים שתיצרו עם AI יופיעו כאן אוטומטית.", generateFirst: "צרו את המתכון הראשון",
    noneInFilter: "אין כאן עדיין כלום.", view: "צפייה במתכון", addToPlan: "הוספה לתפריט השבועי", remove: "הסרה",
    favorite: "מועדף", unfavorite: "הסרה מהמועדפים", generated: "נוצר", prep: "הכנה", min: "דק׳",
    planned: "בתפריט השבועי", saveFailed: "לא ניתן לשמור את המתכון. נסו שוב.", removeConfirm: "להסיר את הרעיון?",
    privacyTitle: "התאמה אישית", privacyToggle: "שימוש ברעיונות ובמועדפים שלי לגיוון מתכונים",
    privacyBody: "נשמר רק בדפדפן הזה. כשמופעל, נשלחים ביצירה רק שמות 8 הרעיונות האחרונים (כדי למנוע חזרות) ושיטות הבישול המועדפות. המסננים שלכם, כולל צרכים תזונתיים, תמיד חלים ככללים מחייבים ולעולם אינם מנוחשים.",
    clearActivity: "מחיקת היסטוריית פעילות", clearAll: "מחיקת כל הרעיונות והפעילות",
    clearAllConfirm: "למחוק את כל הרעיונות והיסטוריית הפעילות? מתכונים שנשמרו במתכונים שלי יישארו.", cleared: "נמחק.",
  },
} satisfies Record<Language, Record<string, string>>;

// No filters: "Generate another" here asks for any recipe; filtered generation lives on Weekly Meals.
const anyRecipe = { body: { filterSet: "meals", timeMode: "total", filters: {
  maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], proteinType: [], servings: null, mustInclude: [], mustExclude: [],
} }, chips: [], notApplied: [] };
const methodKey: Record<string, string> = { "Oven": "meals.oven", "Air fryer": "meals.airFryer", "Stovetop": "meals.stovetop", "No-cook": "meals.noCook" };
type View = "all" | "favorites" | "inPlan";
const pill = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a] disabled:opacity-45";
const outline = `${pill} border border-[#d9dfd4] bg-white text-[#45594c] hover:bg-[#f4f7f1]`;

export default function MyIdeas() {
  const { lang, dir, t: tr } = useI18n();
  const t = (key: keyof typeof copy.en) => copy[lang][key];
  const { toast } = useToast();
  const ideas = useIdeas();
  const [view, setView] = useState<View>("all");
  const [planVersion, setPlanVersion] = useState(0);
  const plan = useMemo(() => readPlan(), [planVersion, ideas]);
  const [viewing, setViewing] = useState<Idea | null>(null);
  const [planning, setPlanning] = useState<{ ideaId: string; id: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [personalize, setPersonalize] = useState(personalizationEnabled);

  const shown = ideas.filter(i => view === "favorites" ? i.isFavorite : view === "inPlan" ? isInPlan(i, plan) : true);
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
  const acceptGenerated = async (recipe: NewRecipe) => {
    const saved = await createRecipe(recipe);
    toast({ title: saved.title });
    return saved;
  };
  const toggleFavorite = (idea: Idea) => safely(() => {
    updateIdea(idea.id, { isFavorite: !idea.isFavorite });
    if (!idea.isFavorite) trackRecipeEvent("recipe_favorited", idea.id);
  });
  const remove = (idea: Idea) => {
    if (!window.confirm(t("removeConfirm"))) return;
    safely(() => { removeIdea(idea.id); trackRecipeEvent("recipe_deleted"); });
  };
  const view_ = (idea: Idea) => { trackRecipeEvent("recipe_viewed", idea.id); if (!idea.recipeId) setViewing(idea); };

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <PageContainer size="md" className="py-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-medium text-foreground sm:text-2xl" data-testid="text-page-title">
              <Sparkles className="h-5 w-5 text-[#6b8a72]" aria-hidden="true" />{t("title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {ideas.length > 0 && <GenerateRecipe request={anyRecipe} variant="button" label={t("generate")} onAccept={acceptGenerated} />}
        </div>

        {ideas.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#d5dcd1] bg-[#fbfbf7] p-8 text-center" data-testid="my-ideas-empty">
            <h2 className="text-base font-semibold text-[#34443a]">{t("emptyTitle")}</h2>
            <p className="mt-1 text-sm text-[#68756a]">{t("emptyBody")}</p>
            <GenerateRecipe request={anyRecipe} variant="button" label={t("generateFirst")} onAccept={acceptGenerated} />
          </div>
        ) : <>
          <div role="tablist" className="mt-6 flex flex-wrap gap-2">
            {(["all", "favorites", "inPlan"] as const).map(key => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} data-testid={`my-ideas-filter-${key}`}
                className={`${pill} ${view === key ? "bg-[#42624e] text-white" : "border border-[#d9dfd4] bg-white text-[#45594c]"}`}>{t(key)}</button>
            ))}
          </div>
          {shown.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">{t("noneInFilter")}</p> : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map(idea => {
                const { recipe } = idea;
                const planned = isInPlan(idea, plan);
                return (
                  <li key={idea.id} className="flex flex-col rounded-xl border hairline p-4" data-testid={`card-idea-${idea.id}`}>
                    <div className="flex items-start gap-3">
                      {recipe.image && <img src={recipe.image} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" loading="lazy" />}
                      <div className="min-w-0 flex-1">
                        <h2 className="break-words text-sm font-medium text-foreground" data-testid="text-idea-title">{recipe.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {recipe.prepTime != null && `${t("prep")}: ${recipe.prepTime} ${t("min")} · `}
                          {cookingMethods(idea).map(m => tr(methodKey[m]) || m).join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("generated")} {new Date(idea.createdAt).toLocaleDateString(lang)}
                          {planned && <span className="ms-2 rounded-full bg-[#eef3ea] px-2 py-0.5 text-[#42624e]" data-testid="badge-idea-planned">{t("planned")}</span>}
                        </p>
                      </div>
                      <button type="button" onClick={() => toggleFavorite(idea)} aria-pressed={idea.isFavorite}
                        aria-label={idea.isFavorite ? t("unfavorite") : t("favorite")} data-testid="button-idea-favorite"
                        className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-[#f4f7f1]">
                        <Star className={`h-5 w-5 ${idea.isFavorite ? "fill-[#c8a24a] text-[#c8a24a]" : "text-[#9aa49b]"}`} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {idea.recipeId
                        ? <Link href={`/recipe/${idea.recipeId}`} onClick={() => view_(idea)} className={outline} data-testid="button-idea-view">{t("view")}</Link>
                        : <button type="button" onClick={() => view_(idea)} className={outline} data-testid="button-idea-view">{t("view")}</button>}
                      <button type="button" onClick={() => openPlan(idea)} disabled={busy === idea.id} className={`${pill} bg-[#42624e] text-white hover:bg-[#365041]`} data-testid="button-idea-add-to-plan">{t("addToPlan")}</button>
                      <button type="button" onClick={() => remove(idea)} className={outline} data-testid="button-idea-remove">{t("remove")}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>}

        <section className="mt-10 border-t hairline pt-6 text-sm" data-testid="my-ideas-privacy">
          <h2 className="font-medium text-foreground">{t("privacyTitle")}</h2>
          <label className="mt-3 flex min-h-11 items-center gap-3">
            <input type="checkbox" className="h-4 w-4" checked={personalize} data-testid="toggle-personalization"
              onChange={e => safely(() => { setPersonalization(e.target.checked); setPersonalize(e.target.checked); })} />
            {t("privacyToggle")}
          </label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("privacyBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={outline} data-testid="button-clear-activity" onClick={() => { clearActivity(); toast({ title: t("cleared") }); }}>{t("clearActivity")}</button>
            <button type="button" className={outline} data-testid="button-clear-ideas"
              onClick={() => { if (window.confirm(t("clearAllConfirm"))) safely(() => { clearIdeas(); clearActivity(); toast({ title: t("cleared") }); }); }}>{t("clearAll")}</button>
          </div>
        </section>
      </PageContainer>

      <Dialog open={!!viewing} onOpenChange={open => { if (!open) setViewing(null); }}>
        <DialogContent dir={dir} className="max-h-[90dvh] overflow-y-auto rounded-2xl border-[#d9dfd4] bg-[#fbfbf7] sm:max-w-xl" data-testid="idea-dialog">
          {viewing && <>
            <DialogTitle className="pe-6 text-xl font-semibold text-[#27342e]">{viewing.recipe.title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#68756a]">{viewing.description}</DialogDescription>
            <GeneratedRecipeBody recipe={viewing.recipe} />
          </>}
        </DialogContent>
      </Dialog>
      {planning && <AddToMealPlanDialog open onOpenChange={open => { if (!open) { setPlanning(null); setPlanVersion(v => v + 1); } }}
        recipe={planning} servings={null} plannerHref="/meals"
        onSaved={() => { trackRecipeEvent("recipe_added_to_plan", planning.ideaId); setPlanVersion(v => v + 1); }} />}
    </div>
  );
}
