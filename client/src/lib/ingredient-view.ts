import { ingredientGroup, ingredientGroupOrder, type IngredientGroup } from "./ingredient-groups";

export const ingredientViews = ["order", "category"] as const;
export type IngredientView = typeof ingredientViews[number];
export const ingredientViewKey = "tablewise:ingredient-view:v1";
export type IngredientRow = { id: string; text: string; original: string };

export function readIngredientView(): IngredientView {
  try { return localStorage.getItem(ingredientViewKey) === "category" ? "category" : "order"; } catch { return "order"; }
}
export function saveIngredientView(view: IngredientView) {
  try { localStorage.setItem(ingredientViewKey, view); } catch { /* preference only */ }
}

/** Rows keep stored order. Ids come from the original text (+ occurrence for duplicates), so they survive scaling and view changes. */
export function ingredientRows(original: readonly string[], scaled: readonly string[]): IngredientRow[] {
  const seen = new Map<string, number>();
  return original.map((text, index) => {
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    return { id: `${text}#${n}`, text: scaled[index] ?? text, original: text };
  });
}

/** Presentation only: category mode groups a copy of the rows; the input order is never changed. */
export function ingredientSections(rows: readonly IngredientRow[], view: IngredientView): Array<{ category: IngredientGroup | null; rows: IngredientRow[] }> {
  if (view === "order") return [{ category: null, rows: [...rows] }];
  return ingredientGroupOrder
    .map(category => ({ category, rows: rows.filter(row => ingredientGroup(row.original) === category) }))
    .filter(section => section.rows.length > 0);
}
