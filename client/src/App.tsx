import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import RecipeView from "@/pages/recipe-view";
import WeeklyMeals from "@/pages/weekly-meals";
import ImportRecipe from "@/pages/import-recipe";
import GroceryList from "@/pages/grocery-list";
import NotFound from "@/pages/not-found";

const NAV_LINKS = [
  { path: "/", label: "Recipe View" },
  { path: "/meals", label: "Weekly Meals" },
  { path: "/import", label: "Import Recipe" },
  { path: "/grocery-list", label: "Grocery List" },
];

function DevNav() {
  const [location] = useLocation();
  return (
    <nav className="bg-[#2E2E2E] px-4 py-1.5 flex items-center gap-1 text-xs" data-testid="dev-nav">
      <span className="text-white/40 mr-2 font-mono">DEV</span>
      {NAV_LINKS.map(link => (
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
          {link.label}
        </Link>
      ))}
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
        <Toaster />
        <DevNav />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
