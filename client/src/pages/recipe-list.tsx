import { useEffect, useState } from "react";
import { Link } from "wouter";
import { fetchRecipes, type Recipe } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";

export default function RecipeList() {
  const { t } = useI18n();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipes()
      .then(setRecipes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="md" className="py-8 sm:py-10">
        <h1 className="text-2xl font-medium text-foreground mb-2" data-testid="text-page-title">
          {t("recipes.title") || "My Recipes"}
        </h1>
        <p className="text-sm text-muted-foreground mb-8" data-testid="text-page-subtitle">
          {t("recipes.subtitle") || "Your saved recipes"}
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground" data-testid="text-loading">
            {t("recipes.loading") || "Loading..."}
          </p>
        ) : recipes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-empty">
              {t("recipes.empty") || "No recipes yet"}
            </p>
            <Link
              href="/import"
              className="inline-block px-6 py-2.5 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90"
              data-testid="link-import-first"
            >
              {t("recipes.importFirst") || "Import your first recipe"}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recipes.map((recipe) => (
              <Link
                key={recipe.id}
                href={`/recipe/${recipe.id}`}
                className="block p-4 rounded-xl border hairline hover:bg-[#FAFAF8] transition-colors"
                data-testid={`card-recipe-${recipe.id}`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {recipe.image && (
                    <img
                      src={recipe.image}
                      alt={recipe.title}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                      data-testid={`img-recipe-${recipe.id}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-medium text-foreground truncate" data-testid={`text-recipe-title-${recipe.id}`}>
                      {recipe.title}
                    </h2>
                    <p className="mobile-readable-xs text-muted-foreground mt-1" data-testid={`text-recipe-info-${recipe.id}`}>
                      {recipe.ingredients.length} {t("recipes.ingredients") || "ingredients"} - {recipe.steps.length} {t("recipes.steps") || "steps"}
                      {recipe.cookTime ? ` - ${recipe.cookTime} min` : ""}
                    </p>
                    {recipe.tags && recipe.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {recipe.tags.map((tag) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs mt-0.5">&rsaquo;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}

