import { and, eq, sql } from "drizzle-orm";
import { homeTasks, householdTasks } from "@shared/schema";
import type { HomeTask } from "@shared/home-tasks";

type Database = Omit<typeof import("./db").db, "$client">;
export const MAX_HOME_TASKS = 500;
export type HomeTaskInput = Omit<HomeTask, "id" | "createdAt"> & { createdAt?: string };
type Row = typeof homeTasks.$inferSelect;
const view = ({ ownerId: _owner, completedAt, createdAt, ...row }: Row): HomeTask =>
  ({ ...row, completedAt: completedAt?.toISOString() ?? null, createdAt: createdAt.toISOString() });

/** Every method is owner-scoped: another owner's tasks are invisible. */
export type HomeTaskStore = {
  list(ownerId: string): Promise<HomeTask[]>;
  /** Insert or replace. Undefined when the owner is at the task limit. */
  save(ownerId: string, id: string, task: HomeTaskInput): Promise<HomeTask | undefined>;
  remove(ownerId: string, id: string): Promise<void>;
  catalog(): Promise<{ id: string; names: Record<string, string> }[]>;
};

export function databaseHomeTaskStore(connection?: Database): HomeTaskStore {
  const database = async () => connection ?? (await import("./db")).db;
  return {
    async list(ownerId) {
      // ponytail: whole list with pictures in one response; split pictures out if owners keep hundreds with photos.
      return (await (await database()).select().from(homeTasks).where(eq(homeTasks.ownerId, ownerId))).map(view);
    },
    async save(ownerId, id, { createdAt, completedAt, ...rest }) {
      const task = { ...rest, completedAt: completedAt ? new Date(completedAt) : null };
      const row = await (await database()).transaction(async tx => {
        // Serialize writes per owner so simultaneous inserts cannot pass the cap.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 1732))`);
        const [existing] = await tx.select({ ownerId: homeTasks.ownerId }).from(homeTasks).where(eq(homeTasks.id, id));
        if (existing) {
          // Ids are global: a task id another owner already uses is reported as "not saved", never overwritten.
          if (existing.ownerId !== ownerId) return undefined;
          return (await tx.update(homeTasks).set(task).where(and(eq(homeTasks.id, id), eq(homeTasks.ownerId, ownerId))).returning())[0];
        }
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(homeTasks).where(eq(homeTasks.ownerId, ownerId));
        if (count >= MAX_HOME_TASKS) return undefined;
        return (await tx.insert(homeTasks).values({ ...task, id, ownerId, ...(createdAt ? { createdAt: new Date(createdAt) } : {}) }).returning())[0];
      });
      return row && view(row);
    },
    async remove(ownerId, id) {
      await (await database()).delete(homeTasks).where(and(eq(homeTasks.id, id), eq(homeTasks.ownerId, ownerId)));
    },
    async catalog() {
      return (await database()).select().from(householdTasks);
    },
  };
}
