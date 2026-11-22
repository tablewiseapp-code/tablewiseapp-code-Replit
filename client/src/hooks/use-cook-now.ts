import { useState } from "react";
import { useLocation } from "wouter";
import { loadSettings, missingAnswers, type SetupStep } from "@/lib/basic-settings";
import { toPlannerRecipes } from "@/lib/planner-recipes";
import { cookNowOptions } from "@/lib/week-suggestions";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";

/** /household asking only these questions, then going to `then` (a path, or "cook" to run Cook now again). */
export const askURL = (steps: readonly SetupStep[], then: string) => `/household?ask=${steps.join(",")}&then=${encodeURIComponent(then)}`;

/** Cook now (Your household, screen 5) and Home → Suggest a recipe: one eligible recipe opened at /recipe/:id?suggest, where
 * "Show another" uses the same list. Missing required answers are asked first, then Cook now resumes. Never writes the Week. */
export function useCookNow() {
  const [, setLocation] = useLocation();
  const catalog = useRecipeCatalog();
  const [empty, setEmpty] = useState(false);
  const start = () => {
    const settings = loadSettings();
    const missing = missingAnswers(settings);
    if (missing.length) { setLocation(askURL(missing, "cook")); return; }
    const pick = cookNowOptions(toPlannerRecipes(catalog.data ?? []), settings, new Date())[0];
    if (pick) setLocation(`/recipe/${encodeURIComponent(pick.id)}?suggest`);
    else setEmpty(true);
  };
  return { start, empty, ready: !!catalog.data };
}
