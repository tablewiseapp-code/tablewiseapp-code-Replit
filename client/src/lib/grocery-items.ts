import { parseIngredientLine } from "@shared/ingredient-parse";
import { groceryMeasure, remainingGroceryText, type RecipeGroceryRow } from "./grocery-meal-removal";

export type Extra = { id: string; text: string; image?: string | null; category?: string | null };
export type ShoppingPreference = { key: string; skipped: boolean; priceCents: number | null; priceText: string | null; quantity: string | null };
/** `listed` is the item as it stands on this list (after a shopper's quantity edit), before any purchase. */
export type ShoppingRow = { ingredient: string; recipes: string[]; key: string; image?: string | null; extraId?: string; category?: string | null; proteinRecipes?: Set<string>; listed?: string };

/** Edits and removals of recipe items belong to one week's list; manual items are on every list until removed. */
export const shoppingKey = (week: string, rowKey: string) => rowKey.startsWith("extra:") ? rowKey : `${week}|${rowKey}`;

/** The item with the shopper's quantity ("500 g", "2", "1/2 cup") in place of its own. */
export function withQuantity(text: string, quantity: string) {
  const name = parseIngredientLine(text).ingredient || text;
  return `${quantity.trim()} ${name}`;
}

/** The current quantity and unit of an item as the editor shows it ("10", "500 g", "½ cup"); "" when it has none. */
export function quantityOf(text: string) {
  const parsed = parseIngredientLine(text);
  return parsed.quantity === null || !parsed.ingredient ? "" : parsed.display.slice(0, parsed.display.length - parsed.ingredient.length).trim();
}

/** What to buy, and the preparation that stays in the item details: "potatoes, peeled and diced" → potatoes + "peeled and diced". */
export function splitPreparation(name: string) {
  const match = /^(.+?)\s*(?:,\s*(.+)|\((.+)\))\s*$/.exec(name);
  return match ? { product: match[1], preparation: (match[2] ?? match[3]).trim() } : { product: name, preparation: "" };
}

// ponytail: sample walk-in prices from the item name and unit (stable per item), until a store price source exists.
function sampleRate(name: string, unit: string | null) {
  let hash = 0;
  for (const char of `${name.toLowerCase()}|${unit ?? ""}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  if (unit === "g" || unit === "ml") return (30 + hash % 150) / 100; // 0.3–1.8 ¢ per g or mL
  return unit ? 25 + hash % 250 : 50 + hash % 350; // per cup, tbsp, lb…; per item for counts
}

/** Estimated cents for an item as listed, or null when unknown. `original` is the recipe or added text: a quantity
 * the shopper changed to another unit (or to no number) has no estimate. A saved price for exactly this text wins. */
export function samplePrice(text: string, original = text, saved?: { priceCents: number | null; priceText: string | null }) {
  if (saved?.priceText === text && saved.priceCents !== null) return saved.priceCents;
  const measure = groceryMeasure(text);
  if (measure.quantity === null || measure.unit !== groceryMeasure(original).unit) return null;
  return Math.max(25, Math.round(sampleRate(measure.name, measure.unit) * measure.quantity));
}

export const groceryShoppingQueryKey = ["/api/grocery-shopping"] as const;

export function buildShoppingList(
  recipeRows: Map<string, RecipeGroceryRow>,
  extras: Extra[],
  checkedItems: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
  quantities: ReadonlyMap<string, string> = new Map(),
) {
  const listed = (key: string, text: string) => quantities.has(key) ? withQuantity(text, quantities.get(key)!) : text;
  const recipePurchases = [...checkedItems].filter(key => {
    if (key.startsWith("extra:")) return false;
    return recipeRows.has(groceryMeasure(key).identity) || !extras.some(extra => extra.text.toLowerCase() === key);
  });
  const activeRows: ShoppingRow[] = [...recipeRows].flatMap(([key, row]) => {
    const text = listed(key, row.ingredient);
    const ingredient = remainingGroceryText(text, recipePurchases);
    return ingredient && !skipped.has(key) ? [{ ...row, ingredient, key, listed: text }] : [];
  });
  const manualRows: ShoppingRow[] = extras.map(extra => {
    const text = listed(`extra:${extra.id}`, extra.text);
    return { key: `extra:${extra.id}`, ingredient: text, listed: text, recipes: [], extraId: extra.id, image: extra.image, category: extra.category };
  });
  // A removed item is never shown as bought.
  const purchasedRows: { key: string; ingredient: string }[] = recipePurchases
    .filter(key => !skipped.has(groceryMeasure(key).identity)).map(key => ({ key, ingredient: key }));
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
