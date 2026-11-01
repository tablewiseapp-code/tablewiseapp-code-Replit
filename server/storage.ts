import { type User, type InsertUser, type Recipe, type InsertRecipe, users, recipes } from "@shared/schema";
import { eq, desc, getTableColumns, sql } from "drizzle-orm";
import { recipeInput, recipePatch } from "./request-schemas";
import { recipeCreditInput } from "../shared/recipe-credit";
import type { z } from "zod";
import { analysisMatches, type StepAnalysis } from "../shared/step-timing";

// JSON row lookup returns NULL if the additive column has not been installed.
// Public reads stay compatible with the existing production schema.
const recipeColumns = {
  ...getTableColumns(recipes),
  prepTime: sql<number | null>`(to_jsonb(${recipes})->>'prep_time')::integer`,
  creditKind: sql<"chef" | "mine" | null>`to_jsonb(${recipes})->>'credit_kind'`,
  creditName: sql<string | null>`to_jsonb(${recipes})->>'credit_name'`,
  stepAnalysis: sql<StepAnalysis | null>`to_jsonb(${recipes})->'step_analysis'`,
};

export function isMissingPreparationColumn(error: unknown): boolean {
  const value = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const databaseError = value?.cause ?? value;
  return databaseError?.code === "42703" && Boolean(/prep_time|step_analysis/.test(databaseError.message ?? ""));
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
    // Drizzle's table INSERT emits DEFAULT for every omitted table column,
    // including additive columns that may not exist yet. Explicitly enumerate
    // supplied fields so untimed legacy creation remains migration-independent.
    const columns = getTableColumns(recipes);
    const fields = Object.entries(values).filter(([key, value]) =>
      value !== undefined && !(key === "stepAnalysis" && value === null));
    const names = fields.map(([key]) => sql.identifier(columns[key as keyof typeof columns].name));
    const parameters = fields.map(([key, value]) => sql.param(value, columns[key as keyof typeof columns]));
    const returning = Object.entries(recipeColumns).map(([key, column]) => sql`${column} AS ${sql.identifier(key)}`);
    const { rows: [created] } = await db.execute<Recipe>(sql`
      INSERT INTO ${recipes} (${sql.join(names, sql`, `)})
      VALUES (${sql.join(parameters, sql`, `)})
      RETURNING ${sql.join(returning, sql`, `)}
    `);
    // execute() does not apply Drizzle's RETURNING column decoders. In
    // particular its PostgreSQL timestamp parser returns strings, while select
    // maps these columns to Date. Keep create and reload representations equal.
    return {
      ...created,
      createdAt: typeof created.createdAt === "string" ? recipes.createdAt.mapFromDriverValue(created.createdAt) as Date : created.createdAt,
      updatedAt: typeof created.updatedAt === "string" ? recipes.updatedAt.mapFromDriverValue(created.updatedAt) as Date : created.updatedAt,
    };
  }

  async updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const values = recipePatch.parse(data);
    const contextChanged = ["title", "ingredients", "steps", "prepTime", "cookTime", "servings"].some(key => key in values);
    if (values.stepAnalysis) {
      const existing = await this.getRecipe(id);
      if (!existing) return undefined;
      if (!analysisMatches({ ...existing, ...values }, values.stepAnalysis)) throw new Error("Timing analysis is stale.");
    } else if (contextChanged) {
      // Only write the additive column if the old row actually has analysis.
      const existing = await this.getRecipe(id);
      if (existing?.stepAnalysis) values.stepAnalysis = null;
    }
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
