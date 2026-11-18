// Deterministic ingredient scaling. Only a leading quantity is scaled; anything
// ambiguous (other numbers in the line, unknown format) keeps the original text.
import { parseQuantity, vulgar } from "@shared/ingredient-parse";

const quantity = String.raw`(?:\d+\s*[${Object.keys(vulgar).join("")}]|[${Object.keys(vulgar).join("")}]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const leading = new RegExp(String.raw`^(\s*)(${quantity})(?:\s*(?:-|–|—|to)\s*(${quantity}))?(?=\s|[a-zA-Zа-яА-Я]|$)`);

const fractions: Array<[number, string]> = [[1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]];
export function formatQuantity(value: number): string {
  const whole = Math.floor(value + 1e-9), rest = value - whole;
  if (rest < 0.02) return String(whole);
  if (rest > 0.98) return String(whole + 1);
  const near = fractions.find(([fraction]) => Math.abs(rest - fraction) < 0.02);
  if (near) return whole ? `${whole} ${near[1]}` : near[1];
  return String(value >= 10 ? Math.round(value) : Math.round(value * 100) / 100);
}

/** Scale `text` by `factor`; returns the original text when it cannot be done reliably. */
export function scaleIngredient(text: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return text;
  const match = leading.exec(text);
  if (!match) return text;
  const rest = text.slice(match[0].length);
  if (/\d/.test(rest)) return text; // e.g. "1 x 400 g tin": scaling only the first number could mislead.
  const low = parseQuantity(match[2]);
  const high = match[3] ? parseQuantity(match[3]) : null;
  if (low === null || low <= 0 || (match[3] && (high === null || high <= 0))) return text;
  const scaled = formatQuantity(low * factor) + (high === null ? "" : `–${formatQuantity(high * factor)}`);
  return `${match[1]}${scaled}${rest}`;
}

/** Original serving count: "4", "4 servings", "4-6" (uses the lower bound), "12 muffins". */
export function baseServings(servings?: string | null): number | null {
  const match = /^\s*(\d{1,3})\b/.exec(servings ?? "");
  const value = match ? Number(match[1]) : 0;
  return value > 0 ? value : null;
}
export const servingLimits = { min: 1, max: 99 } as const;
export const servingFactor = (selected: number, base: number | null) => base ? selected / base : 1;
