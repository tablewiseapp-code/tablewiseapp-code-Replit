import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { fetchRecipe, deleteRecipe, updateRecipe, type Recipe } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";
import { useMvpCopy } from "@/lib/mvp-copy";
import { useQueryClient } from "@tanstack/react-query";

export default function RecipeDetail() {
  const { t } = useI18n();
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
    if (!recipe) return;
    const confirmed = window.confirm(t("recipeDetail.deleteConfirm") || "Delete this recipe?");
    if (!confirmed) return;
    try {
      await deleteRecipe(recipe.id);
      setLocation("/recipes");
    } catch {
      alert("Failed to delete recipe");
    }
  };

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
        <Link href="/recipes" className="text-sm text-foreground underline" data-testid="link-back-to-recipes">
          {t("recipeDetail.backToRecipes") || "Back to recipes"}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="md" className="py-8 sm:py-10">
        <Link
          href="/recipes"
          className="mobile-readable-xs text-muted-foreground hover:text-foreground mb-6 inline-block"
          data-testid="link-back"
        >
          {t("recipeDetail.backToRecipes") || "Back to recipes"}
        </Link>

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

        <h1 className="text-xl sm:text-2xl font-medium text-foreground mb-2" data-testid="text-recipe-title">
          {recipe.title}
        </h1>

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
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
              data-testid="link-source"
            >
              {t("recipeDetail.source") || "Source"}
            </a>
          )}
        </div>

        <details className="mb-6 rounded-xl border hairline p-4">
          <summary className="cursor-pointer text-sm font-medium">{timingCopy("editTiming")}</summary>
          <form className="mt-4 space-y-3" onSubmit={async event => {
            event.preventDefault();
            if (savingTimes) return;
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
                  disabled={savingTimes} data-testid="input-prep-time"
                  className="block min-h-11 w-full rounded-lg border bg-background px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span>{timingCopy("cooking")} ({timingCopy("minutesLabel")})</span>
                <input type="number" min="0" max="10080" step="1" value={cookTime}
                  onChange={event => { setCookTime(event.target.value); setTimingStatus(null); }}
                  disabled={savingTimes} data-testid="input-cooking-time"
                  className="block min-h-11 w-full rounded-lg border bg-background px-3" />
              </label>
            </div>
            <button type="submit" disabled={savingTimes} data-testid="button-save-times"
              className="min-h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
              {timingCopy("saveTiming")}
            </button>
            {timingStatus && <p role={timingStatus === "error" ? "alert" : "status"} className="text-sm">
              {timingCopy(timingStatus === "error" ? "timingSaveFailed" : "timingSaved")}
            </p>}
          </form>
        </details>

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
          <ul className="space-y-2">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2" data-testid={`text-ingredient-${i}`}>
                <span className="text-muted-foreground mt-0.5">.</span>
                <span className="min-w-0">{ing}</span>
              </li>
            ))}
          </ul>
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
                <p className="text-sm text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t hairline">
          <button
            onClick={handleDelete}
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

