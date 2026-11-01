import { useEffect, useState } from "react";
import { useRoute, useLocation, useSearch, Link } from "wouter";
import { fetchRecipe, deleteRecipe, updateRecipe, type Recipe } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";
import { useMvpCopy } from "@/lib/mvp-copy";
import { useQueryClient } from "@tanstack/react-query";
import { recipePlannerURL } from "@/lib/week-plan";
import { isDevelopmentFixture } from "@shared/development-fixture-provenance";
import { recipeToolKeys } from "@/lib/recipe-tools";
import { RecipeCreditLine, RecipeCreditEditor } from "@/components/recipe-credit";
import { RecipeNutritionSummary } from "@/components/recipe-nutrition";
import { NutritionDetailsToggle, useRecipeDisplay } from "@/components/recipe-display";
import { RecipePriceSummary } from "@/components/recipe-price";
import { RecipeIngredients } from "@/components/recipe-ingredients";
import { AnalysisWarnings, currentAnalysis, StepTiming } from "@/components/step-timing";

export default function RecipeDetail() {
  const { t } = useI18n();
  const { showNutrition } = useRecipeDisplay();
  const plannerHref = recipePlannerURL(useSearch());
  const { t: timingCopy } = useMvpCopy();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/recipe/:id");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [savingTimes, setSavingTimes] = useState(false);
  const [timingStatus, setTimingStatus] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    fetchRecipe(params.id)
      .then(value => {
        setRecipe(value);
        setPrepTime(value.prepTime == null ? "" : String(value.prepTime));
        setCookTime(value.cookTime == null ? "" : String(value.cookTime));
      })
      .catch(() => setError("Recipe not found"))
      .finally(() => setLoading(false));
  }, [params?.id]);

  const handleDelete = async () => {
    if (!recipe || recipe.developmentReadOnly) return;
    const confirmed = window.confirm(t("recipeDetail.deleteConfirm") || "Delete this recipe?");
    if (!confirmed) return;
    try {
      await deleteRecipe(recipe.id);
      setLocation("/recipes");
    } catch {
      alert("Failed to delete recipe");
    }
  };

  const returnLinks = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Link href={plannerHref}
        className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-testid="link-back-to-planner">
        {t("recipeDetail.backToPlanner")}
      </Link>
      <Link href="/recipes"
        className="inline-flex min-h-11 items-center mobile-readable-xs text-muted-foreground hover:text-foreground rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-testid={error || !recipe ? "link-back-to-recipes" : "link-back"}>
        {t("recipeDetail.backToRecipes") || "Back to recipes"}
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("recipes.loading") || "Loading..."}</p>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-muted-foreground">{error || "Recipe not found"}</p>
        {returnLinks}
      </div>
    );
  }

  const analysis = currentAnalysis(recipe, recipe.stepAnalysis);
  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="md" className="py-8 sm:py-10">
        <div className="mb-6">{returnLinks}</div>

        {recipe.image && (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="image-fade-in w-full h-44 sm:h-48 object-cover rounded-xl mb-6"
            loading="lazy"
            decoding="async"
            sizes="(max-width: 768px) 100vw, 768px"
            onLoad={(e) => e.currentTarget.classList.add("image-loaded")}
            data-testid="img-recipe-hero"
          />
        )}

        <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl sm:text-2xl font-medium text-foreground" data-testid="text-recipe-title">
          {recipe.title}
        </h1>
          <RecipePriceSummary recipe={recipe} />
        </div>
        <div className="mb-3 text-sm text-muted-foreground"><RecipeCreditLine recipe={recipe} /></div>
        <div className="mb-3 space-y-2 text-sm text-muted-foreground">
          <NutritionDetailsToggle />
          {showNutrition && <RecipeNutritionSummary recipe={recipe} />}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mobile-readable-xs text-muted-foreground mb-6">
          {recipe.prepTime != null && (
            <span data-testid="text-prep-time">{timingCopy("preparation")}: {recipe.prepTime} {timingCopy("minutesShort")}</span>
          )}
          {recipe.cookTime != null && (
            <span data-testid="text-cook-time">{timingCopy("cooking")}: {recipe.cookTime} {timingCopy("minutesShort")}</span>
          )}
          {recipe.servings && (
            <span data-testid="text-servings">{recipe.servings} {t("recipe.servings") || "servings"}</span>
          )}
          <span data-testid="text-tools">
            {timingCopy("toolsUsed")}: {recipeToolKeys(recipe.steps, recipe.equipment).map(tool => timingCopy(tool)).join(", ") || timingCopy("toolsUnknown")}
          </span>
          {recipe.metadataEstimated &&
            <span className="basis-full" data-testid="text-development-estimates">{timingCopy("developmentEstimates")}</span>}
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
              data-testid="link-source"
            >
              {isDevelopmentFixture(recipe) ? "Supplied link (unverified)" : t("recipeDetail.source") || "Source"}
            </a>
          )}
        </div>

        {isDevelopmentFixture(recipe) && (
          <p className="mb-6 rounded-xl border hairline p-4 text-sm" data-testid="synthetic-provenance">
            Synthetic test recipe, not an official or verified chef recipe. Chef references are
            not authorship or endorsement. Supplied links are unverified; collection pages do
            not verify this individual recipe. Missing times, servings and classifications are unknown.
          </p>
        )}

        {recipe.developmentReadOnly && <p className="mb-4 text-sm text-muted-foreground" role="note"
          data-testid="development-read-only">{timingCopy("developmentReadOnly")}</p>}
        <details className="mb-6 rounded-xl border hairline p-4">
          <summary className="cursor-pointer text-sm font-medium">{timingCopy("editTiming")}</summary>
          <form className="mt-4 space-y-3" onSubmit={async event => {
            event.preventDefault();
            if (savingTimes || recipe.developmentReadOnly) return;
            setSavingTimes(true);
            setTimingStatus(null);
            try {
              const updated = await updateRecipe(recipe.id, {
                prepTime: prepTime.trim() === "" ? null : Number(prepTime),
                cookTime: cookTime.trim() === "" ? null : Number(cookTime),
              });
              setRecipe(updated);
              await queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
              setTimingStatus("saved");
            } catch {
              setTimingStatus("error");
            } finally {
              setSavingTimes(false);
            }
          }}>
            <p className="text-xs text-muted-foreground">{timingCopy("timingHelp")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{timingCopy("preparation")} ({timingCopy("minutesLabel")})</span>
                <input type="number" min="0" max="10080" step="1" value={prepTime}
                  onChange={event => { setPrepTime(event.target.value); setTimingStatus(null); }}
                  disabled={savingTimes || recipe.developmentReadOnly} data-testid="input-prep-time"
                  className="block min-h-11 w-full rounded-lg border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>{timingCopy("cooking")} ({timingCopy("minutesLabel")})</span>
                <input type="number" min="0" max="10080" step="1" value={cookTime}
                  onChange={event => { setCookTime(event.target.value); setTimingStatus(null); }}
                  disabled={savingTimes || recipe.developmentReadOnly} data-testid="input-cooking-time"
                  className="block min-h-11 w-full rounded-lg border bg-background px-3" />
              </label>
            </div>
            <button type="submit" disabled={savingTimes || recipe.developmentReadOnly} data-testid="button-save-times"
              className="min-h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
              {timingCopy("saveTiming")}
            </button>
            {timingStatus && <p role={timingStatus === "error" ? "alert" : "status"} className="text-sm">
              {timingCopy(timingStatus === "error" ? "timingSaveFailed" : "timingSaved")}
            </p>}
          </form>
        </details>

        <RecipeCreditEditor recipe={recipe} onSaved={setRecipe} />
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="mobile-readable-xs px-3 py-1 rounded-full bg-foreground/5 text-muted-foreground"
                data-testid={`tag-${tag}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mb-8">
          <h2 className="mobile-readable-xs uppercase tracking-wide text-muted-foreground mb-3" data-testid="text-ingredients-heading">
            {t("import.ingredientsLabel") || "Ingredients"}
          </h2>
          <RecipeIngredients recipe={recipe} />
        </div>

        <div className="mb-8">
          <h2 className="mobile-readable-xs uppercase tracking-wide text-muted-foreground mb-3" data-testid="text-steps-heading">
            {t("import.stepsLabel") || "Steps"}
          </h2>
          <ol className="space-y-4">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3" data-testid={`text-step-${i}`}>
                <span className="mobile-readable-xs text-muted-foreground font-medium mt-0.5 w-5 flex-shrink-0">
                  {i + 1}.
                </span>
                <div className="space-y-2"><p className="text-sm text-foreground">{step}</p>
                  <StepTiming duration={analysis?.steps[i]} /></div>
              </li>
            ))}
          </ol>
          {analysis && <div className="mt-4"><AnalysisWarnings analysis={analysis} /></div>}
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t hairline">
          <button
            onClick={handleDelete}
            disabled={recipe.developmentReadOnly}
            className="px-5 py-2 min-h-11 text-sm rounded-full border border-red-200 text-red-500 hover:bg-red-50"
            data-testid="button-delete-recipe"
          >
            {t("recipeDetail.delete") || "Delete"}
          </button>
        </div>
      </PageContainer>
    </div>
  );
}

