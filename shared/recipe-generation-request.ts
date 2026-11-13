import { z } from "zod";
import {
  plannerCookingMethods, plannerDietary, plannerMealTypes, plannerProteinTypes, plannerServings,
} from "../client/src/lib/planner-filters";

// The Meals page (/meals) filter set, as sent for AI generation. Personal filters (picks, ratings, notes, source)
// describe existing recipes only and are never part of a generation request.
const terms = z.array(z.string().min(1).max(200)).max(50);
const set = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).max(values.length);
export const mealsFilterSchema = z.object({
  /** Minutes. Measures preparation or prep + cooking, per the request's timeMode. null = no limit. */
  maxMinutes: z.union([z.literal(20), z.literal(30), z.literal(40), z.literal(60), z.null()]), // = plannerTimeOptions
  dietary: set(plannerDietary), mealType: set(plannerMealTypes), cookingMethod: set(plannerCookingMethods),
  proteinType: set(plannerProteinTypes), servings: z.enum(plannerServings).nullable(),
  mustInclude: terms, mustExclude: terms,
}).strict();

/**
 * Versioned contract for "generate this named recipe" (search → no match → generate).
 * Empty arrays and null mean "no restriction". Bump schemaVersion (and accept a union) for breaking changes.
 */
export const RECIPE_GENERATION_SCHEMA_VERSION = 1;
export const recipeGenerationRequest = z.object({
  schemaVersion: z.literal(RECIPE_GENERATION_SCHEMA_VERSION),
  recipeName: z.string().trim().min(2).max(120).transform(name => name.replace(/\s+/g, " ")),
  filters: mealsFilterSchema,
  timeMode: z.enum(["preparation", "total"]),
  source: z.literal("recipe_search"),
}).strict();
export type RecipeGenerationRequest = z.infer<typeof recipeGenerationRequest>;

export const recipeGenerationStatuses = ["draft", "pending_review", "changes_requested", "rejected", "published", "unpublished"] as const;
export type RecipeGenerationStatus = typeof recipeGenerationStatuses[number];
