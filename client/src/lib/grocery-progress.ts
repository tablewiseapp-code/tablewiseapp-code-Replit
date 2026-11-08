// Pure grocery completion/expansion rules plus the persisted preferences.
export type Expansion = Record<string, "open" | "closed">;
export type GroceryPrefs = { checked: Set<string>; expansion: Expansion };
export const groceryPrefsKey = "tablewise:grocery-list:v1";

export const categoryProgress = (keys: readonly string[], checked: ReadonlySet<string>) => {
  const done = keys.filter(key => checked.has(key)).length;
  return { total: keys.length, done, complete: keys.length > 0 && done === keys.length }; // an empty category is never complete
};
/** Only items that are on the current list count, so stale saved ticks cannot inflate progress. */
export const countChecked = (allKeys: readonly string[], checked: ReadonlySet<string>) => allKeys.filter(key => checked.has(key)).length;
export const isListComplete = (allKeys: readonly string[], checked: ReadonlySet<string>) => allKeys.length > 0 && countChecked(allKeys, checked) === allKeys.length;

/** A deliberate choice wins; otherwise a complete category is collapsed and an incomplete one is open. */
export const isCategoryCollapsed = (complete: boolean, override?: "open" | "closed") => override ? override === "closed" : complete;
/** The user flips whatever they currently see. */
export const toggleCategory = (expansion: Expansion, category: string, collapsedNow: boolean): Expansion => ({ ...expansion, [category]: collapsedNow ? "open" : "closed" });
/** Changing a checkbox ends any earlier manual choice for that category, so completion can auto-collapse again. */
export function toggleItem(checked: ReadonlySet<string>, expansion: Expansion, key: string, category: string) {
  const next = new Set(checked);
  if (next.has(key)) next.delete(key); else next.add(key);
  const { [category]: _dropped, ...rest } = expansion;
  return { checked: next, expansion: rest as Expansion };
}

export function readGroceryPrefs(): GroceryPrefs {
  const empty = { checked: new Set<string>(), expansion: {} as Expansion };
  try {
    const parsed = JSON.parse(localStorage.getItem(groceryPrefsKey) ?? "null");
    if (!parsed || typeof parsed !== "object") return empty;
    const checked = new Set<string>(Array.isArray(parsed.checked) ? parsed.checked.filter((v: unknown): v is string => typeof v === "string") : []);
    const expansion: Expansion = {};
    for (const [category, value] of Object.entries(parsed.expansion ?? {})) if (value === "open" || value === "closed") expansion[category] = value;
    return { checked, expansion };
  } catch { return empty; }
}
export function saveGroceryPrefs(prefs: GroceryPrefs) {
  try { localStorage.setItem(groceryPrefsKey, JSON.stringify({ checked: [...prefs.checked], expansion: prefs.expansion })); }
  catch { /* checks still work for this visit */ }
}
