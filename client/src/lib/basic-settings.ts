import { useCallback, useEffect, useRef, useState } from "react";
import { allergens, cuisines, dietPatterns, ingredientPrefIds, type Allergen, type Cuisine, type DietPattern } from "@shared/food-rules";
import { selectableDevices, type DeviceId } from "./device-requirements";
import { plannerCookingMethods } from "./planner-filters";
import { mealSlots, type MealSlot } from "./meal-plan";

// My Basic Settings. There are no user accounts yet, so settings live in this browser like every other
// TableWise preference. ponytail: localStorage; move behind an authenticated API when accounts exist —
// the document is versioned, sanitized and merge-on-write so that move is a storage swap, not a redesign.
export const settingsKey = "tablewise_basic_settings";
export const portionSizes = ["small", "regular", "large"] as const;
export type PortionSize = typeof portionSizes[number];
export const leftoverOptions = ["none", "sometimes", "often"] as const;
export const varietyOptions = ["low", "balanced", "high"] as const;
export const noveltyOptions = ["familiar", "balanced", "new"] as const;
export const servingLimits = { min: 1, max: 20 } as const;
export const mealRecipeTypes = ["both", "meatless", "meat"] as const;
export type MealRecipeType = typeof mealRecipeTypes[number];
export const mealTimeLimits = [15, 20, 30, 45, 60] as const;
/** Per meal. max: minutes, "none" = explicitly no limit, null = not set (the weekday/weekend cooking time applies). */
export type MealRule = { type: MealRecipeType; max: typeof mealTimeLimits[number] | "none" | null };
const noRule = (): MealRule => ({ type: "both", max: null });

/** Ingredient preferences: a structured id from shared/food-rules, or "custom:<text>". */
export type IngredientChoice = string;
export type CookingPrefs = { quick: boolean; minimalCleanup: boolean; onePot: boolean; batch: boolean };
export const cookingPrefKeys = ["quick", "minimalCleanup", "onePot", "batch"] as const;
const noPrefs = (): CookingPrefs => ({ quick: false, minimalCleanup: false, onePot: false, batch: false });
export type Member = {
  id: string; name: string; kind: "adult" | "child";
  diets: DietPattern[]; allergies: Allergen[]; customAllergies: string[];
  dislikes: IngredientChoice[]; favorites: IngredientChoice[]; portion: PortionSize | null;
};
export type BasicSettings = {
  version: 2; rev: number;
  household: { members: Member[]; portion: PortionSize; servingsMode: "auto" | "fixed"; fixedServings: number };
  dietary: { diets: DietPattern[]; allergies: Allergen[]; customAllergies: string[]; dislikes: IngredientChoice[]; favorites: IngredientChoice[];
    preferredCuisines: Cuisine[]; avoidCuisines: Cuisine[] };
  /** null = never configured (every device available). [] = explicitly none. */
  kitchen: { devices: DeviceId[] | null };
  /** Weekday and weekend each have their own soft preferences; hardMax is one shared rule. */
  cooking: { weekdayMax: number | null; weekendMax: number | null; hardMax: boolean; weekday: CookingPrefs; weekend: CookingPrefs };
  planning: { meals: MealSlot[]; cookingDays: number; leftovers: typeof leftoverOptions[number]; repeatFavorites: boolean;
    variety: typeof varietyOptions[number]; novelty: typeof noveltyOptions[number]; mealRules: Record<MealSlot, MealRule> };
  shopping: { budgetFriendly: boolean; reuseIngredients: boolean; pantry: string[] };
};

export const defaultSettings = (): BasicSettings => ({
  version: 2, rev: 0,
  household: { members: [], portion: "regular", servingsMode: "auto", fixedServings: 4 },
  dietary: { diets: [], allergies: [], customAllergies: [], dislikes: [], favorites: [], preferredCuisines: [], avoidCuisines: [] },
  kitchen: { devices: null },
  cooking: { weekdayMax: null, weekendMax: null, hardMax: false, weekday: noPrefs(), weekend: noPrefs() },
  planning: { meals: ["Breakfast", "Lunch", "Dinner"], cookingDays: 7, leftovers: "none", repeatFavorites: false, variety: "balanced", novelty: "balanced",
    mealRules: { Breakfast: noRule(), Lunch: noRule(), Dinner: noRule() } },
  shopping: { budgetFriendly: false, reuseIngredients: false, pantry: [] },
});

// ---- Sanitizing: unknown/invalid values are dropped field by field, never the whole document. ----
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? v as T : fallback);
const subset = <T extends string>(list: readonly T[], v: unknown): T[] => (Array.isArray(v) ? list.filter(x => v.includes(x)) : []);
const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
const int = (v: unknown, min: number, max: number, fallback: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : fallback);
const minutes = (v: unknown) => (Number.isInteger(v) && (v as number) >= 5 && (v as number) <= 600 ? v as number : null);
const text = (v: unknown, max = 60) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const terms = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(x => text(x, 40).toLowerCase()).filter(Boolean))].slice(0, 30) : []);
const choices = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").filter(x =>
  (ingredientPrefIds as string[]).includes(x) || (/^custom:.{1,40}$/.test(x) && !!text(x.slice(7), 40))))].slice(0, 30) : []);

/** Earlier saves kept one shared set ({ quick, … } on `cooking`): it becomes the starting point for both day types. */
const prefs = (raw: unknown, shared: Record<string, unknown>): CookingPrefs => {
  const own = obj(raw), source = raw === undefined ? shared : own;
  return { quick: bool(source.quick), minimalCleanup: bool(source.minimalCleanup), onePot: bool(source.onePot), batch: bool(source.batch) };
};

function mealRule(raw: unknown): MealRule {
  const r = obj(raw);
  return { type: oneOf(mealRecipeTypes, r.type, "both"),
    max: r.max === "none" ? "none" : (mealTimeLimits as readonly unknown[]).includes(r.max) ? r.max as MealRule["max"] : null };
}

function member(raw: unknown, index: number): Member | null {
  const m = obj(raw);
  const id = typeof m.id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(m.id) ? m.id : null;
  if (!id) return null;
  return {
    id, name: text(m.name, 40) || `#${index + 1}`, kind: m.kind === "child" ? "child" : "adult",
    diets: subset(dietPatterns, m.diets), allergies: subset(allergens, m.allergies), customAllergies: terms(m.customAllergies),
    dislikes: choices(m.dislikes), favorites: choices(m.favorites), portion: m.portion == null ? null : oneOf(portionSizes, m.portion, "regular"),
  };
}

export function sanitizeSettings(raw: unknown): BasicSettings {
  const d = defaultSettings();
  const r = obj(raw);
  // v1 (the first My Basic Settings): { devices: [...] } — an explicit choice, kept even when empty.
  if (r.version === undefined && Array.isArray(r.devices)) {
    return { ...d, kitchen: { devices: subset(selectableDevices, r.devices) } };
  }
  if (r.version !== 2) return d;
  const h = obj(r.household), di = obj(r.dietary), k = obj(r.kitchen), c = obj(r.cooking), p = obj(r.planning), s = obj(r.shopping);
  const members = (Array.isArray(h.members) ? h.members : []).map(member).filter((m): m is Member => !!m);
  return {
    version: 2, rev: int(r.rev, 0, Number.MAX_SAFE_INTEGER, 0),
    household: { members: members.filter((m, i) => members.findIndex(x => x.id === m.id) === i).slice(0, 12),
      portion: oneOf(portionSizes, h.portion, "regular"), servingsMode: h.servingsMode === "fixed" ? "fixed" : "auto",
      fixedServings: int(h.fixedServings, servingLimits.min, servingLimits.max, 4) },
    dietary: { diets: subset(dietPatterns, di.diets), allergies: subset(allergens, di.allergies), customAllergies: terms(di.customAllergies),
      dislikes: choices(di.dislikes), favorites: choices(di.favorites),
      preferredCuisines: subset(cuisines, di.preferredCuisines), avoidCuisines: subset(cuisines, di.avoidCuisines) },
    kitchen: { devices: k.devices === null || k.devices === undefined ? null : subset(selectableDevices, k.devices) },
    cooking: { weekdayMax: minutes(c.weekdayMax), weekendMax: minutes(c.weekendMax), hardMax: bool(c.hardMax),
      weekday: prefs(c.weekday, c), weekend: prefs(c.weekend, c) },
    planning: { meals: subset(mealSlots, p.meals), cookingDays: int(p.cookingDays, 1, 7, 7), leftovers: oneOf(leftoverOptions, p.leftovers, "none"),
      repeatFavorites: bool(p.repeatFavorites), variety: oneOf(varietyOptions, p.variety, "balanced"), novelty: oneOf(noveltyOptions, p.novelty, "balanced"),
      mealRules: Object.fromEntries(mealSlots.map(m => [m, mealRule(obj(p.mealRules)[m])])) as Record<MealSlot, MealRule> },
    shopping: { budgetFriendly: bool(s.budgetFriendly), reuseIngredients: bool(s.reuseIngredients), pantry: terms(s.pantry) },
  };
}

type Store = Pick<Storage, "getItem" | "setItem">;
const browser = (): Store | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function loadSettings(store: Store | null = browser()): BasicSettings {
  try { return sanitizeSettings(JSON.parse(store?.getItem(settingsKey) ?? "null")); } catch { return defaultSettings(); }
}

/** Applies `change` to the LATEST stored settings (another tab may have saved since we read), then writes.
 * Throws when the browser refuses the write; nothing is changed in that case. */
export function updateSettings(change: (current: BasicSettings) => BasicSettings, store: Store | null = browser()): BasicSettings {
  if (!store) throw new Error("Storage unavailable");
  const current = loadSettings(store);
  const next = sanitizeSettings({ ...change(current), version: 2, rev: current.rev + 1 });
  store.setItem(settingsKey, JSON.stringify(next));
  return next;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";
/** Autosaving settings hook. On failure the attempted value stays on screen with status "error"; retry() re-applies it. */
export function useBasicSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef<((s: BasicSettings) => BasicSettings) | null>(null);
  const failed = useRef<((s: BasicSettings) => BasicSettings) | null>(null);
  const write = useCallback((change: (s: BasicSettings) => BasicSettings) => {
    pending.current = change;
    setStatus("saving");
    setTimeout(() => {
      try {
        const saved = updateSettings(change);
        if (pending.current === change) { pending.current = null; failed.current = null; setSettings(saved); setStatus("saved"); }
      } catch { if (pending.current === change) { failed.current = change; setStatus("error"); } }
    }, 0);
  }, []);
  const save = useCallback((change: (s: BasicSettings) => BasicSettings) => {
    setSettings(s => change(s)); // immediate feedback
    const earlier = failed.current; // an unsaved earlier change is still on screen: save it together with this one
    write(earlier ? s => change(earlier(s)) : change);
  }, [write]);
  const retry = useCallback(() => { if (failed.current) write(failed.current); }, [write]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === settingsKey && !pending.current && !failed.current) setSettings(loadSettings()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { settings, save, status, retry };
}

/** Read-only and live: picks up saves from another tab, and re-reads when this tab becomes visible again. */
export function useSavedSettings() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    const refresh = () => setSettings(previous => {
      const next = loadSettings();
      return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
    });
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return settings;
}

// ---- Derived values used across pages ----
export const availableDevices = (s: BasicSettings): DeviceId[] => s.kitchen.devices ?? [...selectableDevices];
/** Cooking-method filter choices: the person's devices plus No-cook. */
export const methodChoices = (devices: readonly string[]) =>
  plannerCookingMethods.filter(method => method === "No-cook" || devices.includes(method));
const portionFactor: Record<PortionSize, number> = { small: 0.75, regular: 1, large: 1.5 };
/** Servings to cook for: fixed, or each household member's portion (a member's own size wins). null = no household set up. */
export function householdServings(s: BasicSettings): number | null {
  if (s.household.servingsMode === "fixed") return s.household.fixedServings;
  if (!s.household.members.length) return null;
  const total = s.household.members.reduce((sum, m) => sum + portionFactor[m.portion ?? s.household.portion], 0);
  return Math.min(servingLimits.max, Math.max(1, Math.ceil(total)));
}
export const newMemberId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/[^A-Za-z0-9_-]/g, "");
export const emptyMember = (kind: Member["kind"], name: string): Member =>
  ({ id: newMemberId(), name, kind, diets: [], allergies: [], customAllergies: [], dislikes: [], favorites: [], portion: null });
