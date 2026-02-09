import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, useI18n, LANGUAGES } from "@/lib/i18n";
import RecipeView from "@/pages/recipe-view";
import WeeklyMeals from "@/pages/weekly-meals";
import ImportRecipe from "@/pages/import-recipe";
import GroceryList from "@/pages/grocery-list";
import NotFound from "@/pages/not-found";
import { useState, useRef, useEffect } from "react";

const NAV_KEYS = [
  { path: "/", key: "nav.recipeView" },
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
  const { t } = useI18n();
  return (
    <nav className="bg-[#2E2E2E] px-4 py-1.5 flex items-center gap-1 text-xs" data-testid="dev-nav">
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
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RecipeView}/>
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
