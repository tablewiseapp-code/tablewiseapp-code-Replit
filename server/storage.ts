import { type User, type InsertUser, type Recipe, type InsertRecipe, users, recipes } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { recipeInput, recipePatch } from "./request-schemas";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAllRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  deleteRecipe(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  constructor(private readonly connection?: typeof import("./db").db) {}

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
    return db.select().from(recipes).orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const db = await this.database();
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    return recipe;
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const values = recipeInput.parse(recipe);
    const db = await this.database();
    const [created] = await db.insert(recipes).values(values).returning();
    return created;
  }

  async updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const values = recipePatch.parse(data);
    const db = await this.database();
    const [updated] = await db
      .update(recipes)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(recipes.id, id))
      .returning();
    return updated;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    const db = await this.database();
    const result = await db.delete(recipes).where(eq(recipes.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
