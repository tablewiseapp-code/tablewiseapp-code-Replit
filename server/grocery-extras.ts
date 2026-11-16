import { and, asc, count, eq, sql } from "drizzle-orm";
import { groceryExtras } from "@shared/schema";

type Database = Omit<typeof import("./db").db, "$client">;
export const MAX_GROCERY_EXTRAS = 200;
export type GroceryExtra = { id: string; text: string; image?: string | null };

/** Every method is owner-scoped: another owner's items are invisible. */
export type GroceryExtraStore = {
  list(ownerId: string): Promise<GroceryExtra[]>;
  /** The same text again (any letter case) returns the existing item. Undefined when the owner's list is full. */
  add(ownerId: string, text: string, image?: string): Promise<GroceryExtra | undefined>;
  remove(ownerId: string, id: string): Promise<boolean>;
};

export function databaseGroceryExtraStore(connection?: Database): GroceryExtraStore {
  const database = async () => connection ?? (await import("./db")).db;
  const columns = { id: groceryExtras.id, text: groceryExtras.text, image: groceryExtras.image };
  return {
    async list(ownerId) {
      return (await database()).select(columns).from(groceryExtras).where(eq(groceryExtras.ownerId, ownerId)).orderBy(asc(groceryExtras.createdAt));
    },
    async add(ownerId, text, image) {
      const db = await database();
      const same = and(eq(groceryExtras.ownerId, ownerId), sql`lower(${groceryExtras.text}) = lower(${text})`);
      const [existing] = await db.select(columns).from(groceryExtras).where(same);
      if (existing) {
        if (image) return (await db.update(groceryExtras).set({ image }).where(same).returning(columns))[0];
        return existing;
      }
      // ponytail: check-then-insert, so concurrent adds can pass the cap by a few rows or store "Onion" and "onion" as two rows
      // (the page shows them as one); lock per owner if that ever matters.
      const [{ value }] = await db.select({ value: count() }).from(groceryExtras).where(eq(groceryExtras.ownerId, ownerId));
      if (value >= MAX_GROCERY_EXTRAS) return undefined;
      await db.insert(groceryExtras).values({ ownerId, text, image }).onConflictDoNothing();
      return (await db.select(columns).from(groceryExtras).where(same))[0];
    },
    async remove(ownerId, id) {
      const db = await database();
      return (await db.delete(groceryExtras).where(and(eq(groceryExtras.id, id), eq(groceryExtras.ownerId, ownerId))).returning({ id: groceryExtras.id })).length > 0;
    },
  };
}
