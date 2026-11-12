import { useEffect, useMemo, useState } from "react";
import { ChefHat, ChevronLeft, Clock3, MoreVertical, Minus, Plus, Users, Wrench } from "lucide-react";
import { useRoute, useLocation, useSearch, Link } from "wouter";
import { fetchRecipe, deleteRecipe, updateRecipe, type Recipe } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";
import { useMvpCopy } from "@/lib/mvp-copy";
import { useQueryClient } from "@tanstack/react-query";
import { recipePlannerURL } from "@/lib/week-plan";
import { isDevelopmentFixture } from "@shared/development-fixture-provenance";
import { recipeToolKeys } from "@/lib/recipe-tools";
import { baseServings, scaleIngredient, servingFactor, servingLimits } from "@/lib/ingredient-scale";
import { cleanStep, stepDuration } from "@/lib/recipe-steps";
import { ingredientRows, ingredientSections, ingredientViews, readIngredientView, saveIngredientView, type IngredientRow, type IngredientView } from "@/lib/ingredient-view";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";
import { RecipeCreditLine, RecipeCreditEditor } from "@/components/recipe-credit";
import { RecipeNutritionPanel } from "@/components/recipe-nutrition";
import { CookingMode } from "@/components/cooking-mode";
import { hasCookingProgress } from "@/lib/cooking-session";
import { AddToMealPlanDialog } from "@/components/add-to-meal-plan";
import { CookedBadge, MyCookingExperience } from "@/components/my-cooking-experience";
import { AnalysisWarnings, currentAnalysis, StepTiming } from "@/components/step-timing";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { householdServings, loadSettings } from "@/lib/basic-settings";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a]";
const pill = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ${focus}`;
const stripArrow = (text: string) => text.replace(/^[←→]\s*/, "");

// Only plain web links are shown as links; other schemes are never rendered as hrefs.
function sourceHost(url?: string | null) {
  try {
    const parsed = new URL(url ?? "");
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.replace(/^www\./, "") : null;
  } catch { return null; }
}

function IngredientChecklist({ recipe, scaled }: { recipe: Recipe; scaled: string[] }) {
  const { t } = useI18n();
  const { t: view } = useRecipeViewCopy();
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<IngredientView>(readIngredientView);
  const rows = useMemo(() => ingredientRows(recipe.ingredients, scaled), [recipe.ingredients, scaled]);
  const sections = useMemo(() => ingredientSections(rows, mode), [rows, mode]);
  const choose = (next: IngredientView) => { setMode(next); saveIngredientView(next); };

  const item = (row: IngredientRow) => (
    <li key={row.id}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" checked={checked.has(row.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#42624e]"
          data-testid={`ingredient-check-${rows.indexOf(row)}`}
          onChange={event => setChecked(prev => {
            const next = new Set(prev);
            if (event.target.checked) next.add(row.id); else next.delete(row.id);
            return next;
          })} />
        <span data-testid={`text-ingredient-${rows.indexOf(row)}`}
          className={`min-w-0 break-words text-sm ${checked.has(row.id) ? "text-muted-foreground line-through" : "text-foreground"}`}>{row.text}</span>
      </label>
    </li>
  );

  return (
    <div data-testid={`ingredients-checklist-${recipe.id}`}>
      <div role="group" aria-label={view("ingredientView")} className="mb-3 inline-flex rounded-full border border-[#d9dfd4] bg-white p-0.5" data-testid="ingredient-view-toggle">
        {ingredientViews.map(value => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => choose(value)} data-testid={`ingredient-view-${value}`}
            className={`min-h-11 rounded-full px-3 text-xs font-medium ${focus} ${mode === value ? "bg-[#42624e] text-white" : "text-[#52665a]"}`}>
            {view(value === "order" ? "viewOrder" : "viewCategory")}
          </button>
        ))}
      </div>
      <div className="space-y-3" data-testid={`ingredients-view-${mode}`}>
        {sections.map(section => section.category === null
          ? <ul key="all">{section.rows.map(item)}</ul>
          : <section key={section.category} data-testid={`ingredient-group-${section.category}`}>
              <h3 className="text-xs font-medium text-muted-foreground">{t(`ingredients.group.${section.category}`)}</h3>
              <ul>{section.rows.map(item)}</ul>
            </section>)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span>{view("checked", { done: checked.size, total: rows.length })}</span>
        {checked.size > 0 && <button type="button" onClick={() => setChecked(new Set())} className={`min-h-11 rounded px-2 underline underline-offset-2 ${focus}`}>{view("resetChecks")}</button>}
      </div>
    </div>
  );
}

export default function RecipeDetail() {
  const { t } = useI18n();
  const { t: view } = useRecipeViewCopy();
  const search = useSearch();
  const plannerHref = recipePlannerURL(search);
  const fromPlanner = new URLSearchParams(search).has("week");
  const { t: timingCopy } = useMvpCopy();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/recipe/:id");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedServings, setSelectedServings] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [savingTimes, setSavingTimes] = useState(false);
  const [timingStatus, setTimingStatus] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    setLoading(true); setError(null); setImageFailed(false);
    fetchRecipe(params.id)
      .then(value => {
        setRecipe(value);
        // Open at the household's servings (My Basic Settings) when the recipe can be scaled.
        const base = baseServings(value.servings);
        setSelectedServings(base === null ? null : householdServings(loadSettings()) ?? base);
        setPrepTime(value.prepTime == null ? "" : String(value.prepTime));
        setCookTime(value.cookTime == null ? "" : String(value.cookTime));
      })
      .catch(() => { setRecipe(null); setError(view("notFound")); })
      .finally(() => setLoading(false));
  }, [params?.id, reloadKey]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <p className="text-sm text-muted-foreground">{view("loading")}</p>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-sm text-muted-foreground" role="alert">{error || view("notFound")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => setReloadKey(key => key + 1)} className={`${pill} border border-[#d9dfd4] bg-white`}>{view("retry")}</button>
          <Link href={fromPlanner ? plannerHref : "/recipes"} data-testid={fromPlanner ? "link-back-to-planner" : "link-back-to-recipes"}
            className={`${pill} bg-[#42624e] text-white`}>{fromPlanner ? stripArrow(t("recipeDetail.backToPlanner")) : view("toRecipes")}</Link>
        </div>
      </div>
    );
  }

  const readOnly = Boolean(recipe.developmentReadOnly);
  const base = baseServings(recipe.servings);
  const factor = servingFactor(selectedServings ?? base ?? 1, base);
  const scaledIngredients = recipe.ingredients.map(text => scaleIngredient(text, factor));
  const analysis = currentAnalysis(recipe, recipe.stepAnalysis);
  const host = sourceHost(recipe.sourceUrl);
  const verified = (recipe.tags ?? []).some(tag => tag.toLowerCase() === "source-verified");
  const tags = (recipe.tags ?? []).filter(tag => tag.toLowerCase() !== "source-verified");
  const tools = recipeToolKeys(recipe.steps, recipe.equipment).map(tool => timingCopy(tool)).join(", ") || timingCopy("toolsUnknown");
  const canEditCredit = Boolean(recipe.creditEditable);
  const hasMenu = !readOnly || canEditCredit;

  const adjust = (delta: number) => setSelectedServings(value =>
    Math.min(servingLimits.max, Math.max(servingLimits.min, (value ?? base ?? 1) + delta)));

  const saveTimes = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingTimes || readOnly) return;
    setSavingTimes(true); setTimingStatus(null);
    try {
      const updated = await updateRecipe(recipe.id, {
        prepTime: prepTime.trim() === "" ? null : Number(prepTime),
        cookTime: cookTime.trim() === "" ? null : Number(cookTime),
      });
      setRecipe(updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      setTimingStatus("saved");
    } catch { setTimingStatus("error"); }
    finally { setSavingTimes(false); }
  };

  const confirmDelete = async () => {
    if (readOnly) return;
    try { await deleteRecipe(recipe.id); setLocation("/recipes"); }
    catch { setDeleteError(true); }
  };

  const meta = "inline-flex items-center gap-1.5";
  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="md" className="py-4 sm:py-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          {/* One back control: planner when we came from it, otherwise browser history, falling back to My Recipes. */}
          <Link href={fromPlanner ? plannerHref : "/recipes"} data-testid={fromPlanner ? "link-back-to-planner" : "link-back"}
            onClick={event => {
              if (fromPlanner || window.history.length <= 1) return;
              event.preventDefault();
              window.history.back();
            }}
            className={`-ms-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-[#42624e] hover:bg-[#f2f6ef] ${focus}`}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {stripArrow(fromPlanner ? t("recipeDetail.backToPlanner") : view("back"))}
          </Link>
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={view("more")} data-testid="button-recipe-menu"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-foreground/5 ${focus}`}>
                <MoreVertical className="h-5 w-5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!readOnly && <DropdownMenuItem className="min-h-11" onSelect={() => { setTimingStatus(null); setTimesOpen(true); }} data-testid="menu-edit-times">{view("editTimes")}</DropdownMenuItem>}
                {canEditCredit && <DropdownMenuItem className="min-h-11" onSelect={() => setCreditOpen(true)} data-testid="menu-edit-credit">{view("editCredit")}</DropdownMenuItem>}
                {!readOnly && <DropdownMenuItem className="min-h-11 text-red-600 focus:text-red-600" onSelect={() => { setDeleteError(false); setDeleteOpen(true); }} data-testid="menu-delete-recipe">{view("deleteRecipe")}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-lg border hairline bg-foreground/5">
          {recipe.image && !imageFailed ? (
            <img src={recipe.image} alt={recipe.title} className="image-fade-in h-full w-full object-cover" decoding="async"
              sizes="(max-width: 768px) 100vw, 768px" onLoad={e => e.currentTarget.classList.add("image-loaded")}
              onError={() => setImageFailed(true)} data-testid="img-recipe-hero" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground" data-testid="img-recipe-placeholder">
              <ChefHat className="h-8 w-8" aria-hidden="true" /><span className="text-xs">{view("noImage")}</span>
            </div>
          )}
        </div>

        <h1 className="text-xl font-medium text-foreground sm:text-2xl" data-testid="text-recipe-title">{recipe.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"><RecipeCreditLine recipe={recipe} /><CookedBadge recipeId={recipe.id} /></div>

        {(tags.length > 0 || verified) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {verified && <span className="rounded bg-[#42624e]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#42624e]" data-testid="badge-source-verified">{view("sourceVerified")}</span>}
            {tags.map(tag => <span key={tag} className="rounded bg-foreground/5 px-1.5 py-0.5 text-[11px] text-muted-foreground" data-testid={`tag-${tag}`}>{tag}</span>)}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {recipe.prepTime != null && <span className={meta} data-testid="text-prep-time"><Clock3 className="h-4 w-4" aria-hidden="true" />{view("prep")}: {recipe.prepTime} {view("minutes")}</span>}
          {recipe.cookTime != null && <span className={meta} data-testid="text-cook-time"><Clock3 className="h-4 w-4" aria-hidden="true" />{view("cook")}: {recipe.cookTime} {view("minutes")}</span>}
          {recipe.servings && base === null && <span className={meta} data-testid="text-servings"><Users className="h-4 w-4" aria-hidden="true" />{recipe.servings}</span>}
          <span className={meta} data-testid="text-tools"><Wrench className="h-4 w-4" aria-hidden="true" />{timingCopy("toolsUsed")}: {tools}</span>
        </div>
        {recipe.metadataEstimated && <p className="mt-2 text-xs text-muted-foreground" data-testid="text-development-estimates">{timingCopy("developmentEstimates")}</p>}

        <button type="button" onClick={() => setPlanOpen(true)} data-testid="button-add-to-plan"
          className={`${pill} mt-5 w-full bg-[#42624e] text-white hover:bg-[#385540]`}>{view("addToPlan")}</button>

        <section className="mt-6 rounded-lg border hairline bg-white p-4" aria-labelledby="ingredients-heading">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="ingredients-heading" className="text-base font-medium text-foreground" data-testid="text-ingredients-heading">{view("ingredients")}</h2>
            {base !== null && selectedServings !== null && (
              <div role="group" aria-label={view("servingsLabel")} className="inline-flex items-center rounded-full border border-[#d9dfd4]" data-testid="servings-control">
                <button type="button" onClick={() => adjust(-1)} disabled={selectedServings <= servingLimits.min} aria-label={view("decrease")}
                  data-testid="button-servings-decrease" className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
                <span className="min-w-20 text-center text-sm font-medium" aria-live="polite" data-testid="text-servings">{view("servings", { count: selectedServings })}</span>
                <button type="button" onClick={() => adjust(1)} disabled={selectedServings >= servingLimits.max} aria-label={view("increase")}
                  data-testid="button-servings-increase" className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${focus}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            )}
          </div>
          {base !== null && selectedServings !== null && selectedServings !== base &&
            <p className="mb-2 text-xs text-muted-foreground" data-testid="servings-note">{view("servingsNote", { base })}</p>}
          <IngredientChecklist key={recipe.id} recipe={recipe} scaled={scaledIngredients} />
        </section>

        <section className="mt-4 rounded-lg border hairline bg-white p-4" aria-labelledby="instructions-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="instructions-heading" className="text-base font-medium text-foreground" data-testid="text-steps-heading">{view("instructions")}</h2>
            {recipe.steps.length > 0 && <button type="button" onClick={() => setCooking(true)} data-testid="button-start-cooking"
              className={`${pill} bg-[#42624e] text-white hover:bg-[#385540]`}>{hasCookingProgress(recipe.id) ? view("resumeCooking") : view("startCooking")}</button>}
          </div>
          <ol className="space-y-4">
            {recipe.steps.map((step, i) => {
              const duration = stepDuration(step, analysis?.steps[i]);
              return (
                <li key={i} className="flex gap-3" data-testid={`text-step-${i}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#42624e]/10 text-xs font-medium text-[#42624e]" aria-hidden="true">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="break-words text-sm leading-relaxed text-foreground">{cleanStep(step)}</p>
                    <StepTiming duration={duration ?? undefined} />
                  </div>
                </li>
              );
            })}
          </ol>
          {analysis && <div className="mt-4"><AnalysisWarnings analysis={analysis} /></div>}
        </section>

        <MyCookingExperience key={recipe.id} recipeId={recipe.id} />

        <div className="mt-4"><RecipeNutritionPanel recipe={recipe} /></div>

        {isDevelopmentFixture(recipe) && (
          <p className="mt-4 rounded-lg border hairline bg-white p-3 text-xs text-muted-foreground" data-testid="synthetic-provenance">
            Synthetic test recipe, not an official or verified chef recipe. Chef references are
            not authorship or endorsement. Supplied links are unverified; collection pages do
            not verify this individual recipe. Missing times, servings and classifications are unknown.
          </p>
        )}
        {readOnly && <p className="mt-3 text-xs text-muted-foreground" role="note" data-testid="development-read-only">{timingCopy("developmentReadOnly")}</p>}

        {recipe.sourceUrl && (
          <footer className="mt-6 border-t hairline pt-4 text-sm text-muted-foreground" data-testid="recipe-source">
            {host ? (
              <>{view("sourceFrom", { host })}{" · "}
                <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid="link-source"
                  className={`inline-flex min-h-11 items-center font-medium text-[#42624e] underline underline-offset-2 ${focus}`}>
                  {isDevelopmentFixture(recipe) ? "Supplied link (unverified)" : view("sourceLink")}
                </a></>
            ) : <span data-testid="text-source-unlinked">{recipe.sourceUrl}</span>}
          </footer>
        )}
      </PageContainer>

      {cooking && <CookingMode key={recipe.id} recipeId={recipe.id} title={recipe.title} steps={recipe.steps} analysis={analysis}
        servings={selectedServings} scaledIngredients={scaledIngredients} onExit={() => setCooking(false)} onFinish={() => setCooking(false)} />}

      <AddToMealPlanDialog open={planOpen} onOpenChange={setPlanOpen} recipe={recipe} servings={selectedServings} plannerHref="/meals" />

      <Dialog open={timesOpen} onOpenChange={setTimesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{view("timesTitle")}</DialogTitle><DialogDescription>{timingCopy("timingHelp")}</DialogDescription></DialogHeader>
          <form className="space-y-3" onSubmit={saveTimes}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span>{timingCopy("preparation")} ({timingCopy("minutesLabel")})</span>
                <input type="number" min="0" max="10080" step="1" value={prepTime} disabled={savingTimes} data-testid="input-prep-time"
                  onChange={event => { setPrepTime(event.target.value); setTimingStatus(null); }} className="block min-h-11 w-full rounded-lg border bg-background px-3" /></label>
              <label className="space-y-1 text-sm"><span>{timingCopy("cooking")} ({timingCopy("minutesLabel")})</span>
                <input type="number" min="0" max="10080" step="1" value={cookTime} disabled={savingTimes} data-testid="input-cooking-time"
                  onChange={event => { setCookTime(event.target.value); setTimingStatus(null); }} className="block min-h-11 w-full rounded-lg border bg-background px-3" /></label>
            </div>
            <button type="submit" disabled={savingTimes} data-testid="button-save-times" className={`${pill} bg-[#42624e] text-white disabled:opacity-50`}>{timingCopy("saveTiming")}</button>
            {timingStatus && <p role={timingStatus === "error" ? "alert" : "status"} className="text-sm">{timingCopy(timingStatus === "error" ? "timingSaveFailed" : "timingSaved")}</p>}
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{view("creditTitle")}</DialogTitle><DialogDescription className="sr-only">{view("editCredit")}</DialogDescription></DialogHeader>
          <RecipeCreditEditor recipe={recipe} onSaved={setRecipe} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent data-testid="delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{view("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{view("deleteBody", { title: recipe.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p role="alert" className="text-sm text-red-600">{view("deleteFailed")}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{view("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11 bg-red-600 text-white hover:bg-red-700" data-testid="button-delete-recipe"
              onClick={event => { event.preventDefault(); void confirmDelete(); }}>{view("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
