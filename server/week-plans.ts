import { and, eq } from "drizzle-orm";
import { householdSettings, weekPlans } from "@shared/schema";
import { fromLegacy, isLegacyPlan, sameBatches, type Batch } from "@shared/cooking-plan";
import type { z } from "zod";
import type { weekPlanInput } from "./request-schemas";

type Database = Omit<typeof import("./db").db, "$client">;
export type WeekPlan = z.infer<typeof weekPlanInput>;

/** Owner-scoped: one plan per owner and week, replaced whole on every save. */
export type WeekPlanStore = {
  get(ownerId: string, weekStart: string): Promise<WeekPlan | null>;
  save(ownerId: string, plan: WeekPlan): Promise<void>;
};

export function databaseWeekPlanStore(connection?: Database): WeekPlanStore {
  const database = async () => connection ?? (await import("./db")).db;
  return {
    async get(ownerId, weekStart) {
      const [row] = await (await database()).select().from(weekPlans).where(and(eq(weekPlans.ownerId, ownerId), eq(weekPlans.weekStart, weekStart)));
      if (!row) return null;
      // A week saved before cooking days: its slots become dated dishes; an approved (locked) one stays approved.
      if (isLegacyPlan(row.planAssignments)) {
        const batches = fromLegacy(row.weekStart, row.planAssignments);
        return { weekStart: row.weekStart, proposed: row.proposed, selectedIds: row.selectedIds, batches, approved: row.locked ? batches : null, onHand: null };
      }
      return { weekStart: row.weekStart, proposed: row.proposed, selectedIds: row.selectedIds,
        batches: row.planAssignments as Batch[], approved: (row.approvedBatches as Batch[] | null) ?? null, onHand: (row.onHand as WeekPlan["onHand"]) ?? null };
    },
    async save(ownerId, { batches, approved, onHand, ...plan }) {
      const values = { ...plan, planAssignments: batches, approvedBatches: approved, onHand: onHand ?? null, locked: sameBatches(batches, approved) };
      await (await database()).insert(weekPlans).values({ ownerId, ...values })
        .onConflictDoUpdate({ target: [weekPlans.ownerId, weekPlans.weekStart], set: { ...values, updatedAt: new Date() } });
    },
  };
}

/** Owner-scoped: My Basic Settings, one document per owner, replaced whole on every save. */
export type HouseholdSettingsStore = {
  get(ownerId: string): Promise<Record<string, unknown> | null>;
  save(ownerId: string, settings: Record<string, unknown>): Promise<void>;
};

export function databaseHouseholdSettingsStore(connection?: Database): HouseholdSettingsStore {
  const database = async () => connection ?? (await import("./db")).db;
  return {
    async get(ownerId) {
      const [row] = await (await database()).select().from(householdSettings).where(eq(householdSettings.ownerId, ownerId));
      return row?.settings ?? null;
    },
    async save(ownerId, settings) {
      await (await database()).insert(householdSettings).values({ ownerId, settings })
        .onConflictDoUpdate({ target: householdSettings.ownerId, set: { settings, updatedAt: new Date() } });
    },
  };
}
