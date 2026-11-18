import { useEffect, useState } from "react";
import { Switch, Route, Redirect, useSearch } from "wouter";
import { syncWeekPlan } from "@/lib/meal-plan";
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
import Home from "@/pages/home";
import ImportRecipe from "@/pages/import-recipe";
import GroceryList from "@/pages/grocery-list";
import NotFound from "@/pages/not-found";
import MyIdeas from "@/pages/my-ideas";
import BasicSettings from "@/pages/basic-settings";
import SharedGrocery from "@/pages/shared-grocery";
import HomeTasks from "@/pages/home-tasks";
import SignIn from "@/pages/sign-in";
import { choseGuest } from "@/lib/account-copy";

function GroceryEntry() {
  return new URLSearchParams(useSearch()).get("source") === "mvp" ? <MvpGrocery /> : <GroceryList />;
}

function PlanRedirect() {
  return <Redirect to="/meals" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/home-tasks" component={HomeTasks}/>
      <Route path="/plan" component={PlanRedirect}/>
      <Route path="/recipe-view" component={RecipeView}/>
      <Route path="/recipes" component={RecipeList}/>
      <Route path="/my-ideas" component={MyIdeas}/>
      <Route path="/recipe/:id" component={RecipeDetail}/>
      <Route path="/meals" component={WeeklyMeals}/>
      <Route path="/import" component={ImportRecipe}/>
      <Route path="/grocery-list" component={GroceryEntry}/>
      <Route path="/settings" component={BasicSettings}/>
      <Route path="/shared/:token" component={SharedGrocery}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Pages read the Week synchronously, so load the server copy first. Offline or failing: use the browser copy.
  // First visit: offer sign-in or "Continue as guest" (remembered). Share links open without it.
  const [ready, setReady] = useState(false);
  const [askSignIn, setAskSignIn] = useState(false);
  useEffect(() => {
    const ask = choseGuest() || window.location.pathname.startsWith("/shared/") ? undefined
      : fetch("/api/auth/me").then(r => r.ok ? r.json() : {}).then((me: { email?: string | null }) => setAskSignIn(me.email === null)).catch(() => undefined);
    Promise.all([syncWeekPlan().catch(() => undefined), ask]).finally(() => setReady(true));
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <RecipeDisplayProvider>
          <Toaster />
          {ready && (askSignIn ? <SignIn onGuest={() => setAskSignIn(false)} /> : <>
            <AppNav />
            <Router />
          </>)}
          </RecipeDisplayProvider>
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
