import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { fetchRecipes, type Recipe } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";
import { RecipeCreditLine } from "@/components/recipe-credit";
import { Plus } from "lucide-react";
import { DietaryTags, RecipeMeta } from "@/components/recipe-summary";

export default function RecipeList() {
  const { t } = useI18n();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadRecipes = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setHasError(false);
    fetchRecipes()
      .then((result) => {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setRecipes(result);
        }
      })
      .catch(() => {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setHasError(true);
        }
      })
      .finally(() => {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setLoading(false);
          setRetrying(false);
        }
      });
  }, []);

  const retryRecipes = useCallback(() => {
    setRetrying(true);
    loadRecipes();
  }, [loadRecipes]);

  useEffect(() => {
    mountedRef.current = true;
    loadRecipes();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [loadRecipes]);

  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="lg" className="py-6 sm:py-10">
        <header className="page-header flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title" data-testid="text-page-title">{t("recipes.title") || "My Recipes"}</h1>
            <p className="page-subtitle" data-testid="text-page-subtitle">{t("recipes.subtitle") || "Your saved recipes"}</p>
          </div>
          <Link href="/import" data-testid="link-add-recipe" className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />{t("nav.addRecipe")}
          </Link>
        </header>

        {loading ? (
          <div>
            <p className="text-sm text-muted-foreground" role="status" data-testid="text-loading">
              {t("recipes.loading") || "Loading..."}
            </p>
            {retrying && (
              <button
                type="button"
                onClick={retryRecipes}
                disabled
                className="btn btn-secondary mt-4"
                data-testid="button-retry"
              >
                {t("recipes.retry") || "Try again"}
              </button>
            )}
          </div>
        ) : hasError ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-4" role="alert" data-testid="text-error">
              {t("recipes.error") || "We couldn’t load your recipes. Please try again."}
            </p>
            <button
              type="button"
              onClick={retryRecipes}
              disabled={loading}
              className="btn btn-secondary"
              data-testid="button-retry"
            >
              {loading
                ? t("recipes.loading") || "Loading..."
                : t("recipes.retry") || "Try again"}
            </button>
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-empty">
              {t("recipes.empty") || "No recipes yet"}
            </p>
            <Link
              href="/import"
              className="btn btn-primary"
              data-testid="link-import-first"
            >
              {t("recipes.importFirst") || "Import your first recipe"}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recipes.map((recipe) => (
              <Link
                key={recipe.id}
                href={`/recipe/${recipe.id}`}
                className="card flex flex-col p-4 transition-colors hover:border-input"
                data-testid={`card-recipe-${recipe.id}`}
              >
                {recipe.image && (
                  <img src={recipe.image} alt="" loading="lazy" decoding="async"
                    className="image-fade-in mb-3 aspect-[16/9] w-full rounded-lg object-cover"
                    onLoad={(e) => e.currentTarget.classList.add("image-loaded")}
                    onError={(e) => { e.currentTarget.hidden = true; }}
                    data-testid={`img-recipe-${recipe.id}`} />
                )}
                <h2 className="text-base font-semibold leading-snug text-foreground break-words" data-testid={`text-recipe-title-${recipe.id}`}>
                  {recipe.title}
                </h2>
                <RecipeMeta recipe={recipe} className="mt-2" testId={`text-recipe-info-${recipe.id}`} />
                <div className="mt-1 text-sm text-muted-foreground"><RecipeCreditLine recipe={recipe} /></div>
                <div className="mt-3"><DietaryTags tags={recipe.tags} testId={`recipe-tags-${recipe.id}`} /></div>
              </Link>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}

