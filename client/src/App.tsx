import { Switch, Route, Redirect, useSearch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AppNav } from "@/components/layout/app-nav";
import { RecipeDisplayProvider } from "@/components/recipe-display";
import RecipeView from "@/pages/recipe-view";
import MvpGrocery from "@/pages/mvp-grocery";
import RecipeList from "@/pages/recipe-list";
import RecipeDetail from "@/pages/recipe-detail";
import WeeklyMeals from "@/pages/weekly-meals";
import ImportRecipe from "@/pages/import-recipe";
import GroceryList from "@/pages/grocery-list";
import NotFound from "@/pages/not-found";
import MyIdeas from "@/pages/my-ideas";
import BasicSettings from "@/pages/basic-settings";

function GroceryEntry() {
  return new URLSearchParams(useSearch()).get("source") === "mvp" ? <MvpGrocery /> : <GroceryList />;
}

function MealsHome() {
  return <Redirect to="/meals" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MealsHome}/>
      <Route path="/plan" component={MealsHome}/>
      <Route path="/recipe-view" component={RecipeView}/>
      <Route path="/recipes" component={RecipeList}/>
      <Route path="/my-ideas" component={MyIdeas}/>
      <Route path="/recipe/:id" component={RecipeDetail}/>
      <Route path="/meals" component={WeeklyMeals}/>
      <Route path="/import" component={ImportRecipe}/>
      <Route path="/grocery-list" component={GroceryEntry}/>
      <Route path="/settings" component={BasicSettings}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <RecipeDisplayProvider>
          <Toaster />
          <AppNav />
          <Router />
          </RecipeDisplayProvider>
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
