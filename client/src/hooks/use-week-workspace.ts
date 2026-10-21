import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { fetchRecipes } from "@/lib/storage";
import { recordPilotEvent } from "@/lib/pilot-analytics";
import {
  weekPlanSchema, groceryChecksSchema, emptyPlan, planKey, checkKey,
  type GroceryChecks,
} from "@/lib/week-plan";

export type StorageIssue = "invalid" | "unavailable" | "changed" | "save" | null;
type Snapshot<T> = { key: string; value: T; raw: string | null; issue: StorageIssue };
function read<T>(key: string, schema: z.ZodType<T>, initial: T): Snapshot<T> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { key, value: initial, raw: null, issue: "unavailable" };
  }
  if (raw === null) return { key, value: initial, raw, issue: null };
  if (raw.length > 1_000_000) return { key, value: initial, raw, issue: "invalid" };
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success || (parsed.data as { weekStart?: string }).weekStart !== key.slice(-10)) {
      return { key, value: initial, raw, issue: "invalid" };
    }
    return { key, value: parsed.data, raw, issue: null };
  } catch {
    return { key, value: initial, raw, issue: "invalid" };
  }
}
function useDocument<T>(key: string, schema: z.ZodType<T>, initial: T) {
  const [snapshot, setSnapshot] = useState(() => read(key, schema, initial));
  const current = snapshot.key === key ? snapshot : read(key, schema, initial);
  useEffect(() => {
    setSnapshot(read(key, schema, initial));
    const refresh = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== key && event.key !== null) return;
      if (event instanceof CustomEvent && event.detail !== key) return;
      const next = read(key, schema, initial);
      setSnapshot(previous => next.raw === previous.raw ? previous : { ...next, issue: next.issue ?? "changed" });
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("tablewise-document", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("tablewise-document", refresh);
    };
    // key identifies a complete, independent week document; changes never auto-save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  function save(next: T, force = false): boolean {
    const latest = read(key, schema, initial);
    if (!force && (latest.issue || latest.raw !== current.raw)) {
      setSnapshot({ ...latest, issue: latest.issue ?? "changed" });
      return false;
    }
    const validated = schema.safeParse(next);
    if (!validated.success || (validated.data as { weekStart?: string }).weekStart !== key.slice(-10)) return false;
    try {
      const raw = JSON.stringify(validated.data);
      if (raw.length > 1_000_000) throw new Error("Storage document too large");
      localStorage.setItem(key, raw);
      setSnapshot({ key, value: validated.data, raw, issue: null });
      window.dispatchEvent(new CustomEvent("tablewise-document", { detail: key }));
      return true;
    } catch {
      setSnapshot({ ...current, issue: "save" }); return false;
    }
  }
  return {
    value: current.value, issue: current.issue, save,
    reload: () => setSnapshot(read(key, schema, initial)),
    reset: () => save(initial, true),
  };
}
export function useWeekPlan(week: string) {
  const doc = useDocument(planKey(week), weekPlanSchema, emptyPlan(week));
  const save: typeof doc.save = next => {
    if (!doc.save(next)) return false;
    next.selectedRecipeIds.filter(id => !doc.value.selectedRecipeIds.includes(id))
      .forEach(id => recordPilotEvent("meal_selected", week, id));
    if (next.confirmed && !doc.value.confirmed) recordPilotEvent("plan_completed", week);
    return true;
  };
  return { plan: doc.value, issue: doc.issue, save, reload: doc.reload, reset: doc.reset };
}
export function useGroceryChecks(week: string) {
  const initial: GroceryChecks = { version: 1, weekStart: week, checkedIds: [] };
  const doc = useDocument(checkKey(week), groceryChecksSchema, initial);
  const checked = new Set(doc.value.checkedIds);
  return {
    checked, issue: doc.issue, reload: doc.reload, reset: doc.reset,
    toggle: (id: string) => {
      const next = new Set(checked);
      if (next.has(id)) next.delete(id); else next.add(id);
      return doc.save({ ...doc.value, checkedIds: Array.from(next) });
    },
    clear: () => doc.save(initial),
  };
}
export function useRecipeCatalog() {
  return useQuery({
    queryKey: ["/api/recipes"], queryFn: async () => {
      const recipes = await fetchRecipes();
      if (!Array.isArray(recipes) || recipes.some(recipe =>
        !recipe || typeof recipe.id !== "string" || !recipe.id ||
        typeof recipe.title !== "string" || !Array.isArray(recipe.ingredients) ||
        !recipe.ingredients.every(ingredient => typeof ingredient === "string") ||
        !Array.isArray(recipe.steps) || !recipe.steps.every(step => typeof step === "string"),
      ) || new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) {
        throw new Error("Invalid recipe catalog");
      }
      return recipes;
    }, retry: false,
    staleTime: 0, refetchOnMount: "always",
  });
}
