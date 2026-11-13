import { useEffect, useRef, useState } from "react";
import { Check, Heart, Loader2, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { GeneratedRecipeBody } from "@/components/generate-recipe";
import { useI18n, type Language } from "@/lib/i18n";
import { plannerCookingMethods, plannerDietary, plannerMealTypes, plannerTimeOptions } from "@/lib/planner-filters";
import {
  generationStyles, ideaGenerationBody, noIdeaFilters, requestGeneratedRecipe,
  type GeneratedRecipe, type GenerationStyle, type IdeaFilters,
} from "@/lib/recipe-generation";
import { getBudget, personalizationSignals, saveIdea, trackRecipeEvent, updateIdea } from "@/lib/my-ideas";

const copy = {
  en: {
    title: "New idea", body: "Pick a few filters and a style. TableWise creates one recipe and keeps it in My Ideas.",
    prepTime: "Preparation time", styleTitle: "Make it your way", styleBody: "What kind of recipe should TableWise create?",
    surprise_me: "Surprise me", surprise_me_sub: "Something fresh and different",
    quick_easy: "Quick & easy", quick_easy_sub: "Less effort, fewer steps",
    chefs_touch: "Chef's touch", chefs_touch_sub: "A little more special",
    family_favorite: "Family favorite", family_favorite_sub: "Comforting and crowd-pleasing",
    try_something_new: "Try something new", try_something_new_sub: "Explore new flavors",
    create: "Create my recipe", generating: "Creating something delicious...",
    failed: "We couldn't create your recipe. Please try again.", retry: "Retry", back: "Change filters",
    another: "Try another", addToWeek: "Add to week", favorite: "Favorite", favorited: "Favorited", close: "Close",
    tip: "Cooking tip", saved: "Saved to My Ideas.",
  },
  ru: {
    title: "Новая идея", body: "Выберите фильтры и стиль. TableWise создаст рецепт и сохранит его в «Мои идеи».",
    prepTime: "Время подготовки", styleTitle: "Как вам нравится", styleBody: "Какой рецепт создать TableWise?",
    surprise_me: "Удиви меня", surprise_me_sub: "Что-то свежее и необычное",
    quick_easy: "Быстро и просто", quick_easy_sub: "Меньше усилий и шагов",
    chefs_touch: "От шефа", chefs_touch_sub: "Чуть более особенное",
    family_favorite: "Семейное любимое", family_favorite_sub: "Уютно и нравится всем",
    try_something_new: "Попробовать новое", try_something_new_sub: "Новые вкусы",
    create: "Создать рецепт", generating: "Готовим что-то вкусное...",
    failed: "Не удалось создать рецепт. Попробуйте ещё раз.", retry: "Повторить", back: "Изменить фильтры",
    another: "Другой вариант", addToWeek: "В план недели", favorite: "В избранное", favorited: "В избранном", close: "Закрыть",
    tip: "Совет", saved: "Сохранено в «Мои идеи».",
  },
  he: {
    title: "רעיון חדש", body: "בחרו כמה מסננים וסגנון. TableWise תיצור מתכון אחד ותשמור אותו ברעיונות שלי.",
    prepTime: "זמן הכנה", styleTitle: "בדרך שלכם", styleBody: "איזה מתכון TableWise תיצור?",
    surprise_me: "הפתיעו אותי", surprise_me_sub: "משהו רענן ושונה",
    quick_easy: "מהיר וקל", quick_easy_sub: "פחות מאמץ, פחות שלבים",
    chefs_touch: "נגיעת שף", chefs_touch_sub: "קצת יותר מיוחד",
    family_favorite: "אהוב המשפחה", family_favorite_sub: "מנחם ואהוב על כולם",
    try_something_new: "לנסות משהו חדש", try_something_new_sub: "טעמים חדשים",
    create: "צרו את המתכון שלי", generating: "מכינים משהו טעים...",
    failed: "לא הצלחנו ליצור את המתכון. נסו שוב.", retry: "נסו שוב", back: "שינוי מסננים",
    another: "נסו אחר", addToWeek: "הוספה לשבוע", favorite: "מועדף", favorited: "במועדפים", close: "סגירה",
    tip: "טיפ", saved: "נשמר ברעיונות שלי.",
  },
} satisfies Record<Language, Record<string, string>>;
type Key = keyof typeof copy.en;

/** i18n keys of the Meals page filter values, so both pages show the same labels. */
export const filterLabelKey: Record<string, string> = {
  "Vegetarian": "meals.vegetarian", "Kid friendly": "meals.kidFriendly", "Gluten-free": "meals.glutenFree",
  "Breakfast": "meals.breakfast", "Lunch": "meals.lunch", "Dinner": "meals.dinner", "Lunch box": "meals.lunchBox",
  "Oven": "meals.oven", "Air fryer": "meals.airFryer", "Stovetop": "meals.stovetop", "Microwave": "meals.microwave", "No-cook": "meals.noCook",
};
const chipClass = (on: boolean) =>
  `px-3 py-2 min-h-11 text-xs rounded-full border hairline ${on ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`;

/** The Meals page filter values (prep time, method, dietary, meal type), shared by generation and My Ideas search. */
export function IdeaFilterChips({ value, onChange, testId }: { value: IdeaFilters; onChange: (next: IdeaFilters) => void; testId: string }) {
  const { lang, t } = useI18n();
  const toggle = (key: "dietary" | "mealType" | "cookingMethod", item: string) =>
    onChange({ ...value, [key]: value[key].includes(item) ? value[key].filter(v => v !== item) : [...value[key], item] });
  const group = (label: string, children: React.ReactNode) =>
    <div role="group" aria-label={label}><p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{label}</p><div className="flex flex-wrap gap-2">{children}</div></div>;
  const multi = (key: "dietary" | "mealType" | "cookingMethod", items: readonly string[]) => items.map(item =>
    <button key={item} type="button" aria-pressed={value[key].includes(item)} className={chipClass(value[key].includes(item))}
      onClick={() => toggle(key, item)} data-testid={`${testId}-${key}-${item.toLowerCase().replace(" ", "-")}`}>{t(filterLabelKey[item])}</button>);
  return (
    <div className="space-y-4" data-testid={testId}>
      {group(copy[lang].prepTime, [null, ...plannerTimeOptions].map(mins =>
        <button key={mins ?? "any"} type="button" aria-pressed={value.maxMinutes === mins} className={chipClass(value.maxMinutes === mins)}
          onClick={() => onChange({ ...value, maxMinutes: mins })} data-testid={`${testId}-time-${mins ?? "any"}`}>{mins ? `≤ ${mins}` : t("meals.any")}</button>))}
      {group(t("meals.cookingMethod"), multi("cookingMethod", plannerCookingMethods))}
      {group(t("meals.dietary"), multi("dietary", plannerDietary))}
      {group(t("meals.mealType"), multi("mealType", plannerMealTypes))}
    </div>
  );
}

type Phase = { kind: "form" } | { kind: "loading" } | { kind: "error"; detail: string }
  | { kind: "preview"; result: GeneratedRecipe; ideaId: string | null; favorite: boolean };
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-45";

export function NewIdeaPanel({ open, onOpenChange, onAddToWeek }: {
  open: boolean; onOpenChange: (open: boolean) => void; onAddToWeek: (ideaId: string) => void;
}) {
  const { lang, dir } = useI18n();
  const t = (key: Key) => copy[lang][key];
  // Filters and style survive closing the panel and failed requests.
  const [filters, setFilters] = useState<IdeaFilters>(noIdeaFilters);
  const [style, setStyle] = useState<GenerationStyle>("surprise_me");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  const generate = async () => {
    if (inFlight.current) return; // no duplicate requests
    const ctl = inFlight.current = new AbortController();
    if (phase.kind === "preview" && phase.ideaId) trackRecipeEvent("recipe_regenerated", phase.ideaId);
    setPhase({ kind: "loading" });
    try {
      const body = ideaGenerationBody(filters, style, getBudget());
      const result = await requestGeneratedRecipe({ ...body, personalization: personalizationSignals() }, ctl.signal);
      // Saved to My Ideas as soon as it validates; a refused browser write still shows the preview.
      let ideaId: string | null = null;
      try { ideaId = saveIdea(result, body).id; trackRecipeEvent("recipe_generated", ideaId, { style }); } catch { /* preview only */ }
      setPhase({ kind: "preview", result, ideaId, favorite: false });
    } catch (error) {
      if (!ctl.signal.aborted) setPhase({ kind: "error", detail: error instanceof Error ? error.message : "" });
    } finally {
      if (inFlight.current === ctl) inFlight.current = null;
    }
  };
  const close = () => {
    inFlight.current?.abort(); inFlight.current = null;
    setPhase({ kind: "form" }); onOpenChange(false);
  };
  const toggleFavorite = () => {
    if (phase.kind !== "preview" || !phase.ideaId) return;
    try {
      updateIdea(phase.ideaId, { isFavorite: !phase.favorite });
      if (!phase.favorite) trackRecipeEvent("recipe_favorited", phase.ideaId);
      setPhase({ ...phase, favorite: !phase.favorite });
    } catch { /* storage refused; state unchanged */ }
  };

  return (
    <Sheet open={open} onOpenChange={next => { if (!next) close(); }}>
      <SheetContent side={dir === "rtl" ? "left" : "right"} dir={dir} className="bg-background sm:max-w-lg" data-testid="new-idea-panel">
        {phase.kind === "form" && <>
          <SheetTitle className="pr-8 text-lg font-semibold text-foreground">{t("title")}</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">{t("body")}</SheetDescription>
          <div className="mt-6"><IdeaFilterChips value={filters} onChange={setFilters} testId="new-idea-filters" /></div>
          <h3 className="mt-8 text-sm font-semibold text-foreground">{t("styleTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("styleBody")}</p>
          <div role="radiogroup" aria-label={t("styleTitle")} className="mt-3 grid gap-2">
            {generationStyles.map(key => {
              const on = style === key;
              return (
                <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setStyle(key)} data-testid={`style-${key}`}
                  className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-start transition-colors ${on ? "border-primary" : "border-border hover:border-border"}`}>
                  <span>
                    <span className="block text-sm font-medium text-foreground">{t(key)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`${key}_sub` as Key)}</span>
                  </span>
                  {on && <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <button type="button" className={`${primary} mt-6 w-full`} onClick={generate} data-testid="button-create-recipe">
            <Sparkles className="h-4 w-4" aria-hidden="true" />{t("create")}
          </button>
        </>}

        {phase.kind === "loading" && <div role="status" className="flex items-center gap-3 py-10 text-sm text-foreground" data-testid="new-idea-loading">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <SheetTitle className="text-sm font-medium">{t("generating")}</SheetTitle>
          <SheetDescription className="sr-only">{t("body")}</SheetDescription>
        </div>}

        {phase.kind === "error" && <div role="alert" className="py-6" data-testid="new-idea-error">
          <SheetTitle className="text-base font-semibold text-foreground">{t("failed")}</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">{phase.detail}</SheetDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={generate} data-testid="button-new-idea-retry">{t("retry")}</button>
            <button type="button" className={secondary} onClick={() => setPhase({ kind: "form" })}>{t("back")}</button>
          </div>
        </div>}

        {phase.kind === "preview" && <div data-testid="new-idea-preview">
          <SheetTitle className="pr-8 text-xl font-semibold text-foreground">{phase.result.recipe.title}</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">{phase.result.description}</SheetDescription>
          <GeneratedRecipeBody recipe={phase.result.recipe} />
          {phase.result.tip && <p className="mt-3 text-sm text-foreground" data-testid="new-idea-tip"><span className="font-medium">{t("tip")}:</span> {phase.result.tip}</p>}
          {phase.ideaId && <p className="mt-2 text-xs text-muted-foreground">{t("saved")}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={!phase.ideaId} onClick={() => { const id = phase.ideaId!; close(); onAddToWeek(id); }} data-testid="button-new-idea-add-to-week">{t("addToWeek")}</button>
            <button type="button" className={secondary} onClick={generate} data-testid="button-new-idea-another">{t("another")}</button>
            <button type="button" className={secondary} disabled={!phase.ideaId} aria-pressed={phase.favorite} onClick={toggleFavorite} data-testid="button-new-idea-favorite">
              <Heart className={`h-4 w-4 ${phase.favorite ? "fill-[#b5534a] text-[#b5534a]" : ""}`} aria-hidden="true" />{phase.favorite ? t("favorited") : t("favorite")}
            </button>
            <button type="button" className={secondary} onClick={close} data-testid="button-new-idea-close">{t("close")}</button>
          </div>
        </div>}
      </SheetContent>
    </Sheet>
  );
}
