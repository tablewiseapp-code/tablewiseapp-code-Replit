import { randomBytes } from "crypto";
import { and, count, desc, eq, lt } from "drizzle-orm";
import { groceryNotes, sharedGroceryItems, sharedGroceryLists, type ShareRole, type SharedGroceryItem } from "@shared/schema";

type Database = Omit<typeof import("./db").db, "$client">;
export const MAX_LISTS_PER_OWNER = 20;
export const MAX_ITEMS_PER_LIST = 500;
export const MAX_NOTES_PER_OWNER = 500;
const LIST_LIFETIME_MS = 30 * 86400_000;


export type SharedItemView = Pick<SharedGroceryItem, "id" | "category" | "text" | "recipes" | "checked" | "note">;
export type NewItem = Omit<SharedItemView, "id">;
export type SharedList = { id: string; ownerId: string; role: ShareRole };

export type GroceryStore = {
  /** Saves a copy of the list and returns its link token. Undefined when the owner has too many links. */
  create(ownerId: string, role: ShareRole, items: NewItem[]): Promise<string | undefined>;
  find(token: string): Promise<SharedList | undefined>;
  links(ownerId: string): Promise<{ token: string; role: ShareRole; createdAt: Date }[]>;
  items(listId: string): Promise<SharedItemView[]>;
  addItem(listId: string, item: Pick<NewItem, "category" | "text">): Promise<SharedItemView | undefined>;
  patchItem(listId: string, itemId: string, patch: Partial<Pick<NewItem, "checked" | "note" | "text">>): Promise<SharedItemView | undefined>;
  removeItem(listId: string, itemId: string): Promise<boolean>;
  setRole(listId: string, role: ShareRole): Promise<void>;
  remove(listId: string): Promise<void>;
  notes(ownerId: string): Promise<Record<string, string>>;
  /** A null note removes it. False when the owner has too many notes. */
  setNote(ownerId: string, key: string, note: string | null): Promise<boolean>;
};

export function databaseGroceryStore(connection?: Database): GroceryStore {
  const database = async () => connection ?? (await import("./db")).db;
  const view = {
    id: sharedGroceryItems.id, category: sharedGroceryItems.category, text: sharedGroceryItems.text,
    recipes: sharedGroceryItems.recipes, checked: sharedGroceryItems.checked, note: sharedGroceryItems.note,
  };
  const item = (listId: string, itemId: string) => and(eq(sharedGroceryItems.id, itemId), eq(sharedGroceryItems.listId, listId));
  return {
    async create(ownerId, role, items) {
      const db = await database();
      return db.transaction(async tx => {
        // Old links expire, so abandoned copies do not pile up.
        await tx.delete(sharedGroceryLists).where(lt(sharedGroceryLists.createdAt, new Date(Date.now() - LIST_LIFETIME_MS)));
        const [{ value }] = await tx.select({ value: count() }).from(sharedGroceryLists).where(eq(sharedGroceryLists.ownerId, ownerId));
        if (value >= MAX_LISTS_PER_OWNER) return undefined;
        const token = randomBytes(32).toString("hex");
        const [list] = await tx.insert(sharedGroceryLists).values({ ownerId, token, role }).returning({ id: sharedGroceryLists.id });
        await tx.insert(sharedGroceryItems).values(items.map(i => ({ ...i, listId: list.id })));
        return token;
      });
    },
    async find(token) {
      const [list] = await (await database()).select({ id: sharedGroceryLists.id, ownerId: sharedGroceryLists.ownerId, role: sharedGroceryLists.role })
        .from(sharedGroceryLists).where(eq(sharedGroceryLists.token, token));
      return list;
    },
    async links(ownerId) {
      return (await database()).select({ token: sharedGroceryLists.token, role: sharedGroceryLists.role, createdAt: sharedGroceryLists.createdAt })
        .from(sharedGroceryLists).where(eq(sharedGroceryLists.ownerId, ownerId)).orderBy(desc(sharedGroceryLists.createdAt));
    },
    async items(listId) {
      return (await database()).select(view).from(sharedGroceryItems).where(eq(sharedGroceryItems.listId, listId));
    },
    async addItem(listId, input) {
      const db = await database();
      const [{ value }] = await db.select({ value: count() }).from(sharedGroceryItems).where(eq(sharedGroceryItems.listId, listId));
      if (value >= MAX_ITEMS_PER_LIST) return undefined;
      const [row] = await db.insert(sharedGroceryItems).values({ ...input, listId }).returning(view);
      return row;
    },
    async patchItem(listId, itemId, patch) {
      const [row] = await (await database()).update(sharedGroceryItems).set(patch).where(item(listId, itemId)).returning(view);
      return row;
    },
    async removeItem(listId, itemId) {
      return (await (await database()).delete(sharedGroceryItems).where(item(listId, itemId)).returning({ id: sharedGroceryItems.id })).length > 0;
    },
    async setRole(listId, role) {
      await (await database()).update(sharedGroceryLists).set({ role }).where(eq(sharedGroceryLists.id, listId));
    },
    async remove(listId) {
      await (await database()).delete(sharedGroceryLists).where(eq(sharedGroceryLists.id, listId));
    },
    async notes(ownerId) {
      const rows = await (await database()).select().from(groceryNotes).where(eq(groceryNotes.ownerId, ownerId));
      return Object.fromEntries(rows.map(row => [row.itemKey, row.note]));
    },
    async setNote(ownerId, key, note) {
      const db = await database();
      const mine = and(eq(groceryNotes.ownerId, ownerId), eq(groceryNotes.itemKey, key));
      if (note === null) { await db.delete(groceryNotes).where(mine); return true; }
      const [{ value }] = await db.select({ value: count() }).from(groceryNotes).where(eq(groceryNotes.ownerId, ownerId));
      const [existing] = await db.select({ key: groceryNotes.itemKey }).from(groceryNotes).where(mine);
      if (!existing && value >= MAX_NOTES_PER_OWNER) return false;
      await db.insert(groceryNotes).values({ ownerId, itemKey: key, note })
        .onConflictDoUpdate({ target: [groceryNotes.ownerId, groceryNotes.itemKey], set: { note } });
      return true;
    },
  };
}
