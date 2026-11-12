import { and, eq, sql } from "drizzle-orm";
import { recipeGenerations, recipes, type RecipeDraftContent, type RecipeGeneration } from "@shared/schema";
import type { RecipeGenerationStatus } from "@shared/recipe-generation-request";
import { DatabaseStorage } from "./storage";
import { recipeInput } from "./request-schemas";

type Database = Omit<typeof import("./db").db, "$client">;
export type NewRecipeGeneration = Pick<RecipeGeneration, "ownerId" | "searchText" | "request" | "draft" | "model" | "promptVersion">;
export type ApprovalResult =
  | { kind: "published"; recipeId: string; created: boolean }
  | { kind: "not_found" }
  | { kind: "not_draft"; status: RecipeGenerationStatus };

export type RecipeDraftStore = {
  create(values: NewRecipeGeneration): Promise<RecipeGeneration>;
  /** Owner-scoped: another owner's draft reads as missing. */
  get(id: string, ownerId: string): Promise<RecipeGeneration | undefined>;
  /** Replaces the content of an owner's draft that is still a draft. `regenerated` counts another AI attempt. */
  replaceDraft(id: string, ownerId: string, draft: RecipeDraftContent, regenerated: boolean): Promise<RecipeGeneration | undefined>;
  approve(id: string, ownerId: string): Promise<ApprovalResult>;
};

/** The client-facing view: never the owner or approver identity. */
export const draftView = (row: RecipeGeneration) => ({
  id: row.id, status: row.status, recipeName: row.searchText, request: row.request,
  recipe: row.draft.recipe, description: row.draft.description, tip: row.draft.tip, violations: row.draft.violations ?? [],
  recipeId: row.recipeId, model: row.model, attempts: row.attempts,
  createdAt: row.createdAt, updatedAt: row.updatedAt, publishedAt: row.publishedAt,
});

export function databaseDraftStore(connection?: Database): RecipeDraftStore {
  const database = async () => connection ?? (await import("./db")).db;
  const owned = (id: string, ownerId: string) => and(eq(recipeGenerations.id, id), eq(recipeGenerations.ownerId, ownerId));
  return {
    async create(values) {
      const db = await database();
      const [row] = await db.insert(recipeGenerations).values(values).returning();
      return row;
    },
    async get(id, ownerId) {
      const db = await database();
      const [row] = await db.select().from(recipeGenerations).where(owned(id, ownerId));
      return row;
    },
    async replaceDraft(id, ownerId, draft, regenerated) {
      const db = await database();
      const [row] = await db.update(recipeGenerations).set({
        draft, updatedAt: new Date(), ...(regenerated ? { attempts: sql`${recipeGenerations.attempts} + 1` } : {}),
      }).where(and(owned(id, ownerId), eq(recipeGenerations.status, "draft"))).returning();
      return row;
    },
    // Publication service. The row lock serializes concurrent approvals; a repeated approval returns the same recipe.
    async approve(id, ownerId) {
      const db = await database();
      return db.transaction(async tx => {
        const [row] = await tx.select().from(recipeGenerations).where(owned(id, ownerId)).for("update");
        if (!row) return { kind: "not_found" } as const;
        if (row.status === "published" && row.recipeId) return { kind: "published", recipeId: row.recipeId, created: false } as const;
        if (row.status !== "draft") return { kind: "not_draft", status: row.status } as const;
        const content = recipeInput.parse(row.draft.recipe); // re-validated: stored content is never trusted blindly
        // An identical recipe (same title and ingredient lines) is linked rather than published twice.
        const [duplicate] = await tx.select({ id: recipes.id }).from(recipes).where(and(
          sql`lower(${recipes.title}) = lower(${content.title})`,
          sql`${recipes.ingredients} = ${sql.param(content.ingredients, recipes.ingredients)}`,
        )).limit(1);
        const recipeId = duplicate?.id ?? (await new DatabaseStorage(tx as unknown as Database).createRecipe(content)).id;
        // V1: customer approval publishes immediately. Moderation later: set "pending_review" here (no recipe
        // insert) and move the insert + "published" into the admin approval action.
        const now = new Date();
        await tx.update(recipeGenerations).set({
          status: "published", recipeId, approvedBy: ownerId, approvedAt: now, publishedAt: now, updatedAt: now,
        }).where(eq(recipeGenerations.id, row.id));
        return { kind: "published", recipeId, created: !duplicate } as const;
      });
    },
  };
}
