import type { Pool } from "pg";
import { analyticsNames, type AnalyticsBatch } from "../shared/pilot-analytics";

export class AnalyticsCapacityError extends Error {}
export class PilotEventStore {
  private table: string;
  constructor(private connection: () => Promise<Pool>, namespace = "public") {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(namespace)) throw new Error("Invalid analytics namespace");
    this.table = `"${namespace}"."pilot_events"`;
  }
  async record(batch: AnalyticsBatch) {
    const pool = await this.connection();
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL statement_timeout = '2s'");
      await db.query("SET LOCAL lock_timeout = '500ms'");
      // A small single-process pilot: serialize writes for bounded capacity and
      // atomic derivation, including concurrent tabs/retries and out-of-order batches.
      await db.query("SELECT pg_advisory_xact_lock(741198521)");
      const { rows: [capacity] } = await db.query(`SELECT count(*)::int AS count FROM ${this.table}`);
      if (capacity.count + batch.events.length * 2 > 100_000) throw new AnalyticsCapacityError();
      const rows = batch.events.map(event => ({
        event_id: event.eventId, pilot_id: batch.pilotId, event_name: event.name,
        week_start: event.week, occurred_at: event.occurredAt,
        recipe_id: event.name === "meal_selected" ? event.recipeId : "",
      }));
      await db.query(`INSERT INTO ${this.table} (event_id,pilot_id,event_name,week_start,occurred_at,recipe_id)
        SELECT event_id,pilot_id,event_name,week_start,occurred_at,recipe_id
        FROM jsonb_to_recordset($1::jsonb) AS e(event_id uuid,pilot_id uuid,event_name text,week_start date,occurred_at timestamptz,recipe_id text)
        ON CONFLICT DO NOTHING`, [JSON.stringify(rows)]);
      const first = await db.query<{ week: string }>(`SELECT week_start::text AS week FROM ${this.table}
        WHERE pilot_id=$1 AND event_name='plan_completed' ORDER BY occurred_at,event_id LIMIT 1`, [batch.pilotId]);
      if (first.rows.length) {
        const baseline = first.rows[0].week;
        // Correct derived rows if a delayed, earlier completion arrived later.
        await db.query(`DELETE FROM ${this.table} WHERE pilot_id=$1
          AND event_name='next_week_plan_created' AND week_start <= $2::date`, [batch.pilotId, baseline]);
        await db.query(`INSERT INTO ${this.table} (event_id,pilot_id,event_name,week_start,occurred_at)
          SELECT gen_random_uuid(),pilot_id,'next_week_plan_created',week_start,occurred_at
          FROM ${this.table} WHERE pilot_id=$1 AND event_name='plan_completed' AND week_start > $2::date
          ON CONFLICT DO NOTHING`, [batch.pilotId, baseline]);
      }
      // A delayed baseline may make many older completions newly eligible.
      // Check the actual derived size as well as the incoming batch estimate.
      const { rows: [finalCapacity] } = await db.query(`SELECT count(*)::int AS count FROM ${this.table}`);
      if (finalCapacity.count > 100_000) throw new AnalyticsCapacityError();
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { db.release(); }
  }
  async summary() {
    const pool = await this.connection();
    const events = await pool.query<{ name: string; events: number; pilots: number }>(`SELECT event_name AS name,
      count(*)::int AS events,count(DISTINCT pilot_id)::int AS pilots FROM ${this.table} GROUP BY event_name`);
    const counts = Object.fromEntries(analyticsNames.map(name => [name,
      events.rows.find(row => row.name === name) ?? { name, events: 0, pilots: 0 }]));
    const completedPilots = counts.plan_completed.pilots;
    const returningPilots = counts.next_week_plan_created.pilots;
    const cohorts = await pool.query(`WITH firsts AS (
      SELECT DISTINCT ON (pilot_id) pilot_id,week_start FROM ${this.table} WHERE event_name='plan_completed'
      ORDER BY pilot_id,occurred_at,event_id)
      SELECT week_start::text AS "firstPlanWeek",count(*)::int AS "completedPilots",
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${this.table} e WHERE e.pilot_id=firsts.pilot_id
        AND e.event_name='next_week_plan_created'))::int AS "returningPilots"
      FROM firsts GROUP BY week_start ORDER BY week_start DESC LIMIT 26`);
    return { events: counts, completedPilots, returningPilots,
      returnRate: completedPilots ? returningPilots / completedPilots : null, cohorts: cohorts.rows };
  }
}
export const pilotEventStore = new PilotEventStore(async () => (await import("./db")).pool);
