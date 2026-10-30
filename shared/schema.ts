import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, uuid, date, unique, index, check } from "drizzle-orm/pg-core";
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
  creditKind: z.enum(["chef", "mine"]).nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
// Optional for compatibility with recipes created before preparation-time metadata.
export type Recipe = Omit<typeof recipes.$inferSelect, "prepTime" | "creditKind" | "creditName"> & {
  prepTime?: number | null; creditKind?: "chef" | "mine" | null; creditName?: string | null;
};

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
