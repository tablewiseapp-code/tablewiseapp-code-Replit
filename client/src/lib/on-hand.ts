// Cook with what I have: proteins on hand → recipe choice and grocery amounts. Pure and deterministic (no AI, no storage).
// Restrictions stay with checkEligibility; proteins on hand only narrow (Home) or order (the Week's draft) the eligible recipes.
import { parseIngredientLine } from "@shared/ingredient-parse";
import { mentionsTerm } from "@shared/food-rules";
import { ingredientGroup } from "./ingredient-groups";
import { groceryMeasure, groceryQuantityText, optional, type RecipeGroceryRow } from "./grocery-meal-removal";
import type { EngineRecipe } from "./preference-engine";

/** An amount in the grocery list's units: g and ml (kg and L converted), another unit, or null for a count ("6 eggs"). */
export type Amount = { quantity: number; unit: string | null };
/** One protein on hand. `covered`: per grocery row (its key), the quantity the person confirmed they have enough for
 * (null for a row with no quantity). */
export type OnHandItem = { name: string; amount: Amount | null; covered?: Record<string, number | null> };
/** Stored on the Week (week_plans.on_hand): what "Use selected proteins" confirmed. */
export type OnHand = { items: OnHandItem[]; minimize: boolean };

/** "600 g", "1 kg", "6 eggs", "6" → an amount; null when there is no leading number. */
export function parseAmount(text: string): Amount | null {
  const parsed = parseIngredientLine(text);
  if (parsed.quantity === null) return null;
  const big = parsed.unit === "kg" || parsed.unit === "l";
  return { quantity: parsed.quantity * (big ? 1000 : 1), unit: parsed.unit === "kg" ? "g" : parsed.unit === "l" ? "ml" : parsed.unit };
}
export const amountText = (amount: Amount) => groceryQuantityText({ unit: amount.unit, name: "" } as ReturnType<typeof groceryMeasure>, amount.quantity);

/** The lines a recipe needs: not optional, not a garnish. */
const required = (r: Pick<EngineRecipe, "ingredients">) => r.ingredients.filter(line => !optional.test(line));
/** A protein is used when a needed line names it, other than a stock or sauce ("chicken stock" is not chicken). */
export const usesProtein = (r: Pick<EngineRecipe, "ingredients">, name: string) =>
  mentionsTerm(name, required(r).filter(line => ingredientGroup(line) !== "seasonings"));

/** An ingredient type, from its name: "2 cups rice, rinsed" → "rice". ponytail: name words only, so "cooked rice" and
 * "rice" are two types; use catalog ingredient ids when recipes have them. */
export const ingredientType = (line: string) => groceryMeasure(line).name.toLowerCase().split(/[,(]/)[0]
  .replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).map(w => w.replace(/(ies|es|s)$/, "")).join(" ");
/** How many ingredient types the recipe adds to the shopping: those not in `have` and not a protein on hand. */
export const newItems = (r: Pick<EngineRecipe, "ingredients">, have: ReadonlySet<string>, names: readonly string[]) =>
  new Set(required(r).filter(line => !names.some(n => mentionsTerm(n, [line]))).map(ingredientType).filter(t => t && !have.has(t))).size;
/** The ingredient types already on the active grocery list (recipe rows and products added by hand). */
export const typesOf = (lines: Iterable<string>) => new Set([...lines].map(ingredientType));

/** Fewest new grocery items first, then a recipe using a protein on hand, then the incoming order. */
function byGroceries<T extends EngineRecipe>(list: readonly T[], have: ReadonlySet<string>, names: readonly string[]): T[] {
  return list.map((r, i) => ({ r, i, n: newItems(r, have, names), uses: names.some(n => usesProtein(r, n)) }))
    .sort((a, b) => a.n - b.n || Number(b.uses) - Number(a.uses) || a.i - b.i).map(x => x.r);
}

export type FindResult<T> = { recipes: T[]; noMatch: "restrictions" | "required" | "proteins" | null };
/** Home: eligible recipes (in `eligible` order, already through checkEligibility) using at least one protein on hand.
 * A required protein (Must include) must be used. Minimize groceries orders by fewest new grocery items. */
export function findWithWhatIHave<T extends EngineRecipe>(eligible: readonly T[], proteins: { name: string; required?: boolean }[],
  { minimize = false, have = new Set<string>() }: { minimize?: boolean; have?: ReadonlySet<string> } = {}): FindResult<T> {
  const names = proteins.map(p => p.name);
  const musts = proteins.filter(p => p.required).map(p => p.name);
  const withRequired = eligible.filter(r => musts.every(n => usesProtein(r, n)));
  const found = withRequired.filter(r => names.some(n => usesProtein(r, n)));
  const recipes = minimize ? byGroceries(found, have, names) : found;
  return { recipes, noMatch: recipes.length ? null : !eligible.length ? "restrictions" : !withRequired.length ? "required" : "proteins" };
}

/** The Week's draft: among the options for one day, a recipe using a protein not yet used by an earlier dish comes first;
 * with Minimize groceries, fewest new items first (each ingredient counted once across the week, as `chosen` grows). */
export function preferOnHand<T extends EngineRecipe>(onHand: OnHand, have: ReadonlySet<string> = new Set()) {
  const names = onHand.items.map(i => i.name);
  return (options: T[], chosen: readonly EngineRecipe[]): T[] => {
    const open = names.filter(n => !chosen.some(r => usesProtein(r, n)));
    if (onHand.minimize) return byGroceries(options, new Set([...have, ...chosen.flatMap(r => required(r).map(ingredientType))]), open.length ? open : names);
    const uses = (r: T) => open.some(n => usesProtein(r, n));
    return [...options.filter(uses), ...options.filter(r => !uses(r))];
  };
}

/** Last week's bought proteins: distinct protein names among the recorded purchases (grocery progress keys). */
export function boughtProteins(checked: Iterable<string>, extras: readonly { id: string; text: string }[] = []): string[] {
  const texts = [...checked].map(key => {
    if (!key.startsWith("extra:")) return key;
    const [, id, ...rest] = key.split(":");
    return rest.length ? rest.join(":") : extras.find(e => e.id === id)?.text ?? "";
  });
  const names = texts.filter(text => text && ingredientGroup(text) === "protein").map(text => groceryMeasure(text).name.toLowerCase().split(",")[0].trim());
  return [...new Set(names.filter(Boolean))];
}

/** What the grocery list asks about a row a protein on hand matches. unknown: amount skipped ("Do you have enough?");
 * units: the amount cannot be compared (2 thighs vs 600 g); more: demand grew beyond what was confirmed. */
export type OnHandReview = { item: number; kind: "unknown" | "units" | "more"; demand: number | null };

/** The grocery rows after the proteins on hand: a known compatible amount is subtracted once across the rows it matches;
 * a skipped or incompatible amount keeps the whole demand visible with a review, until confirmed. Rows left at zero go. */
export function applyOnHand(rows: ReadonlyMap<string, RecipeGroceryRow>, onHand: OnHand | null | undefined) {
  const out = new Map(rows);
  const reviews = new Map<string, OnHandReview>();
  onHand?.items.forEach((item, index) => {
    let left = item.amount?.quantity ?? 0;
    for (const [key, row] of rows) {
      if (!out.has(key) || ingredientGroup(row.ingredient) === "seasonings") continue;
      const measure = groceryMeasure(row.ingredient);
      if (!mentionsTerm(item.name, [measure.name])) continue;
      let need = measure.quantity;
      if (item.amount && need !== null && measure.unit === item.amount.unit) {
        const take = Math.min(left, need);
        left -= take; need -= take;
      } else {
        const covered = item.covered?.[key];
        if (covered === undefined) { reviews.set(key, { item: index, kind: item.amount ? "units" : "unknown", demand: need }); continue; }
        need = need === null || covered === null ? 0 : Math.max(0, need - covered);
        if (need > 1e-7) reviews.set(key, { item: index, kind: "more", demand: measure.quantity });
      }
      if (need === null || need < 1e-7) out.delete(key);
      else if (need !== measure.quantity) out.set(key, { ...row, ingredient: groceryQuantityText(measure, need) });
    }
  });
  return { rows: out, reviews };
}
