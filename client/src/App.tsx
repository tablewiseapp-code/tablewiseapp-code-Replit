import { Component, useEffect, useState, type ReactNode } from "react";
import { Switch, Route, Redirect, useSearch } from "wouter";
import { syncWeekPlan } from "@/lib/meal-plan";
import { syncSettings } from "@/lib/basic-settings";
import Household from "@/pages/household";
import Personalize from "@/pages/personalize";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
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
      <Route path="/household" component={Household}/>
      <Route path="/personalize" component={Personalize}/>
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

// Without this, any render error blanks the whole app (white screen). The error is still logged to the console.
class CrashGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Crashed /> : this.props.children; }
}
function Crashed() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <p>{t("app.crashed")}</p>
      <Button className="min-h-11" onClick={() => window.location.reload()}>{t("app.reload")}</Button>
    </main>
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
    Promise.all([syncWeekPlan().catch(() => undefined), syncSettings().catch(() => undefined), ask]).finally(() => setReady(true));
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <RecipeDisplayProvider>
          <Toaster />
          <CrashGuard>
          {ready && (askSignIn ? <SignIn onGuest={() => setAskSignIn(false)} /> : <>
            <AppNav />
            <Router />
          </>)}
          </CrashGuard>
          </RecipeDisplayProvider>
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
