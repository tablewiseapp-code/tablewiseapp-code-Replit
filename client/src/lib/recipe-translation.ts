// A recipe's text in the reader's language, from recipe_translations. No row for a recipe means its
// original text is shown. Ingredient translations hold names only when the recipe has ingredient_parts:
// the line is then rebuilt from the stored quantity, a unit label in the reader's language and the name.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Recipe, RecipeTranslation } from "@shared/schema";
import { unitTable, type IngredientUnit } from "@shared/ingredient-parse";
import { formatQuantity } from "./ingredient-scale";
import { useI18n, type Language } from "./i18n";

// [singular, plural]. Russian uses abbreviations so they never change with the number.
const units: Record<"ru" | "he", Record<IngredientUnit, [string, string]>> = {
  ru: { g: ["г", "г"], kg: ["кг", "кг"], oz: ["унц.", "унц."], lb: ["фунт.", "фунт."], ml: ["мл", "мл"], l: ["л", "л"],
    cup: ["стак.", "стак."], tsp: ["ч. л.", "ч. л."], tbsp: ["ст. л.", "ст. л."], "fl oz": ["жидк. унц.", "жидк. унц."],
    piece: ["шт.", "шт."], clove: ["зуб.", "зуб."], slice: ["ломт.", "ломт."] },
  he: { g: ["גרם", "גרם"], kg: ['ק"ג', 'ק"ג'], oz: ["אונקיה", "אונקיות"], lb: ["ליברה", "ליברות"], ml: ['מ"ל', 'מ"ל'], l: ["ליטר", "ליטר"],
    cup: ["כוס", "כוסות"], tsp: ["כפית", "כפיות"], tbsp: ["כף", "כפות"], "fl oz": ["אונקיה נוזלית", "אונקיות נוזליות"],
    piece: ["יחידה", "יחידות"], clove: ["שן", "שיניים"], slice: ["פרוסה", "פרוסות"] },
};
const unitLabel = (unit: IngredientUnit, quantity: number, lang: Language) =>
  (lang === "en" ? unitTable[unit] : units[lang][unit])[quantity > 1 ? 1 : 0];

/** Every translation into the reader's language, by recipe id. */
export function useRecipeTranslations(): Map<string, RecipeTranslation> {
  const { lang } = useI18n();
  const { data } = useQuery<RecipeTranslation[]>({ queryKey: ["/api/recipes/translations", lang], staleTime: 5 * 60_000 });
  return useMemo(() => new Map((data ?? []).map(row => [row.recipeId, row])), [data]);
}

export type RecipeText = { title: string; ingredients: string[]; steps: string[]; translatedBy: RecipeTranslation["translatedBy"] | null };

export function recipeText(recipe: Pick<Recipe, "title" | "ingredients" | "steps" | "ingredientParts">,
  translation: RecipeTranslation | undefined, lang: Language): RecipeText {
  // A translation made before the recipe's lines changed no longer lines up: show the original.
  if (!translation || translation.ingredients.length !== recipe.ingredients.length || translation.steps.length !== recipe.steps.length)
    return { title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps, translatedBy: null };
  const parts = recipe.ingredientParts?.length === translation.ingredients.length ? recipe.ingredientParts : null;
  const ingredients = translation.ingredients.map((name, i) => {
    const part = parts?.[i];
    if (!part || part.quantity === null) return name;
    return [formatQuantity(part.quantity), part.unit && unitLabel(part.unit, part.quantity, lang), name].filter(Boolean).join(" ");
  });
  return { title: translation.title, ingredients, steps: translation.steps, translatedBy: translation.translatedBy };
}
