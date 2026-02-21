import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { fetchRecipes, type Recipe } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";

export default function RecipeView() {
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    let active = true;

    fetchRecipes()
      .then((data) => {
        if (!active) return;
        setRecipes(data);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load recipes for recipe view:", err);
        if (!active) return;
        setRecipes([]);
        setError(err instanceof Error ? err.message : "Failed to load recipes");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (recipes.length === 0) return;

    const firstRecipe = recipes[0];
    setLocation(`/recipe/${firstRecipe.id}`);
  }, [isLoading, recipes, setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader title="Tablewise" subtitle={t("nav.recipeView")} onBrandClick={() => setLocation("/")} />
      <PageContainer size="md" className="flex-1 py-8 sm:py-10">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("recipes.loading") || "Loading recipes..."}</p>
        ) : error ? (
          <div className="rounded-xl border hairline p-5 bg-[#FAFAF8] max-w-xl">
            <p className="text-sm text-foreground mb-2">Failed to load recipes.</p>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 min-h-11 rounded-full bg-foreground text-background text-sm"
            >
              Retry
            </button>
          </div>
        ) : recipes.length === 0 ? (
          <div className="rounded-xl border hairline p-5 bg-[#FAFAF8] max-w-xl">
            <p className="text-sm text-foreground mb-2">{t("recipes.empty") || "No recipes yet"}</p>
            <p className="text-xs text-muted-foreground mb-4">Import a recipe to open recipe view.</p>
            <button
              onClick={() => setLocation("/import")}
              className="px-4 py-2 min-h-11 rounded-full bg-foreground text-background text-sm"
            >
              {t("nav.importRecipe")}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Opening recipe...</p>
        )}
      </PageContainer>
    </div>
  );
}
