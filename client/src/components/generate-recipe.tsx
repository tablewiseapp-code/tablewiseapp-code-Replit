import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RecipeIngredients } from "@/components/recipe-ingredients";
import { useI18n } from "@/lib/i18n";
import { mealFilterCopy } from "@/lib/meal-filter-copy";
import { generateCopy, type GenerateCopyKey } from "@/lib/generate-recipe-copy";
import { generationBody, reportGenerationEvent, requestGeneratedRecipe, type GeneratedRecipe, type NewRecipe } from "@/lib/recipe-generation";
import { personalizationSignals, saveIdea, trackRecipeEvent, updateIdea } from "@/lib/my-ideas";
import { Link } from "wouter";
import type { MealFilters } from "@/lib/meal-filters";
import type { RecipeTimeMode } from "@/lib/recipe-time";

type Props = ({
  filters: MealFilters;
  timeMode: RecipeTimeMode;
  request?: undefined;
} | {
  /** A prepared request from another filter set (the Meals page): body sent as-is, chips and not-applied labels shown. */
  request: { body: unknown; chips: string[]; notApplied: string[] };
  filters?: undefined; timeMode?: undefined;
}) & {
  variant: "button" | "empty";
  disabled?: boolean;
  /** Overrides the button label (variant "button"). */
  label?: string;
  /** Persists the accepted recipe through the existing recipe storage. Must throw on failure. Return the saved recipe to link it to its idea. */
  onAccept: (recipe: NewRecipe) => Promise<{ id: string } | void>;
};
type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  | { kind: "preview"; result: GeneratedRecipe; ideaId: string | null; saving: boolean; saveError: boolean };

const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#42624e] px-4 text-sm font-medium text-white transition-colors hover:bg-[#365041] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a]";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d9dfd4] bg-white px-4 text-sm font-medium text-[#45594c] transition-colors hover:bg-[#f4f7f1] disabled:cursor-not-allowed disabled:opacity-45";
const chip = "inline-flex max-w-full rounded-full border border-[#e2e6dd] bg-[#f1f4ed] px-2.5 py-1 text-xs text-[#68756a]";

export function GenerateRecipe({ filters, timeMode, request, variant, disabled, label, onAccept }: Props) {
  const { lang, dir } = useI18n();
  const t = (key: GenerateCopyKey) => generateCopy(lang, key);
  const f = (key: Parameters<typeof mealFilterCopy>[1], values?: Record<string, string | number>) => mealFilterCopy(lang, key, values);
  const [state, setState] = useState<State>({ kind: "idle" });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const generate = async () => {
    if (controller.current) return; // a request is already in flight
    const ctl = controller.current = new AbortController();
    setState({ kind: "loading" });
    try {
      const body = request ? request.body : generationBody(filters!, timeMode!);
      const result = await requestGeneratedRecipe({ ...(body as object), personalization: personalizationSignals() }, ctl.signal);
      // Every valid recipe is kept in My Ideas right away; a refused browser write must not lose the preview.
      let ideaId: string | null = null;
      try { ideaId = saveIdea(result, body).id; trackRecipeEvent("recipe_generated", ideaId); } catch { /* preview still shown */ }
      setState({ kind: "preview", result, ideaId, saving: false, saveError: false });
    } catch (error) {
      if (!ctl.signal.aborted) setState({ kind: "error", message: error instanceof Error ? error.message : "" });
    } finally {
      controller.current = null;
    }
  };
  const close = () => {
    if (state.kind === "preview") reportGenerationEvent("generated_recipe_rejected");
    controller.current?.abort(); controller.current = null; setState({ kind: "idle" });
  };
  const another = () => {
    reportGenerationEvent("generated_recipe_rejected");
    if (state.kind === "preview" && state.ideaId) trackRecipeEvent("recipe_regenerated", state.ideaId);
    void generate();
  };
  const accept = async () => {
    if (state.kind !== "preview" || state.saving) return;
    const { result, ideaId } = state;
    setState({ ...state, saving: true, saveError: false });
    let saved: { id: string } | void;
    try { saved = await onAccept(result.recipe); }
    catch { setState({ ...state, saving: false, saveError: true }); return; }
    reportGenerationEvent("generated_recipe_accepted");
    if (saved && ideaId) try { updateIdea(ideaId, { recipeId: saved.id }); } catch { /* the recipe itself is saved */ }
    setState({ kind: "idle" });
  };

  const chips: string[] = request ? [...request.chips] : [];
  if (filters && filters.maxMinutes !== null) chips.push(`${f(timeMode)} · ${f("minutes", { count: filters.maxMinutes })}`);
  if (filters) {
    filters.mustInclude.forEach(term => chips.push(`${f("mustInclude")}: ${term}`));
    filters.mustExclude.forEach(term => chips.push(`${f("mustExclude")}: ${term}`));
    filters.mealTypes.forEach(type => chips.push(f(type)));
    if (filters.lunchbox !== "any") chips.push(filters.lunchbox === "lunchbox" ? f("lunchbox") : f("schoolLunchbox"));
  }
  const notApplied = request?.notApplied ?? [];
  const chipList = chips.length > 0 && <ul className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label={f("filters")} data-testid="generate-recipe-chips">
    {chips.map(label => <li key={label} className={chip}>{label}</li>)}
  </ul>;
  const notAppliedNote = notApplied.length > 0 &&
    <p className="mt-2 text-xs text-[#798279]" data-testid="generate-recipe-not-applied">{t("notApplied")}: {notApplied.join(", ")}</p>;

  const trigger = variant === "empty" ? (
    <div role="status" data-testid="mvp-no-matches" className="rounded-2xl border border-dashed border-[#d5dcd1] bg-[#fbfbf7] p-5 text-center">
      <h3 className="text-base font-semibold text-[#34443a]">{t("emptyTitle")}</h3>
      <p className="mt-1 text-sm text-[#68756a]">{t("emptyBody")}</p>
      {chipList}
      {notAppliedNote}
      <button type="button" onClick={generate} disabled={disabled || state.kind === "loading"} className={`${primary} mt-4`} data-testid="generate-recipe-empty">
        {t("emptyAction")}
      </button>
    </div>
  ) : (
    <button type="button" onClick={generate} disabled={disabled || state.kind === "loading"} className={`${secondary} mt-3`} data-testid="generate-recipe">
      <Sparkles className="h-4 w-4 text-[#6b8a72]" aria-hidden="true" />{label ?? t("action")}
    </button>
  );

  const recipe = state.kind === "preview" ? state.result.recipe : null;
  return (
    <>
      {trigger}
      <Dialog open={state.kind !== "idle"} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent dir={dir} className="max-h-[90dvh] overflow-y-auto rounded-2xl border-[#d9dfd4] bg-[#fbfbf7] sm:max-w-xl" data-testid="generate-recipe-dialog">
          {state.kind === "loading" && <div role="status" className="flex items-center gap-3 py-6 text-sm text-[#45594c]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <DialogTitle className="text-sm font-medium">{t("generating")}</DialogTitle>
            <DialogDescription className="sr-only">{t("emptyBody")}</DialogDescription>
          </div>}
          {state.kind === "error" && <div role="alert" data-testid="generate-recipe-error">
            <DialogTitle className="text-base font-semibold text-[#34443a]">{t("failedTitle")}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#68756a]">{state.message}</DialogDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={primary} onClick={generate} data-testid="generate-recipe-retry">{t("retry")}</button>
              <button type="button" className={secondary} onClick={close}>{t("cancel")}</button>
            </div>
          </div>}
          {recipe && state.kind === "preview" && <div data-testid="generate-recipe-preview">
            <DialogTitle className="pe-6 text-xl font-semibold text-[#27342e]">{recipe.title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#68756a]">{state.result.description}</DialogDescription>
            <GeneratedRecipeBody recipe={recipe} />
            {state.ideaId && <p className="mt-2 text-xs text-[#68756a]" data-testid="generate-recipe-saved-idea">
              {t("savedToIdeas")} <Link href="/my-ideas" className="underline underline-offset-2">{t("openIdeas")}</Link>
            </p>}
            {state.saveError && <p role="alert" className="mt-3 text-xs text-[#815b49]">{t("saveFailed")}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={state.saving} onClick={accept} data-testid="generate-recipe-accept">
                {state.saving ? t("saving") : t("add")}
              </button>
              <button type="button" className={secondary} disabled={state.saving} onClick={another} data-testid="generate-recipe-another">{t("another")}</button>
              <button type="button" className={secondary} disabled={state.saving} onClick={close} data-testid="generate-recipe-cancel">{t("cancel")}</button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Times, ingredients, steps and the AI notice: shared by the generation preview and My Ideas. */
export function GeneratedRecipeBody({ recipe }: { recipe: Pick<NewRecipe, "servings" | "prepTime" | "cookTime" | "ingredients" | "steps"> }) {
  const { lang } = useI18n();
  const t = (key: GenerateCopyKey) => generateCopy(lang, key);
  return <>
    <p className="mt-3 text-xs text-[#798279]">
      {recipe.servings && `${t("servings")}: ${recipe.servings} · `}
      {recipe.prepTime != null && `${t("prep")}: ${recipe.prepTime} ${t("min")} · `}
      {recipe.cookTime != null && `${t("cook")}: ${recipe.cookTime} ${t("min")}`}
    </p>
    <h3 className="mb-2 mt-4 text-sm font-semibold text-[#34443a]">{t("ingredients")}</h3>
    <RecipeIngredients recipe={{ id: "generated", ingredients: recipe.ingredients }} />
    <h3 className="mb-2 mt-4 text-sm font-semibold text-[#34443a]">{t("steps")}</h3>
    <ol className="list-decimal space-y-2 ps-5 text-sm text-[#27342e]">
      {recipe.steps.map((step, index) => <li key={index} className="break-words">{step}</li>)}
    </ol>
    <p className="mt-4 rounded-lg bg-[#f2f3ec] p-3 text-xs leading-5 text-[#737c72]">{t("notice")}</p>
  </>;
}
