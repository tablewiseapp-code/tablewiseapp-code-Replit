import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import express from "express";
import { installPilotSecurity, apiErrorHandler, type PilotSecurity } from "../server/security";
import { registerChatRoutes } from "../server/replit_integrations/chat/routes";
import { registerAudioRoutes } from "../server/replit_integrations/audio/routes";
import { registerImageRoutes } from "../server/replit_integrations/image/routes";
import type { IChatStorage } from "../server/replit_integrations/chat/storage";

// All dependencies are in-memory fakes. Never import DB/client modules or read credentials.
const token = "offline-operator-token-".repeat(3);
type Kind = "chat" | "audio" | "image";
async function fixture(kind: Kind, enabled = true, configured = true) {
  const app = express();
  const security = installPilotSecurity(app, {
    operatorToken: configured ? token : undefined, aiEnabled: enabled,
    publicCatalog: true, production: false,
  });
  let providerLoads = 0, providerCalls = 0, storageCalls = 0, conversions = 0;
  let fail = false, streamFail = false, history: { role: string; content: string }[] = [];
  const controls = { ...security };
  const held: (() => void)[] = [];
  let hold = false;
  async function* stream() {
    yield { choices: [{ delta: { content: "hello", audio: { transcript: "hello", data: "AAAA" } } }] };
    if (streamFail) throw new Error("private-stream-error");
  }
  const provider = {
    chat: { completions: { async create() {
      providerCalls++;
      if (hold) await new Promise<void>(resolve => held.push(resolve));
      if (fail) throw new Error("private-provider-error");
      return stream();
    } } },
    images: { async generate() {
      providerCalls++;
      if (hold) await new Promise<void>(resolve => held.push(resolve));
      if (fail) throw new Error("private-provider-error");
      return { data: [{ b64_json: "offline-image" }] };
    } },
  };
  const storage = new Proxy({}, { get(_target, key) {
    if (key === "then") return undefined;
    return async () => {
      storageCalls++;
      if (key === "getConversation") return { id: 1, title: "Offline" };
      if (key === "getMessagesByConversation") return history;
      if (key === "getAllConversations") return [];
      return { id: 1, title: "Offline" };
    };
  } }) as IChatStorage;
  const loadStorage = async () => storage;
  const audioProvider = {
    openai: provider,
    async ensureCompatibleFormat(buffer: Buffer) { conversions++; return { buffer, format: "wav" as const }; },
    async speechToText() { providerCalls++; return "offline transcript"; },
  };
  if (kind === "chat") registerChatRoutes(app, controls, {
    loadStorage, loadProvider: async () => {
      providerLoads++; return provider as unknown as Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof registerChatRoutes>[2]>["loadProvider"]>>>;
    },
  });
  if (kind === "audio") registerAudioRoutes(app, controls, {
    loadStorage, loadProvider: async () => {
      providerLoads++; return audioProvider as unknown as Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof registerAudioRoutes>[2]>["loadProvider"]>>>;
    },
  });
  if (kind === "image") registerImageRoutes(app, controls, {
    loadProvider: async () => {
      providerLoads++; return { openai: provider } as unknown as Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof registerImageRoutes>[2]>["loadProvider"]>>>;
    },
  });
  app.get("/api/unrelated", (_req, res) => res.json({ ok: true }));
  app.use(apiErrorHandler);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const path = kind === "image" ? "/api/generate-image" : "/api/conversations/1/messages";
  const body = kind === "image" ? { prompt: "Offline image" } :
    kind === "audio" ? { audio: Buffer.alloc(24).toString("base64") } : { content: "Offline message" };
  return {
    body, path, security,
    counts: () => ({ providerLoads, providerCalls, storageCalls, conversions }),
    fail: () => { fail = true; }, streamFail: () => { streamFail = true; },
    history: (value: typeof history) => { history = value; },
    hold: () => { hold = true; }, release: () => { hold = false; held.splice(0).forEach(fn => fn()); },
    async request(url = path, data: unknown = body, auth = true, method = "POST", headers: Record<string, string> = {}) {
      return fetch(base + url, {
        signal: AbortSignal.timeout(10_000),
        method, headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}),
          ...(method === "GET" ? {} : { "Content-Type": "application/json" }), ...headers },
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(data),
      });
    },
    async raw(text: string) {
      return fetch(base + path, { signal: AbortSignal.timeout(10_000), method: "POST", headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      }, body: text });
    },
    async login() {
      const response = await fetch(base + "/api/operator/session", {
        method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      assert.equal(response.status, 303);
      return response.headers.get("set-cookie")!.split(";")[0];
    },
    base,
    async close() { held.splice(0).forEach(fn => fn()); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

for (const register of [registerChatRoutes, registerAudioRoutes, registerImageRoutes]) {
  assert.throws(() => register(express(), undefined as unknown as PilotSecurity), /require pilot security/);
}
const activeRoutes = await readFile("server/routes.ts", "utf8");
assert.doesNotMatch(activeRoutes, /register(?:Chat|Audio|Image)Routes/);

for (const kind of ["chat", "audio", "image"] as const) {
  for (const [enabled, configured] of [[false, true], [true, false], [true, true]]) {
    const f = await fixture(kind, enabled, configured);
    try {
      const before = f.counts();
      assert.equal((await f.request(undefined, undefined, false)).status, 403);
      assert.equal((await f.request(undefined, undefined, true, "POST", { Authorization: "Bearer wrong" })).status, 403);
      if (!enabled || !configured) {
        assert.equal((await f.request()).status, configured ? 503 : 403);
      } else {
        const cookie = await f.login();
        assert.equal((await f.request(undefined, undefined, false, "POST", { Cookie: cookie })).status, 403);
        assert.equal((await f.request(undefined, undefined, false, "POST", { Cookie: cookie, Origin: "https://foreign.invalid" })).status, 403);
      }
      if (kind !== "image") {
        for (const [url, method] of [["/api/conversations", "GET"], ["/api/conversations/1", "GET"],
          ["/api/conversations", "POST"], ["/api/conversations/1", "DELETE"]]) {
          assert.equal((await f.request(url, {}, false, method)).status, 403);
          if (!enabled) assert.equal((await f.request(url, {}, true, method)).status, 503);
        }
      }
      assert.deepEqual(f.counts(), before, `${kind}: denial must not load providers, convert audio, or access storage`);
      assert.equal((await f.request("/api/unrelated", undefined, false, "GET")).status, 200);
    } finally { await f.close(); }
  }
  const f = await fixture(kind);
  try {
    const invalid = kind === "image" ?
      [{ prompt: "" }, { prompt: "x".repeat(4001) }, { prompt: "x", size: "999x999" }, { prompt: "x", n: 5 }] :
      kind === "audio" ? [{ audio: "not base64!" }, { audio: 42 }, { ...f.body, voice: "invalid" },
        { audio: Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64") }] :
        [{ content: "" }, { content: "x".repeat(8001) }, { content: 42 }, { content: "x", role: "system" }];
    for (const body of [null, [], {}, ...invalid]) assert.equal((await f.request(undefined, body)).status, 400);
    assert.equal((await f.raw("{")).status, 400);
    assert.equal((await f.raw(JSON.stringify({ extra: "x".repeat(kind === "audio" ? 6 * 1024 * 1024 : 50_000) }))).status, 413);
    if (kind !== "image") {
      for (const id of ["0", "-1", "1abc", "1.5", "2147483648"]) {
        assert.equal((await f.request(`/api/conversations/${id}/messages`)).status, 400);
        assert.equal((await f.request(`/api/conversations/${id}`, undefined, true, "GET")).status, 400);
      }
      assert.equal((await f.request("/api/conversations", { title: "x".repeat(201) })).status, 400);
    }
    assert.deepEqual(f.counts(), { providerLoads: 0, providerCalls: 0, storageCalls: 0, conversions: 0 });
    // Invalid requests must not consume paid-AI budget.
    for (let i = 0; i < 5; i++) {
      const response = await f.request();
      assert.equal(response.status, 200);
      await response.text();
    }
    const before = f.counts();
    const limited = await f.request();
    assert.equal(limited.status, 429);
    assert(limited.headers.get("retry-after"));
    assert.deepEqual(f.counts(), before);
  } finally { await f.close(); }

  // Failures must release the two shared AI slots; a third failure must reach the fake provider.
  for (const afterHeaders of kind === "image" ? [false] : [false, true]) {
    const f = await fixture(kind);
    try {
      if (afterHeaders) f.streamFail(); else f.fail();
      for (let i = 0; i < 3; i++) {
        if (!afterHeaders) {
          const response = await f.request();
          assert.equal(response.status, 500);
          assert.doesNotMatch(await response.text(), /private-/);
        } else {
          // A destroyed SSE socket can fail either fetch itself or body consumption.
          await assert.rejects(async () => { await (await f.request()).text(); });
        }
      }
      assert.equal(f.counts().providerLoads, 3);
    } finally { await f.close(); }
  }
  const concurrent = await fixture(kind);
  try {
    concurrent.hold();
    const first = concurrent.request(), second = concurrent.request();
    // Wait for both fake providers, not a fixed wall-clock delay.
    for (let i = 0; i < 100 && concurrent.counts().providerLoads < 2; i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(concurrent.counts().providerLoads, 2);
    const before = concurrent.counts();
    assert.equal((await concurrent.request()).status, 429);
    assert.deepEqual(concurrent.counts(), before);
    concurrent.release();
    for (const response of await Promise.all([first, second])) {
      assert.equal(response.status, 200); await response.text();
    }
    const response = await concurrent.request();
    assert.equal(response.status, 200); await response.text();
  } finally { await concurrent.close(); }

  if (kind !== "image") {
    const f = await fixture(kind);
    try {
      f.history(Array.from({ length: 33 }, () => ({ role: "user", content: "old" })));
      assert.equal((await f.request()).status, 500);
      assert.equal(f.counts().providerLoads, 0);
      assert.equal(f.counts().conversions, 0);
    } finally { await f.close(); }
  }
}
console.log("Optional AI route checks passed (offline providers and storage only).");
