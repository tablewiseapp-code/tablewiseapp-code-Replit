import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, smallint, timestamp, uuid, date, unique, index, uniqueIndex, check, jsonb, customType, boolean, primaryKey } from "drizzle-orm/pg-core";
import type { RecipeNutrition } from "./recipe-nutrition";
import { stepAnalysisSchema, type StepAnalysis } from "./step-timing";
import type { RecipeGenerationRequest, RecipeGenerationStatus } from "./recipe-generation-request";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const recipes = pgTable("recipes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  ingredients: text("ingredients").array().notNull(),
  steps: text("steps").array().notNull(),
  stepAnalysis: jsonb("step_analysis").$type<StepAnalysis>(),
  image: text("image"),
  sourceUrl: text("source_url"),
  cookTime: integer("cook_time"),
  prepTime: integer("prep_time"),
  servings: text("servings"),
  creditKind: text("credit_kind").$type<"chef" | "mine">(),
  creditName: varchar("credit_name", { length: 120 }),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [
  check("recipes_prep_time_check", sql`${table.prepTime} IS NULL OR ${table.prepTime} BETWEEN 0 AND 10080`),
  check("recipes_credit_check", sql`(${table.creditKind} IS NULL AND ${table.creditName} IS NULL) OR
    (${table.creditKind} IS NOT NULL AND ${table.creditKind} IN ('chef', 'mine') AND
      (${table.creditName} IS NULL OR (length(btrim(${table.creditName})) BETWEEN 1 AND 120 AND ${table.creditName} = btrim(${table.creditName}))) AND
      (${table.creditKind} = 'mine' OR ${table.creditName} IS NOT NULL))`),
]);

export const insertRecipeSchema = createInsertSchema(recipes, {
  stepAnalysis: stepAnalysisSchema.nullable().optional(),
  creditKind: z.enum(["chef", "mine"]).nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export const recipeNutrition = pgTable("recipe_nutrition", {
  recipeId: varchar("recipe_id").primaryKey().references(() => recipes.id, { onDelete: "cascade" }),
  inputHash: varchar("input_hash", { length: 64 }).notNull(),
  data: jsonb("data").$type<RecipeNutrition>().notNull(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("recipe_nutrition_input_hash_check", sql`${table.inputHash} ~ '^[a-f0-9]{64}$'`),
  check("recipe_nutrition_data_check", sql`jsonb_typeof(${table.data}) = 'object'`),
]);
// Optional for compatibility with recipes created before preparation-time metadata.
export type Recipe = Omit<typeof recipes.$inferSelect, "prepTime" | "creditKind" | "creditName" | "stepAnalysis"> & {
  stepAnalysis?: StepAnalysis | null;
  prepTime?: number | null; creditKind?: "chef" | "mine" | null; creditName?: string | null;
};

// AI recipe generation requests and their private drafts. Drafts never live in `recipes`: only an approved
// draft is copied there (recipe_id), so no existing recipe read path can expose a draft.
export type RecipeDraftContent = {
  recipe: Omit<InsertRecipe, "image" | "sourceUrl" | "stepAnalysis" | "creditKind" | "creditName">;
  description: string;
  tip: string;
  violations?: { filter: string; value: string }[];
};
export const recipeGenerations = pgTable("recipe_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** "operator", or the SHA-256 of an anonymous browser owner cookie. Never the cookie itself. */
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  searchText: varchar("search_text", { length: 120 }).notNull(),
  /** The validated, normalized request (shared/recipe-generation-request.ts), kept apart from the recipe content. */
  request: jsonb("request").$type<RecipeGenerationRequest>().notNull(),
  status: varchar("status", { length: 20 }).$type<RecipeGenerationStatus>().default("draft").notNull(),
  draft: jsonb("draft").$type<RecipeDraftContent>().notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 80 }).notNull(),
  attempts: integer("attempts").default(1).notNull(),
  recipeId: varchar("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  approvedBy: varchar("approved_by", { length: 64 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("recipe_generations_owner").on(table.ownerId, table.createdAt),
  index("recipe_generations_recipe").on(table.recipeId),
  check("recipe_generations_status", sql`${table.status} IN ('draft','pending_review','changes_requested','rejected','published','unpublished')`),
  check("recipe_generations_published", sql`${table.status} <> 'published' OR (${table.approvedAt} IS NOT NULL AND ${table.publishedAt} IS NOT NULL)`),
]);
export type RecipeGeneration = typeof recipeGenerations.$inferSelect;

// Telemetry contains no names, email, IP, user agent, referrer, or recipe text.
export const pilotEvents = pgTable("pilot_events", {
  eventId: uuid("event_id").primaryKey(),
  pilotId: uuid("pilot_id").notNull(),
  eventName: varchar("event_name", { length: 40 }).notNull(),
  weekStart: date("week_start").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  recipeId: varchar("recipe_id", { length: 150 }).default("").notNull(),
}, table => [
  unique("pilot_events_semantic").on(table.pilotId, table.eventName, table.weekStart, table.recipeId),
  index("pilot_events_completion").on(table.pilotId, table.occurredAt, table.eventId).where(sql`${table.eventName} = 'plan_completed'`),
  index("pilot_events_funnel").on(table.eventName, table.weekStart),
  check("pilot_events_name", sql`${table.eventName} IN ('planner_opened','meal_selected','plan_completed','grocery_list_opened','next_week_plan_created')`),
  check("pilot_events_week", sql`extract(isodow FROM ${table.weekStart}) = 1 AND ${table.weekStart} BETWEEN '2000-01-01' AND '2100-12-31'`),
  check("pilot_events_recipe", sql`(${table.eventName} = 'meal_selected' AND ${table.recipeId} ~ '^[a-zA-Z0-9:_-]{1,150}$') OR (${table.eventName} <> 'meal_selected' AND ${table.recipeId} = '')`),
]);

// My Cooking Experience: one row per time an owner cooked a recipe. Private to the owner (same anonymous owner
// identity as recipe drafts) and never changes the recipe itself.
export const cookingSessions = pgTable("cooking_sessions", {
  /** Client-generated, so a retried "I made it!" is idempotent instead of a duplicate. */
  id: uuid("id").primaryKey(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  recipeId: varchar("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  cookedAt: timestamp("cooked_at", { withTimezone: true }).defaultNow().notNull(),
  rating: smallint("rating"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("cooking_sessions_owner_recipe").on(table.ownerId, table.recipeId, table.cookedAt),
  check("cooking_sessions_rating", sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`),
  check("cooking_sessions_notes", sql`${table.notes} IS NULL OR length(${table.notes}) <= 4000`),
]);
export type CookingSession = typeof cookingSessions.$inferSelect;

export const householdProducts = pgTable("household_products", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  names: jsonb("names").$type<Record<string, string>>().notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull(),
});

// Groceries: products the owner added by hand ("I'm out of onion"). Private to the owner, like cooking sessions.
export const groceryExtras = pgTable("grocery_extras", {
  image: text("image"),
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  // Plain columns on purpose: drizzle-kit push re-creates expression indexes on every start. The store matches letter case itself.
  uniqueIndex("grocery_extras_owner_text").on(table.ownerId, table.text),
  check("grocery_extras_image", sql`${table.image} IS NULL OR length(${table.image}) <= 280023`),
  check("grocery_extras_text", sql`length(${table.text}) BETWEEN 1 AND 80`),
]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
// ponytail: JPEG bytes in Postgres (no object storage in this project); move to object storage if volume grows.
export const cookingPhotos = pgTable("cooking_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => cookingSessions.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  image: bytea("image").notNull(),
  thumbnail: bytea("thumbnail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("cooking_photos_session").on(table.sessionId, table.createdAt),
  index("cooking_photos_owner").on(table.ownerId),
]);

// Grocery share links: a saved copy of one grocery list, opened by a link that carries a role.
// There are no accounts, so the role belongs to the link; the owner (cookie) can always do everything.
export type ShareRole = "view" | "add" | "edit";
export const sharedGroceryLists = pgTable("shared_grocery_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  // ponytail: stored as is so the owner can get their link back; hash it if these lists ever hold sensitive data.
  token: varchar("token", { length: 64 }).notNull().unique(),
  role: varchar("role", { length: 8 }).$type<ShareRole>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("shared_grocery_lists_owner").on(table.ownerId, table.createdAt),
  check("shared_grocery_lists_role", sql`${table.role} IN ('view','add','edit')`),
]);
export const sharedGroceryItems = pgTable("shared_grocery_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => sharedGroceryLists.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 40 }).notNull(),
  text: varchar("text", { length: 300 }).notNull(),
  recipes: varchar("recipes", { length: 300 }).default("").notNull(),
  checked: boolean("checked").default(false).notNull(),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("shared_grocery_items_list").on(table.listId)]);
export type SharedGroceryItem = typeof sharedGroceryItems.$inferSelect;

// Notes on the owner's own grocery list, keyed by the list's item key (the lowercased ingredient line).
export const groceryNotes = pgTable("grocery_notes", {
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  itemKey: varchar("item_key", { length: 300 }).notNull(),
  note: varchar("note", { length: 500 }).notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.itemKey] })]);
