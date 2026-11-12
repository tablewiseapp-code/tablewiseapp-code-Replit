import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { cookingPhotos, cookingSessions, type CookingSession } from "@shared/schema";

type Database = Omit<typeof import("./db").db, "$client">;
export const MAX_PHOTOS_PER_SESSION = 10;
export const MAX_PHOTOS_PER_OWNER = 200;

/** The client-facing view: never the owner identity. */
export type CookingSessionView = Omit<CookingSession, "ownerId"> & { photoIds: string[] };
export type CookingPatch = { rating?: number | null; notes?: string | null };
export type PhotoResult = { kind: "added"; id: string } | { kind: "not_found" } | { kind: "full" };

/** Every method is owner-scoped: another owner's session or photo reads as missing. */
export type CookingStore = {
  list(ownerId: string, recipeId: string): Promise<CookingSessionView[]>;
  /** Idempotent for the same owner and id. Undefined if the id belongs to another owner. Throws on an unknown recipe (FK). */
  create(ownerId: string, id: string, recipeId: string): Promise<CookingSessionView | undefined>;
  update(ownerId: string, id: string, patch: CookingPatch): Promise<CookingSessionView | undefined>;
  remove(ownerId: string, id: string): Promise<boolean>;
  addPhoto(ownerId: string, sessionId: string, image: Buffer, thumbnail: Buffer): Promise<PhotoResult>;
  photo(ownerId: string, photoId: string, thumbnail: boolean): Promise<Buffer | undefined>;
  removePhoto(ownerId: string, photoId: string): Promise<boolean>;
};

export const isUnknownRecipe = (error: unknown) => {
  const value = error as { code?: string; cause?: { code?: string } } | null;
  return (value?.cause ?? value)?.code === "23503";
};

export function databaseCookingStore(connection?: Database): CookingStore {
  const database = async () => connection ?? (await import("./db")).db;
  const owned = (id: string, ownerId: string) => and(eq(cookingSessions.id, id), eq(cookingSessions.ownerId, ownerId));
  const withPhotos = async (db: Database, rows: CookingSession[]): Promise<CookingSessionView[]> => {
    const photos = rows.length ? await db.select({ id: cookingPhotos.id, sessionId: cookingPhotos.sessionId }).from(cookingPhotos)
      .where(inArray(cookingPhotos.sessionId, rows.map(row => row.id))).orderBy(asc(cookingPhotos.createdAt)) : [];
    return rows.map(({ ownerId: _owner, ...row }) => ({ ...row, photoIds: photos.filter(p => p.sessionId === row.id).map(p => p.id) }));
  };
  const one = async (db: Database, id: string, ownerId: string) => {
    const [row] = await db.select().from(cookingSessions).where(owned(id, ownerId));
    return row ? (await withPhotos(db, [row]))[0] : undefined;
  };
  return {
    async list(ownerId, recipeId) {
      const db = await database();
      const rows = await db.select().from(cookingSessions)
        .where(and(eq(cookingSessions.ownerId, ownerId), eq(cookingSessions.recipeId, recipeId)))
        .orderBy(desc(cookingSessions.cookedAt), desc(cookingSessions.createdAt));
      return withPhotos(db, rows);
    },
    async create(ownerId, id, recipeId) {
      const db = await database();
      await db.insert(cookingSessions).values({ id, ownerId, recipeId }).onConflictDoNothing();
      const row = await one(db, id, ownerId);
      return row && row.recipeId === recipeId ? row : undefined;
    },
    async update(ownerId, id, patch) {
      const db = await database();
      const [row] = await db.update(cookingSessions).set({ ...patch, updatedAt: new Date() }).where(owned(id, ownerId)).returning({ id: cookingSessions.id });
      return row ? one(db, id, ownerId) : undefined;
    },
    async remove(ownerId, id) {
      const db = await database();
      return (await db.delete(cookingSessions).where(owned(id, ownerId)).returning({ id: cookingSessions.id })).length > 0;
    },
    async addPhoto(ownerId, sessionId, image, thumbnail) {
      const db = await database();
      return db.transaction(async tx => {
        // The session row lock serializes concurrent uploads, so the per-session limit holds.
        const [session] = await tx.select({ id: cookingSessions.id }).from(cookingSessions).where(owned(sessionId, ownerId)).for("update");
        if (!session) return { kind: "not_found" } as const;
        const [{ value: forSession }] = await tx.select({ value: count() }).from(cookingPhotos).where(eq(cookingPhotos.sessionId, sessionId));
        const [{ value: forOwner }] = await tx.select({ value: count() }).from(cookingPhotos).where(eq(cookingPhotos.ownerId, ownerId));
        if (forSession >= MAX_PHOTOS_PER_SESSION || forOwner >= MAX_PHOTOS_PER_OWNER) return { kind: "full" } as const;
        const [row] = await tx.insert(cookingPhotos).values({ sessionId, ownerId, image, thumbnail }).returning({ id: cookingPhotos.id });
        await tx.update(cookingSessions).set({ updatedAt: new Date() }).where(eq(cookingSessions.id, sessionId));
        return { kind: "added", id: row.id } as const;
      });
    },
    async photo(ownerId, photoId, thumbnail) {
      const db = await database();
      const [row] = await db.select({ data: thumbnail ? cookingPhotos.thumbnail : cookingPhotos.image }).from(cookingPhotos)
        .where(and(eq(cookingPhotos.id, photoId), eq(cookingPhotos.ownerId, ownerId)));
      return row?.data;
    },
    async removePhoto(ownerId, photoId) {
      const db = await database();
      return (await db.delete(cookingPhotos).where(and(eq(cookingPhotos.id, photoId), eq(cookingPhotos.ownerId, ownerId)))
        .returning({ id: cookingPhotos.id })).length > 0;
    },
  };
}
