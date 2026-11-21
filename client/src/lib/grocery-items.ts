import { groceryMeasure, remainingGroceryText, type RecipeGroceryRow } from "./grocery-meal-removal";

export type Extra = { id: string; text: string; image?: string | null; category?: string | null };
export type ShoppingPreference = { key: string; skipped: boolean; priceCents: number | null; priceText: string | null };
export type ShoppingRow = { ingredient: string; recipes: string[]; key: string; image?: string | null; extraId?: string; category?: string | null; proteinRecipes?: Set<string> };

export const groceryShoppingQueryKey = ["/api/grocery-shopping"] as const;

export function buildShoppingList(
  recipeRows: Map<string, RecipeGroceryRow>,
  extras: Extra[],
  checkedItems: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
) {
  const recipePurchases = [...checkedItems].filter(key => {
    if (key.startsWith("extra:")) return false;
    return recipeRows.has(groceryMeasure(key).identity) || !extras.some(extra => extra.text.toLowerCase() === key);
  });
  const activeRows: ShoppingRow[] = [...recipeRows].flatMap(([key, row]) => {
    const ingredient = remainingGroceryText(row.ingredient, recipePurchases);
    return ingredient && !skipped.has(key) ? [{ ...row, ingredient, key }] : [];
  });
  const manualRows = extras.map(extra => ({
    key: `extra:${extra.id}`, ingredient: extra.text, recipes: [], extraId: extra.id, image: extra.image, category: extra.category,
  }));
  const purchasedRows: { key: string; ingredient: string }[] = recipePurchases.map(key => ({ key, ingredient: key }));
  for (const row of manualRows) {
    const partialPrefix = `${row.key}:`;
    const partialKey = [...checkedItems].find(key => key.startsWith(partialPrefix));
    const legacyChecked = !recipeRows.has(groceryMeasure(row.ingredient).identity) &&
      manualRows.find(item => item.ingredient.toLowerCase() === row.ingredient.toLowerCase())?.key === row.key &&
      checkedItems.has(row.ingredient.toLowerCase());
    if (checkedItems.has(row.key) || legacyChecked) {
      purchasedRows.push({ ...row, key: legacyChecked ? row.ingredient.toLowerCase() : row.key });
    } else if (partialKey) {
      const purchasedText = partialKey.slice(partialPrefix.length);
      const ingredient = remainingGroceryText(row.ingredient, [purchasedText]);
      purchasedRows.push({ key: partialKey, ingredient: purchasedText });
      if (ingredient) activeRows.push({ ...row, ingredient });
    } else activeRows.push(row);
  }
  return { activeRows, manualRows, purchasedRows, recipePurchases };
}
