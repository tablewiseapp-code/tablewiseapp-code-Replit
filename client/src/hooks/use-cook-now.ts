import { useState } from "react";
import { useLocation } from "wouter";
import { loadSettings, missingAnswers, type SetupStep } from "@/lib/basic-settings";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { cookNowOptions } from "@/lib/week-suggestions";
import { findWithWhatIHave, type FindResult } from "@/lib/on-hand";
import { total } from "@/lib/preference-engine";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import type { Recipe } from "@/lib/storage";

/** /household asking only these questions, then going to `then` (a path, or "cook" to run Cook now again). */
export const askURL = (steps: readonly SetupStep[], then: string) => `/household?ask=${steps.join(",")}&then=${encodeURIComponent(then)}`;

/** Personalize my recipes, returning to `from` on Save or Cancel. */
export const personalizeURL = (from: string) => `/personalize?from=${encodeURIComponent(from)}`;

/** What narrows one Cook now, kept in the URL only (never saved): a time limit (?max=15|30) and the proteins on hand it
 * asked for (?have=…, each Must include one also as ?must=…). */
export type CookNowFilter = { max: 15 | 30 | null; proteins: { name: string; required: boolean }[] };
export function readCookNow(search: string): CookNowFilter {
  const params = new URLSearchParams(search);
  const max = Number(params.get("max"));
  const must = params.getAll("must");
  return { max: max === 15 || max === 30 ? max : null, proteins: params.getAll("have").map(name => ({ name, required: must.includes(name) })) };
}
export function cookNowURL(id: string, filter: CookNowFilter) {
  const params = new URLSearchParams();
  if (filter.max) params.set("max", String(filter.max));
  filter.proteins.forEach(p => { params.append("have", p.name); if (p.required) params.append("must", p.name); });
  const rest = params.toString();
  return `/recipe/${encodeURIComponent(id)}?suggest${rest ? `&${rest}` : ""}`;
}
/** Cook now's list: eligible recipes (cookNowOptions) within the time limit (unknown time never passes) and, when proteins
 * were given, using at least one of them and every Must include one. */
export function cookNowList(catalog: readonly Recipe[], filter: CookNowFilter): FindResult<PlannerRecipe> {
  const list = cookNowOptions(toPlannerRecipes([...catalog]), loadSettings(), new Date())
    .filter(r => { const minutes = total(r); return filter.max === null || (minutes !== null && minutes <= filter.max); });
  return filter.proteins.length ? findWithWhatIHave(list, filter.proteins) : { recipes: list, noMatch: list.length ? null : "restrictions" };
}

/** Cook now (Your household, screen 5) and Home → Suggest a recipe. `start` asks missing household answers (then Cook now
 * resumes), else asks "What protein do you have?" (`asking`; CookNowProteins); `run` opens the first recipe of the list at
 * /recipe/:id?suggest, where "Show another" uses the same list. Never writes the Week. */
export function useCookNow() {
  const [, setLocation] = useLocation();
  const catalog = useRecipeCatalog();
  const [empty, setEmpty] = useState(false);
  const [asking, setAsking] = useState(false);
  const start = () => {
    const missing = missingAnswers(loadSettings());
    if (missing.length) { setLocation(askURL(missing, "cook")); return; }
    setEmpty(false);
    setAsking(true);
  };
  /** Opens the first recipe; returns the list so the proteins sheet can say why nothing matched. */
  const run = (proteins: CookNowFilter["proteins"] = []) => {
    const result = cookNowList(catalog.data ?? [], { max: null, proteins });
    const pick = result.recipes[0];
    if (pick) { setAsking(false); setLocation(cookNowURL(pick.id, { max: null, proteins })); }
    else if (!proteins.length) { setAsking(false); setEmpty(true); }
    return result;
  };
  return { start, run, asking, close: () => setAsking(false), empty, ready: !!catalog.data };
}
