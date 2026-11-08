import { z } from "zod";
import { plannerCookingMethods } from "../client/src/lib/planner-filters";
import type { RecipeGenerationContext } from "./recipe-generation";
import type { BudgetPreference, GenerationStyle } from "../client/src/lib/recipe-generation";

// Compact, derived signals the browser may send. Never raw activity logs, never personal details.
export const personalizationSignals = z.object({
  recentTitles: z.array(z.string().trim().min(1).max(200)).max(8),
  favoriteMethods: z.array(z.object({ method: z.enum(plannerCookingMethods), count: z.number().int().min(1).max(1000) }).strict()).max(4),
}).strict();
export type PersonalizationSignals = z.infer<typeof personalizationSignals>;

export type PreferenceGuidance = {
  learnedPreferences: { cookingMethods?: { value: string; evidence: string; confidence: "low" | "medium" }[] };
  recommendationStrategy: { avoidTitles?: string[]; variety?: string };
};

/**
 * The Preference Intelligence seam. Today: deterministic rules below.
 * Later: an AI reasoning step with the same signature (async, server-side), with no UI or storage change.
 */
export type PreferenceAnalyzer = (signals: PersonalizationSignals | undefined, context: RecipeGenerationContext) => Promise<PreferenceGuidance>;

export const analyzePreferences: PreferenceAnalyzer = async (signals, context) => {
  const guidance: PreferenceGuidance = { learnedPreferences: {}, recommendationStrategy: {} };
  if (!signals) return guidance; // no history: explicit filters only
  // An explicit cooking-method filter always wins; learned methods need at least 2 favourites as evidence.
  const explicitMethod = context.filterSet === "meals" && context.filters.cookingMethod.length > 0;
  const methods = explicitMethod ? [] : signals.favoriteMethods.filter(m => m.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map(m => ({ value: m.method, evidence: `favorited ${m.count} AI ideas using it`, confidence: m.count >= 4 ? "medium" as const : "low" as const }));
  if (methods.length) guidance.learnedPreferences.cookingMethods = methods;
  if (signals.recentTitles.length) {
    guidance.recommendationStrategy.avoidTitles = signals.recentTitles;
    guidance.recommendationStrategy.variety = "Offer a dish clearly different from the recent ideas.";
  }
  return guidance;
};

export const PROMPT_VERSION = "recipe-generation/3";

const styleGuidance: Record<GenerationStyle, string> = {
  surprise_me: "Something fresh and different: an approachable new combination, clearly unlike avoidTitles, still practical for a home cook.",
  quick_easy: "Less effort, fewer steps: simple methods, minimal active prep, common ingredients, no tricky techniques, little cleanup.",
  chefs_touch: "A little more special: more refined flavour pairings and one or two thoughtful techniques for seasoning, texture and presentation, with instructions a home cook can follow.",
  family_favorite: "Comforting and crowd-pleasing: familiar flavours, easy to share at the table, no unnecessary complexity.",
  try_something_new: "Explore new flavours: draw on a cuisine or flavour combination the cook may not know, using ingredients found in a regular supermarket; clearly unlike avoidTitles.",
};
const budgetGuidance: Record<BudgetPreference, string> = {
  everyday: "Reasonably priced, widely available ingredients; at most one modest special ingredient.",
  save_more: "Affordable staples, few ingredients, use whole packages and leftovers to minimise waste.",
  flexible: "Premium ingredients are fine when they clearly improve the dish.",
};

/** The generation context the model receives. Hard constraints always win; style and budget only shape soft choices. */
export function buildGenerationBrief(
  context: RecipeGenerationContext, guidance?: PreferenceGuidance,
  style: GenerationStyle = "surprise_me", budget: BudgetPreference = "everyday",
) {
  return {
    hardConstraints: context,
    explicitPreferences: {}, // no explicit preference settings exist yet; dietary/allergy needs stay in hard filters
    learnedPreferences: guidance?.learnedPreferences ?? {},
    mealContext: {},
    generationStyle: style,
    budgetPreference: budget,
    recommendationStrategy: { ...guidance?.recommendationStrategy, style: styleGuidance[style], budget: budgetGuidance[budget] },
  };
}
