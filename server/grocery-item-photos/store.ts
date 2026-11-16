import { and, eq, sql } from "drizzle-orm";
import { groceryItemPhotos } from "@shared/schema";

type Database = Omit<typeof import("../db").db, "$client">;
export const MAX_GROCERY_ITEM_PHOTOS = 500;
export type GroceryItemPhotoStore = {
  list(ownerId: string): Promise<Record<string, string | null>>;
  save(ownerId: string, key: string, image: string | null): Promise<boolean>;
  remove(ownerId: string, key: string): Promise<void>;
};

export function databaseGroceryItemPhotoStore(connection?: Database): GroceryItemPhotoStore {
  const database = async () => connection ?? (await import("../db")).db;
  return {
    async list(ownerId) {
      const rows = await (await database()).select({ key: groceryItemPhotos.itemKey, image: groceryItemPhotos.image })
        .from(groceryItemPhotos).where(eq(groceryItemPhotos.ownerId, ownerId));
      return Object.fromEntries(rows.map(row => [row.key, row.image]));
    },
    async save(ownerId, key, image) {
      const db = await database();
      return db.transaction(async tx => {
        // Serialize writes per owner so simultaneous uploads cannot bypass the cap.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 1731))`);
        const where = and(eq(groceryItemPhotos.ownerId, ownerId), eq(groceryItemPhotos.itemKey, key));
        const [existing] = await tx.select({ key: groceryItemPhotos.itemKey }).from(groceryItemPhotos).where(where);
        if (!existing) {
          const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(groceryItemPhotos).where(eq(groceryItemPhotos.ownerId, ownerId));
          if (count >= MAX_GROCERY_ITEM_PHOTOS) return false;
        }
        await tx.insert(groceryItemPhotos).values({ ownerId, itemKey: key, image })
          .onConflictDoUpdate({ target: [groceryItemPhotos.ownerId, groceryItemPhotos.itemKey], set: { image } });
        return true;
      });
    },
    async remove(ownerId, key) {
      await (await database()).delete(groceryItemPhotos).where(and(eq(groceryItemPhotos.ownerId, ownerId), eq(groceryItemPhotos.itemKey, key)));
    },
  };
}
