import { eq } from "drizzle-orm";
import { weekPlans } from "@shared/schema";
import type { z } from "zod";
import type { weekPlanInput } from "./request-schemas";

type Database = Omit<typeof import("./db").db, "$client">;
export type WeekPlan = z.infer<typeof weekPlanInput>;

/** Owner-scoped: one plan per owner, replaced whole on every save. */
export type WeekPlanStore = {
  get(ownerId: string): Promise<WeekPlan | null>;
  save(ownerId: string, plan: WeekPlan): Promise<void>;
};

export function databaseWeekPlanStore(connection?: Database): WeekPlanStore {
  const database = async () => connection ?? (await import("./db")).db;
  return {
    async get(ownerId) {
      const [row] = await (await database()).select().from(weekPlans).where(eq(weekPlans.ownerId, ownerId));
      return row ? { selectedIds: row.selectedIds, planAssignments: row.planAssignments, locked: row.locked } : null;
    },
    async save(ownerId, plan) {
      await (await database()).insert(weekPlans).values({ ownerId, ...plan })
        .onConflictDoUpdate({ target: weekPlans.ownerId, set: { ...plan, updatedAt: new Date() } });
    },
  };
}
