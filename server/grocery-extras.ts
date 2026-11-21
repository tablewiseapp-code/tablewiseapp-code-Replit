import { and, asc, count, eq, sql } from "drizzle-orm";
import { groceryExtras } from "@shared/schema";

type Database = Omit<typeof import("./db").db, "$client">;
export const MAX_GROCERY_EXTRAS = 200;
export type GroceryExtra = { id: string; text: string; image?: string | null; category?: string | null };

/** Every method is owner-scoped: another owner's items are invisible. */
export type GroceryExtraStore = {
  list(ownerId: string): Promise<GroceryExtra[]>;
  /** The same text again (any letter case) returns the existing item. Undefined when the owner's list is full. */
  add(ownerId: string, text: string, image?: string, restore?: { id?: string; category?: string | null }): Promise<GroceryExtra | undefined>;
  addBatch?(ownerId: string, rows: { text: string; category: string; existingId?: string }[]): Promise<GroceryExtra[] | null>;
  remove(ownerId: string, id: string): Promise<boolean>;
};

export function databaseGroceryExtraStore(connection?: Database): GroceryExtraStore {
  const database = async () => connection ?? (await import("./db")).db;
  const columns = { id: groceryExtras.id, text: groceryExtras.text, image: groceryExtras.image, category: groceryExtras.category };
  return {
    async list(ownerId) {
      return (await database()).select(columns).from(groceryExtras).where(eq(groceryExtras.ownerId, ownerId)).orderBy(asc(groceryExtras.createdAt));
    },
    async add(ownerId, text, image, restore) {
      const db = await database();
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}), 33)`);
        const same = and(eq(groceryExtras.ownerId, ownerId), sql`lower(${groceryExtras.text}) = lower(${text})`);
        const [existing] = await tx.select(columns).from(groceryExtras).where(same)
          .orderBy(asc(groceryExtras.createdAt), asc(groceryExtras.id)).limit(1);
        if (existing) {
          if (!image) return existing;
          return (await tx.update(groceryExtras).set({ image }).where(eq(groceryExtras.id, existing.id)).returning(columns))[0];
        }
        const [{ value }] = await tx.select({ value: count() }).from(groceryExtras).where(eq(groceryExtras.ownerId, ownerId));
        if (value >= MAX_GROCERY_EXTRAS) return undefined;
        if (restore?.id) {
          const [restored] = await tx.insert(groceryExtras).values({ ownerId, text, image, id: restore.id, category: restore.category ?? null })
            .onConflictDoNothing().returning(columns);
          if (restored) return restored;
        }
        return (await tx.insert(groceryExtras).values({ ownerId, text, image, category: restore?.category ?? null }).returning(columns))[0];
      });
    },
    async addBatch(ownerId, rows) {
      const db = await database();
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}), 33)`);
        const original = await tx.select(columns).from(groceryExtras).where(eq(groceryExtras.ownerId, ownerId));
        const updates = new Set(rows.flatMap(row => row.existingId ? [row.existingId] : []));
        if (updates.size !== rows.filter(row => row.existingId).length ||
          [...updates].some(id => !original.some(row => row.id === id)) ||
          original.length + rows.length - updates.size > MAX_GROCERY_EXTRAS) return null;
        const result: GroceryExtra[] = [];
        for (const { existingId, ...row } of rows) {
          if (existingId) {
            const [updated] = await tx.update(groceryExtras).set(row)
              .where(and(eq(groceryExtras.ownerId, ownerId), eq(groceryExtras.id, existingId))).returning(columns);
            if (!updated) throw new Error("Grocery item changed");
            result.push(updated);
          } else {
            const [inserted] = await tx.insert(groceryExtras).values({ ...row, ownerId }).returning(columns);
            result.push(inserted);
          }
        }
        return result;
      });
    },
    async remove(ownerId, id) {
      const db = await database();
      return (await db.delete(groceryExtras).where(and(eq(groceryExtras.id, id), eq(groceryExtras.ownerId, ownerId))).returning({ id: groceryExtras.id })).length > 0;
    },
  };
}
