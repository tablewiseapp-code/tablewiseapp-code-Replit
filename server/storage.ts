import { type User, type InsertUser, type Recipe, type InsertRecipe, users, recipes } from "@shared/schema";
import { eq, desc, getTableColumns, sql } from "drizzle-orm";
import { recipeInput, recipePatch } from "./request-schemas";
import { recipeCreditInput } from "../shared/recipe-credit";
import type { z } from "zod";

// JSON row lookup returns NULL if the additive column has not been installed.
// Public reads stay compatible with the existing production schema.
const recipeColumns = {
  ...getTableColumns(recipes),
  prepTime: sql<number | null>`(to_jsonb(${recipes})->>'prep_time')::integer`,
  creditKind: sql<"chef" | "mine" | null>`to_jsonb(${recipes})->>'credit_kind'`,
  creditName: sql<string | null>`to_jsonb(${recipes})->>'credit_name'`,
};

export function isMissingPreparationColumn(error: unknown): boolean {
  const value = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const databaseError = value?.cause ?? value;
  return databaseError?.code === "42703" && Boolean(databaseError.message?.includes("prep_time"));
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAllRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  updateRecipeCredit(id: string, credit: z.input<typeof recipeCreditInput>): Promise<Recipe | undefined>;
  deleteRecipe(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  constructor(private readonly connection?: Omit<typeof import("./db").db, "$client">) {}

  private async database() {
    return this.connection ?? (await import("./db")).db;
  }

  async getUser(id: string): Promise<User | undefined> {
    const db = await this.database();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const db = await this.database();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const db = await this.database();
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllRecipes(): Promise<Recipe[]> {
    const db = await this.database();
    return db.select(recipeColumns).from(recipes).orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const db = await this.database();
    const [recipe] = await db.select(recipeColumns).from(recipes).where(eq(recipes.id, id));
    return recipe;
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const values = recipeInput.parse(recipe);
    const db = await this.database();
    const [created] = await db.insert(recipes).values(values).returning(recipeColumns);
    return created;
  }

  async updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const values = recipePatch.parse(data);
    const db = await this.database();
    const [updated] = await db
      .update(recipes)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(recipes.id, id))
      .returning(recipeColumns);
    return updated;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    const db = await this.database();
    const result = await db.delete(recipes).where(eq(recipes.id, id)).returning({ id: recipes.id });
    return result.length > 0;
  }

  async updateRecipeCredit(id: string, input: z.input<typeof recipeCreditInput>): Promise<Recipe | undefined> {
    const credit = recipeCreditInput.parse(input);
    const db = await this.database();
    // Do not rewrite the pinned recipe contents or its original timestamps.
    const [updated] = await db.update(recipes).set(credit).where(eq(recipes.id, id)).returning(recipeColumns);
    return updated;
  }
}

export const storage = new DatabaseStorage();
