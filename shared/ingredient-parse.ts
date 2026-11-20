import { z } from "zod";

// Deterministic ingredient-line parsing for manual import. No AI: a line the rules cannot read
// confidently is kept exactly as written, and parsing never blocks a save.

export const vulgar: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8 };
const v = Object.keys(vulgar).join("");

/** "2", "2.5", "2,5", "1/2", "½", "1 1/2", "1 ½", "1½" → number; anything else → null. */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  const unicode = new RegExp(String.raw`^(\d+)?\s*([${v}])$`).exec(text);
  if (unicode) return Number(unicode[1] ?? 0) + vulgar[unicode[2]];
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text) ?? /^()(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[3]) ? Number(mixed[1] || 0) + Number(mixed[2]) / Number(mixed[3]) : null;
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

// Canonical unit → [singular label, plural label, accepted spellings]. Stored as the key; shown as a label.
export const unitTable = {
  g: ["g", "g", ["g", "gr", "grs", "gram", "grams", "gramme", "grammes"]],
  kg: ["kg", "kg", ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "kilogramme", "kilogrammes"]],
  oz: ["oz", "oz", ["oz", "ounce", "ounces"]],
  lb: ["lb", "lb", ["lb", "lbs", "pound", "pounds"]],
  ml: ["mL", "mL", ["ml", "mls", "milliliter", "milliliters", "millilitre", "millilitres"]],
  l: ["L", "L", ["l", "liter", "liters", "litre", "litres"]],
  cup: ["cup", "cups", ["cup", "cups"]],
  tsp: ["tsp", "tsp", ["tsp", "tsps", "teaspoon", "teaspoons"]],
  tbsp: ["tbsp", "tbsp", ["tbsp", "tbsps", "tbs", "tbls", "tbl", "tablespoon", "tablespoons"]],
  "fl oz": ["fl oz", "fl oz", ["fl oz", "fl. oz", "fl.oz", "floz", "fluid ounce", "fluid ounces"]],
  piece: ["piece", "pieces", ["piece", "pieces", "pc", "pcs"]],
  clove: ["clove", "cloves", ["clove", "cloves"]],
  slice: ["slice", "slices", ["slice", "slices"]],
} as const;
export type IngredientUnit = keyof typeof unitTable;
const unitKeys = Object.keys(unitTable) as [IngredientUnit, ...IngredientUnit[]];

const spellings = Object.entries(unitTable)
  .flatMap(([key, [, , names]]) => names.map(name => [name, key as IngredientUnit] as const))
  .sort((a, b) => b[0].length - a[0].length); // "fl oz" before "oz", "tbsp" before "tbs"
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, String.raw`\s*`);
// An optional abbreviation dot, then the end of the line, a space or light punctuation, so "2 lemons" is never "2 l".
const unitPattern = new RegExp(String.raw`^(${spellings.map(([name]) => escape(name)).join("|")})\.?(?=$|[\s,;:)])`, "i");
const unitOf = (spelled: string) => spellings.find(([name]) =>
  new RegExp(`^${escape(name)}$`, "i").test(spelled))![1];

const quantityPattern = new RegExp(String.raw`^(\d+\s+\d+\/\d+|\d+\s*[${v}]|[${v}]|\d+\/\d+|\d+(?:\.\d+|,\d{1,2}(?!\d))?)`);

export const ingredientPartSchema = z.object({
  originalText: z.string().trim().min(1).max(1000),
  quantity: z.number().positive().finite().nullable(),
  unit: z.enum(unitKeys).nullable(),
  ingredient: z.string().max(1000),
}).strict();
export type IngredientPart = z.infer<typeof ingredientPartSchema>;
export type ParsedIngredient = IngredientPart & { display: string };

function displayQuantity(token: string, quantity: number): string {
  if (!/[/\u00BC-\u00BE\u2150-\u215E]/.test(token)) return String(quantity); // whole number or decimal: as entered
  const whole = Math.floor(quantity + 1e-9), rest = quantity - whole;
  if (rest < 1e-9) return String(whole);
  const fraction = Object.entries(vulgar).find(([, value]) => Math.abs(value - rest) < 1e-6)?.[0];
  return fraction ? `${whole || ""}${fraction}` : token.replace(/\s+/g, " ");
}

/** One line → its parts and the text TableWise shows. Unclear lines keep their text unchanged. */
export function parseIngredientLine(line: string): ParsedIngredient {
  const originalText = line.trim();
  const asWritten: ParsedIngredient = { originalText, quantity: null, unit: null, ingredient: originalText, display: originalText };
  const token = quantityPattern.exec(originalText)?.[1];
  const quantity = token ? parseQuantity(token) : null;
  if (!token || !quantity || quantity <= 0) return asWritten;
  const rest = originalText.slice(token.length);
  const spelled = unitPattern.exec(rest.trimStart());
  let unit: IngredientUnit | null = null, ingredient: string;
  if (spelled) {
    unit = unitOf(spelled[1]);
    ingredient = rest.trimStart().slice(spelled[0].length).trim().replace(/^of\s+/i, "");
  } else if (rest === "" || (/^\s+\p{L}/u.test(rest) && !/\d/.test(rest))) {
    ingredient = rest.trim(); // a count: "2 eggs", "2 scoops protein powder"
  } else return asWritten; // "2-3 eggs", "7up", "1 x 400 g tin" stay as written
  if (/^(?:to|or)\s+\d/i.test(ingredient)) return asWritten; // a range such as "2 to 3 eggs"
  const label = unit ? unitTable[unit][quantity > 1 ? 1 : 0] : "";
  const display = [displayQuantity(token, quantity), label, ingredient].filter(Boolean).join(" ");
  return { originalText, quantity, unit, ingredient, display };
}

/** Text with one ingredient per line → parsed lines in order, ignoring empty lines. */
export const parseIngredients = (text: string) => text.split("\n").filter(line => line.trim()).map(parseIngredientLine);
