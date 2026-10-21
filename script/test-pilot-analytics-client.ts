import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PilotAnalyticsClient, pilotJournalKey, type AnalyticsRuntime } from "../client/src/lib/pilot-analytics";
import { analyticsBatchSchema, type AnalyticsBatch } from "../shared/pilot-analytics";

export async function testAnalyticsClient() {
  const storage = new Map<string, string>([["tablewise:mvp:plan:v1:2026-10-19", "preserve-plan"]]);
  let status = 503, warnings = 0, rejectWrite = false;
  const deliveries: AnalyticsBatch[] = [];
  let chain = Promise.resolve();
  const runtime: AnalyticsRuntime = {
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => {
      if (rejectWrite) throw new Error("Synthetic quota");
      storage.set(key, value);
    } },
    now: Date.now, uuid: randomUUID,
    exclusive: work => { const next = chain.then(work); chain = next.catch(() => {}); return next; },
    send: async batch => { deliveries.push(batch); if (status === 0) throw new Error("Synthetic network failure"); return { status }; },
    warn: () => { warnings++; },
  };
  const client = new PilotAnalyticsClient(runtime);
  const week = "2026-10-19";
  await Promise.all([client.record("planner_opened", week), client.record("planner_opened", week)]);
  await client.record("meal_selected", week, "seed-a");
  await client.record("meal_selected", week, "seed-a");
  await client.record("plan_completed", week);
  await client.record("grocery_list_opened", week);
  const pending = storage.get(pilotJournalKey)!;
  const journal = JSON.parse(pending);
  assert.equal(journal.pending.length, 4);
  assert.equal((await client.flush()).delivered, false);
  assert.equal(storage.get(pilotJournalKey), pending);
  status = 0;
  assert.equal((await client.flush()).delivered, false);
  assert.equal(storage.get(pilotJournalKey), pending);
  status = 204;
  assert.equal((await client.flush()).delivered, true);
  assert.deepEqual(deliveries[0], deliveries[1]);
  assert.equal(JSON.parse(storage.get(pilotJournalKey)!).pending.length, 0);
  const refreshed = new PilotAnalyticsClient(runtime);
  assert.equal(await refreshed.record("planner_opened", week), false);
  assert.equal(await refreshed.record("plan_completed", week), false);
  await refreshed.record("plan_completed", "2026-10-26");
  assert.equal(JSON.parse(storage.get(pilotJournalKey)!).pilotId, journal.pilotId);
  assert.equal(JSON.parse(storage.get(pilotJournalKey)!).pending.length, 1);
  const beforeAck = storage.get(pilotJournalKey)!;
  rejectWrite = true;
  assert.equal((await refreshed.flush()).delivered, false);
  assert.equal(storage.get(pilotJournalKey), beforeAck);
  rejectWrite = false;
  await refreshed.flush();
  assert.deepEqual(deliveries.at(-1), deliveries.at(-2));
  assert.equal(storage.get("tablewise:mvp:plan:v1:2026-10-19"), "preserve-plan");
  assert.ok(warnings >= 2);
  assert.equal(analyticsBatchSchema.safeParse({ ...deliveries[0], email: "not-accepted" }).success, false);
  assert.equal(analyticsBatchSchema.safeParse({ ...deliveries[0], events: [{ ...deliveries[0].events[0], name: "next_week_plan_created" }] }).success, false);
  console.log("PASS fixtures/client: stable identity, rerender/refresh/reselection dedupe, durable failed delivery and failed ACK retries with unchanged IDs; planning storage untouched.");

  storage.set(pilotJournalKey, "{bad");
  assert.equal(await refreshed.record("planner_opened", week), false);
  assert.equal(storage.get(pilotJournalKey), "{bad");
  rejectWrite = true;
  storage.delete(pilotJournalKey);
  assert.equal(await refreshed.record("planner_opened", week), false);
  assert.equal(storage.has(pilotJournalKey), false);
  console.log("PASS fixtures/client: corrupt or unavailable telemetry storage does not overwrite state, invent changing identities or throw into planning.");
}
