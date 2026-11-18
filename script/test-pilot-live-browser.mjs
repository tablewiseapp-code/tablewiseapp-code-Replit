// Browser test: the live planner and grocery list send the pilot funnel events, and AI controls hide when
// the server says this visitor cannot generate. Nothing is written server-side: analytics POSTs are answered here.
// Usage: node script/test-pilot-live-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-pilot-"));
const port = 9950 + Math.floor(Math.random() * 40);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0, generation = true; const waiting = {}, sent = [];
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1')" }); // skip the first-visit sign-in screen
  const fulfill = (requestId, body) => call("Fetch.fulfillRequest", {
    requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(body)).toString("base64"),
  });
  ws.onmessage = async m => {
    const d = JSON.parse(m.data);
    if (d.id) return waiting[d.id]?.(d);
    if (d.method !== "Fetch.requestPaused") return;
    const { requestId, request } = d.params;
    const path = new URL(request.url).pathname;
    if (path === "/api/analytics/events") { sent.push(...JSON.parse(request.postData).events); return fulfill(requestId, { accepted: true }); }
    if (path === "/api/operator/session") return fulfill(requestId, { operator: false, aiEnabled: false, generation });
    return call("Fetch.continueRequest", { requestId });
  };
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed"); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 120; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(120); } throw new Error(`timeout: ${what}`); };
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const names = name => sent.filter(e => e.name === name);
  const go = async path => { await call("Page.navigate", { url: BASE + path }); };

  await call("Page.enable"); await call("Runtime.enable");
  await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/analytics/events*" }, { urlPattern: "*/api/operator/session*" }] });
  await go("/"); await sleep(1500);
  const [first, second] = await ev(`fetch('/api/recipes').then(r => r.json()).then(list => list.slice(0, 2).map(r => r.id))`);
  // A plan restored from storage is not a new selection.
  await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','en');
    localStorage.setItem('weeklyMealsState', JSON.stringify({ selectedIds: [${JSON.stringify(first)}], planAssignments: [{ recipeId: ${JSON.stringify(first)}, mealType: 'Dinner', startDay: 0, spanDays: 1 }] }))`);
  sent.length = 0;

  await go("/meals");
  await until(el(`button-add-${second}`), "catalog");
  await until("true", "settle"); await sleep(800);
  assert.equal(names("planner_opened").length, 1, "planner_opened once");
  assert.equal(names("meal_selected").length, 0, "restored plan is not a selection");
  assert.match(sent[0].week, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${sent[0].week}T12:00:00Z`).getUTCDay(), 1, "week is a Monday");

  await ev(`${el(`button-add-${second}`)}.click()`); await sleep(800);
  assert.deepEqual(names("meal_selected").map(e => e.recipeId), [second]);

  await ev(`${el("button-generate-plan")}.click()`);
  await until(el("button-finalize-week"), "plan view");
  assert.equal(names("plan_completed").length, 0);
  await ev(`${el("button-finalize-week")}.click()`); await sleep(800);
  assert.equal(names("plan_completed").length, 1, "locking the week completes the plan");
  // Unlock and lock again in the same week: still one completion.
  await ev(`${el("button-unlock-week")}.click()`); await sleep(200);
  await ev(`${el("button-finalize-week")}.click()`); await sleep(800);
  assert.equal(names("plan_completed").length, 1);

  await go("/grocery-list"); await sleep(1500);
  assert.equal(names("grocery_list_opened").length, 1);

  // AI controls: shown when the server allows generation, hidden when it does not.
  await go("/my-ideas");
  await until(el("my-ideas-empty"), "my ideas"); await until(el("button-create-first-idea"), "create button");
  generation = false;
  await go("/my-ideas");
  await until(el("my-ideas-empty"), "my ideas without AI"); await sleep(800);
  assert.equal(await ev(`${el("button-create-first-idea")} === null && ${el("button-new-idea")} === null`), true, "no AI buttons when generation is off");
  await go("/meals");
  await until(el("button-generate-plan"), "planner without AI"); await sleep(800);
  assert.equal(await ev(`document.querySelector('[data-testid^="generate-recipe"]') === null`), true, "no Generate button when generation is off");

  console.log("PASS pilot live browser: planner_opened once, restored plan not counted, meal_selected on add, plan_completed on lock (once per week), grocery_list_opened, AI controls hidden when generation is off.");
} finally {
  chrome.kill();
  await sleep(300); try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chrome still closing */ }
}
