import { Link, useLocation } from "wouter";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

const links = [
  { path: "/meals", key: "nav.weeklyMeals" },
  { path: "/recipe-view", key: "nav.recipeView" },
  { path: "/recipes", key: "nav.myRecipes" },
  { path: "/import", key: "nav.importRecipe" },
  { path: "/grocery-list", key: "nav.groceryList" },
];

export function GroceryNavigation() {
  const [location] = useLocation();
  const { t, lang, setLang } = useI18n();

  return (
    <nav className="grocery-topline" aria-label={t("grocery.groceryList")}>
      <Link href="/meals" className="grocery-wordmark" data-testid="app-header-brand">
        tablewise
      </Link>
      <div className="grocery-list-navigation-actions">
        <Link href="/meals" className="grocery-back inline-flex items-center" data-testid="button-back-to-plan">
          <span aria-hidden="true">‹</span>{t("nav.weeklyMeals")}
        </Link>
        <MobileNavSheet
          title={t("grocery.groceryList")}
          trigger={<button type="button" className="grocery-navigation-menu" aria-label="Open navigation menu">Menu</button>}
        >
          <div className="space-y-1">
            {links.map(link => (
              <Link
                key={link.path}
                href={link.path}
                aria-current={location === link.path ? "page" : undefined}
                className={`block rounded-lg px-3 py-3 text-sm ${location === link.path ? "bg-foreground/5 font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t(link.key)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {LANGUAGES.map(language => (
              <button
                type="button"
                key={language.code}
                onClick={() => setLang(language.code)}
                aria-pressed={lang === language.code}
                className={`rounded-full border px-3 py-2 text-sm ${lang === language.code ? "bg-foreground text-background" : "text-muted-foreground"}`}
                data-testid={`button-grocery-lang-${language.code}`}
              >
                {language.nativeLabel}
              </button>
            ))}
          </div>
        </MobileNavSheet>
      </div>
    </nav>
  );
}
