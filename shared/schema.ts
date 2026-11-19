import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, smallint, timestamp, uuid, date, unique, index, uniqueIndex, check, jsonb, customType, boolean, primaryKey } from "drizzle-orm/pg-core";
import type { RecipeNutrition } from "./recipe-nutrition";
import { stepAnalysisSchema, type StepAnalysis } from "./step-timing";
import { ingredientPartSchema, type IngredientPart } from "./ingredient-parse";
import type { HomeTaskPriority } from "./home-tasks";
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
  // Parsed manual-import lines, same order as `ingredients`. Null for recipes saved before manual import.
  ingredientParts: jsonb("ingredient_parts").$type<IngredientPart[]>(),
  // One list per step of the ingredients that step uses, as written for that step ("1 tbsp oil"); [] = the step uses none.
  // Null = no step-level data (every recipe before 2026-11-18); cooking mode then links to the full ingredient list.
  stepIngredients: jsonb("step_ingredients").$type<string[][]>(),
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
  check("recipes_ingredient_parts_check", sql`${table.ingredientParts} IS NULL OR jsonb_typeof(${table.ingredientParts}) = 'array'`),
  check("recipes_step_ingredients_check", sql`${table.stepIngredients} IS NULL OR jsonb_typeof(${table.stepIngredients}) = 'array'`),
  check("recipes_credit_check", sql`(${table.creditKind} IS NULL AND ${table.creditName} IS NULL) OR
    (${table.creditKind} IS NOT NULL AND ${table.creditKind} IN ('chef', 'mine') AND
      (${table.creditName} IS NULL OR (length(btrim(${table.creditName})) BETWEEN 1 AND 120 AND ${table.creditName} = btrim(${table.creditName}))) AND
      (${table.creditKind} = 'mine' OR ${table.creditName} IS NOT NULL))`),
]);

export const insertRecipeSchema = createInsertSchema(recipes, {
  stepAnalysis: stepAnalysisSchema.nullable().optional(),
  ingredientParts: z.array(ingredientPartSchema).nullable().optional(),
  stepIngredients: z.array(z.array(z.string())).nullable().optional(),
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
export type Recipe = Omit<typeof recipes.$inferSelect, "prepTime" | "creditKind" | "creditName" | "stepAnalysis" | "ingredientParts" | "stepIngredients"> & {
  stepAnalysis?: StepAnalysis | null; ingredientParts?: IngredientPart[] | null; stepIngredients?: string[][] | null;
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
  category: text("category"),
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  // Plain columns on purpose: drizzle-kit push re-creates expression indexes on every start. The store matches letter case itself.
  index("grocery_extras_owner_text").on(table.ownerId, table.text),
  check("grocery_extras_image", sql`${table.image} IS NULL OR length(${table.image}) <= 280023`),
  check("grocery_extras_text", sql`length(${table.text}) BETWEEN 1 AND 80`),
]);

export const groceryShoppingItems = pgTable("grocery_shopping_items", {
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  itemKey: text("item_key").notNull(),
  skipped: boolean("skipped").notNull().default(false),
  priceCents: integer("price_cents"),
  priceText: text("price_text"),
}, table => [
  primaryKey({ columns: [table.ownerId, table.itemKey] }),
  check("grocery_shopping_items_price_check", sql`
    (${table.priceCents} IS NULL AND ${table.priceText} IS NULL) OR
    (${table.priceCents} IS NOT NULL AND ${table.priceCents} BETWEEN 0 AND 10000000 AND ${table.priceText} IS NOT NULL)
  `),
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

// Where an imported recipe came from. Kept apart from the recipe's content so real extraction can replace the mock.
export type RecipeSourceStatus = "mock" | "pending" | "ready" | "failed";
export const recipeSources = pgTable("recipe_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: varchar("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 16 }).$type<"youtube">().notNull(),
  originalUrl: text("original_url").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  externalVideoId: varchar("external_video_id", { length: 32 }).notNull(),
  status: varchar("status", { length: 8 }).$type<RecipeSourceStatus>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("recipe_sources_provider", sql`${table.provider} IN ('youtube')`),
  check("recipe_sources_status", sql`${table.status} IN ('mock','pending','ready','failed')`),
  unique("recipe_sources_recipe_unique").on(table.recipeId),
  unique("recipe_sources_owner_video_unique").on(table.ownerId, table.provider, table.externalVideoId),
]);
export type RecipeSource = typeof recipeSources.$inferSelect;

// Private reference pictures for any grocery row, keyed like grocery notes.
// A null image hides a legacy picture stored on a hand-added item.
export const groceryItemPhotos = pgTable("grocery_item_photos", {
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  itemKey: text("item_key").notNull(),
  image: text("image"),
}, table => [
  primaryKey({ columns: [table.ownerId, table.itemKey] }),
  check("grocery_item_photos_key", sql`length(${table.itemKey}) BETWEEN 1 AND 12000`),
  check("grocery_item_photos_image", sql`${table.image} IS NULL OR length(${table.image}) <= 280023`),
]);

// Home Tasks: household to-dos, private to the owner. The due date is a calendar date in the person's time zone.
export const homeTasks = pgTable("home_tasks", {
  /** Client-generated, so Undo after Delete can restore the same task. */
  id: uuid("id").primaryKey(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  name: text("name").notNull(),
  dueDate: date("due_date"),
  priority: varchar("priority", { length: 8 }).$type<HomeTaskPriority>().notNull(),
  // ponytail: resized JPEG data URL in the row, like grocery pictures; move to object storage if volume grows.
  image: text("image"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("home_tasks_owner").on(table.ownerId),
  check("home_tasks_name", sql`length(${table.name}) BETWEEN 1 AND 120`),
  check("home_tasks_priority", sql`${table.priority} IN ('high','normal','low')`),
  check("home_tasks_image", sql`${table.image} IS NULL OR length(${table.image}) <= 280023`),
]);

// The Week (/meals): one plan per owner. The browser keeps a copy in localStorage for synchronous reads.
// The Week: one plan per owner and calendar week (week_start is that week's Monday).
export const weekPlans = pgTable("week_plans", {
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  weekStart: date("week_start").notNull(),
  selectedIds: jsonb("selected_ids").$type<string[]>().notNull(),
  planAssignments: jsonb("plan_assignments").$type<{ recipeId: string; mealType: "Breakfast" | "Lunch" | "Dinner"; startDay: number; spanDays: number; servings?: number }[]>().notNull(),
  locked: boolean("locked").default(false).notNull(),
  /** The full-week proposal was made; empty slots are not filled again. */
  proposed: boolean("proposed").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.weekStart] })]);

// My Basic Settings and Your household: one document per owner, sanitized by the client (client/src/lib/basic-settings.ts).
export const householdSettings = pgTable("household_settings", {
  ownerId: varchar("owner_id", { length: 64 }).primaryKey(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Suggested household task names, seeded by migration, like household_products.
export const householdTasks = pgTable("household_tasks", {
  id: text("id").primaryKey(),
  names: jsonb("names").$type<Record<string, string>>().notNull(),
});

// Accounts: email and password sign-in. An account points at one owner, so every owner-scoped table follows it.
// The legacy `users` table is not used.
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  /** scrypt "salt:key" in hex. Null leaves room for a sign-in without a password (Google). */
  passwordHash: text("password_hash"),
  ownerId: varchar("owner_id", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** Optional name shown instead of the email. */
  displayName: varchar("display_name", { length: 60 }),
  /** Optional resized JPEG data URL; photoVersion changes with it so its link can be cached. */
  photo: text("photo"),
  photoVersion: integer("photo_version").default(0).notNull(),
}, table => [check("accounts_photo", sql`${table.photo} IS NULL OR length(${table.photo}) <= 280023`)]);

// Signed-in browsers. Only the SHA-256 of the session cookie is stored.
export const accountSessions = pgTable("account_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("account_sessions_account").on(table.accountId)]);

// My recipes on /recipes: catalog recipes an owner liked or imported. Private to the owner; the recipe stays shared.
export const recipeMarks = pgTable("recipe_marks", {
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  recipeId: varchar("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 8 }).$type<"liked" | "imported">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.ownerId, table.recipeId, table.kind] }),
  check("recipe_marks_kind", sql`${table.kind} IN ('liked','imported')`),
]);
