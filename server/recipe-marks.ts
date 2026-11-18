import { and, eq } from "drizzle-orm";
import { recipeMarks } from "@shared/schema";

type Database = Omit<typeof import("./db").db, "$client">;
export type RecipeMarkKind = "liked" | "imported";
export type MyRecipes = { liked: string[]; imported: string[] };

/** Owner-scoped: which catalog recipes this owner liked or imported. */
export type RecipeMarkStore = {
  list(ownerId: string): Promise<MyRecipes>;
  add(ownerId: string, recipeId: string, kind: RecipeMarkKind): Promise<void>;
  remove(ownerId: string, recipeId: string, kind: RecipeMarkKind): Promise<void>;
};

export function databaseRecipeMarkStore(connection?: Database): RecipeMarkStore {
  const database = async () => connection ?? (await import("./db")).db;
  return {
    async list(ownerId) {
      const rows = await (await database()).select().from(recipeMarks).where(eq(recipeMarks.ownerId, ownerId))
        .orderBy(recipeMarks.createdAt);
      const ids = (kind: RecipeMarkKind) => rows.filter(row => row.kind === kind).map(row => row.recipeId).reverse();
      return { liked: ids("liked"), imported: ids("imported") };
    },
    async add(ownerId, recipeId, kind) {
      await (await database()).insert(recipeMarks).values({ ownerId, recipeId, kind }).onConflictDoNothing();
    },
    async remove(ownerId, recipeId, kind) {
      await (await database()).delete(recipeMarks).where(and(eq(recipeMarks.ownerId, ownerId),
        eq(recipeMarks.recipeId, recipeId), eq(recipeMarks.kind, kind)));
    },
  };
}
