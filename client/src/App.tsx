import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, useI18n, LANGUAGES } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";
import RecipeView from "@/pages/recipe-view";
import MainPage from "@/pages/main";
import RecipeList from "@/pages/recipe-list";
import RecipeDetail from "@/pages/recipe-detail";
import WeeklyMeals from "@/pages/weekly-meals";
import ImportRecipe from "@/pages/import-recipe";
import GroceryList from "@/pages/grocery-list";
import NotFound from "@/pages/not-found";
import { useState, useRef, useEffect } from "react";

const NAV_KEYS = [
  { path: "/recipe-view", key: "nav.recipeView" },
  { path: "/recipes", key: "nav.myRecipes" },
  { path: "/meals", key: "nav.weeklyMeals" },
  { path: "/import", key: "nav.importRecipe" },
  { path: "/grocery-list", key: "nav.groceryList" },
];

function LanguageSelector() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = LANGUAGES.find(l => l.code === lang);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        data-testid="button-language-selector"
      >
        {current?.nativeLabel}
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 bg-[#2E2E2E] border border-white/20 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full text-start px-3 py-1.5 text-xs transition-colors ${
                lang === l.code ? "text-white bg-white/20" : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
              data-testid={`button-lang-${l.code}`}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DevNav() {
  const [location] = useLocation();
  const { t, lang, setLang } = useI18n();
  return (
    <>
      <div className="bg-[#2E2E2E] px-4 py-2 flex items-center justify-between text-xs sm:hidden" data-testid="dev-nav-mobile">
        <span className="text-white/40 font-mono">DEV</span>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-white/20 bg-white/5 p-1">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`min-h-9 px-2 rounded-full text-[10px] font-medium transition-colors ${
                  lang === l.code ? "bg-white/20 text-white" : "text-white/70 hover:text-white"
                }`}
                data-testid={`button-mobile-topbar-lang-${l.code}`}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>
          <MobileNavSheet
            title="Navigation"
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 px-4 rounded-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                data-testid="dev-nav-mobile-trigger"
              >
                Menu
              </Button>
            }
          >
            <div className="space-y-2">
              {NAV_KEYS.map(link => (
                <Link
                  key={link.path}
                  href={link.path}
                  className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    location === link.path
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                  data-testid={`dev-nav-mobile-link-${link.path === "/" ? "home" : link.path.slice(1)}`}
                >
                  {t(link.key)}
                </Link>
              ))}
            </div>
            <div className="pt-2 border-t hairline">
              <p className="text-xs text-muted-foreground mb-2">Language</p>
              <div className="grid grid-cols-1 gap-2">
                {LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={`text-left rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      lang === l.code
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                    }`}
                    data-testid={`button-mobile-lang-${l.code}`}
                  >
                    {l.nativeLabel}
                  </button>
                ))}
              </div>
            </div>
          </MobileNavSheet>
        </div>
      </div>

      <nav className="hidden sm:flex bg-[#2E2E2E] px-4 py-2 items-center gap-1 text-xs" data-testid="dev-nav">
        <span className="text-white/40 mr-2 font-mono">DEV</span>
        {NAV_KEYS.map(link => (
          <Link
            key={link.path}
            href={link.path}
            className={`px-3 py-1 rounded-full transition-colors ${
              location === link.path
                ? "bg-white/20 text-white"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
            data-testid={`dev-nav-link-${link.path === "/" ? "home" : link.path.slice(1)}`}
          >
            {t(link.key)}
          </Link>
        ))}
        <div className="flex-1" />
        <LanguageSelector />
      </nav>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MainPage}/>
      <Route path="/recipe-view" component={RecipeView}/>
      <Route path="/recipes" component={RecipeList}/>
      <Route path="/recipe/:id" component={RecipeDetail}/>
      <Route path="/meals" component={WeeklyMeals}/>
      <Route path="/import" component={ImportRecipe}/>
      <Route path="/grocery-list" component={GroceryList}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <Toaster />
          <DevNav />
          <Router />
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
