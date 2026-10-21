import { z } from "zod";
import { clientEventSchema, analyticsEventKey, type AnalyticsBatch, type ClientEvent, type ClientEventName } from "@shared/pilot-analytics";

export const pilotJournalKey = "tablewise:pilot-analytics:v1";
const journalSchema = z.object({
  version: z.literal(1), pilotId: z.string().uuid(),
  seen: z.array(z.string().max(300)).max(5000),
  pending: z.array(clientEventSchema).max(200),
}).strict();
type Journal = z.infer<typeof journalSchema>;
export type AnalyticsRuntime = {
  storage: Pick<Storage, "getItem" | "setItem">;
  now: () => number;
  uuid: () => string;
  exclusive: (work: () => Promise<void>) => Promise<void>;
  send: (batch: AnalyticsBatch) => Promise<{ status: number; retryAfterMs?: number }>;
  warn: () => void;
};

// All journal writes are explicit, bounded and atomic localStorage replacements.
// Browser Web Locks serialize tabs; server semantic uniqueness is the final guard.
export class PilotAnalyticsClient {
  private flushing = false;
  constructor(private runtime: AnalyticsRuntime) {}
  private read(): Journal | null {
    const raw = this.runtime.storage.getItem(pilotJournalKey);
    if (raw === null) return null;
    if (raw.length > 1_000_000) throw new Error("Analytics journal limit");
    return journalSchema.parse(JSON.parse(raw));
  }
  private write(journal: Journal) {
    const raw = JSON.stringify(journalSchema.parse(journal));
    if (raw.length > 1_000_000) throw new Error("Analytics journal limit");
    this.runtime.storage.setItem(pilotJournalKey, raw);
  }
  async record(name: ClientEventName, week: string, recipeId?: string): Promise<boolean> {
    let recorded = false;
    try {
      await this.runtime.exclusive(async () => {
        const journal = this.read() ?? { version: 1 as const, pilotId: this.runtime.uuid(), seen: [], pending: [] };
        const event = clientEventSchema.parse({
          name, week, eventId: this.runtime.uuid(), occurredAt: new Date(this.runtime.now()).toISOString(),
          ...(name === "meal_selected" ? { recipeId } : {}),
        });
        const key = analyticsEventKey(event);
        if (journal.seen.includes(key) || journal.pending.some(value => analyticsEventKey(value) === key)) return;
        if (journal.pending.length >= 200 || journal.seen.length + journal.pending.length >= 5000) throw new Error("Analytics journal full");
        this.write({ ...journal, pending: [...journal.pending, event] });
        recorded = true;
      });
    } catch { this.runtime.warn(); }
    return recorded;
  }
  async flush(): Promise<{ pending: boolean; delivered: boolean; retryAfterMs?: number }> {
    if (this.flushing) return { pending: true, delivered: false };
    this.flushing = true;
    try {
      let batch: AnalyticsBatch | undefined;
      await this.runtime.exclusive(async () => {
        const journal = this.read();
        if (journal?.pending.length) batch = { pilotId: journal.pilotId, events: journal.pending.slice(0, 20) };
      });
      if (!batch) return { pending: false, delivered: true };
      const sent = batch;
      const response = await this.runtime.send(sent);
      if (response.status < 200 || response.status >= 300) {
        this.runtime.warn();
        return { pending: true, delivered: false, retryAfterMs: response.retryAfterMs };
      }
      let pending = false;
      await this.runtime.exclusive(async () => {
        const journal = this.read();
        if (!journal || journal.pilotId !== sent.pilotId) throw new Error("Analytics identity changed");
        const ids = new Set(sent.events.map(event => event.eventId));
        const seen = new Set(journal.seen);
        sent.events.forEach(event => seen.add(analyticsEventKey(event)));
        const next = { ...journal, seen: Array.from(seen), pending: journal.pending.filter(event => !ids.has(event.eventId)) };
        this.write(next);
        pending = next.pending.length > 0;
      });
      return { pending, delivered: true };
    } catch {
      this.runtime.warn();
      return { pending: true, delivered: false };
    } finally { this.flushing = false; }
  }
}

let browserClient: PilotAnalyticsClient | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0, warned = false;
function schedule(delay = 150) {
  if (timer !== undefined || !browserClient) return;
  timer = setTimeout(async () => {
    timer = undefined;
    const result = await browserClient!.flush();
    failures = result.delivered ? 0 : Math.min(8, failures + 1);
    if (result.pending) schedule(result.delivered ? 150 :
      Math.max(Math.min(result.retryAfterMs ?? 0, 900_000), Math.min(60_000, 1000 * 2 ** failures)));
  }, delay);
}
function client() {
  if (browserClient) return browserClient;
  browserClient = new PilotAnalyticsClient({
    storage: {
      getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    now: Date.now, uuid: () => crypto.randomUUID(),
    exclusive: async work => {
      if (navigator.locks?.request) await navigator.locks.request("tablewise-pilot-analytics-v1", work);
      else await work();
    },
    send: async batch => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/analytics/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "omit", referrerPolicy: "no-referrer", keepalive: true,
          body: JSON.stringify(batch), signal: controller.signal,
        });
        const seconds = Number(response.headers.get("Retry-After"));
        return { status: response.status, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined };
      } finally { clearTimeout(timeout); }
    },
    warn: () => {
      if (!warned) { warned = true; console.warn("Pilot analytics delivery/storage unavailable; planning is unaffected."); }
    },
  });
  const resume = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; schedule(); };
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(); });
  return browserClient;
}
export function recordPilotEvent(name: ClientEventName, week: string, recipeId?: string): void {
  if (typeof window === "undefined") return;
  // Never await analytics in a UI mutation, or let telemetry errors escape.
  void client().record(name, week, recipeId).then(() => schedule()).catch(() => {});
}
