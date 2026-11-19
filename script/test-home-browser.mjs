// Home screen in a real browser (throwaway Chrome profile = new owner; adds and removes its own Home tasks).
// Usage: node script/test-home-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-home-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1')" }); // skip the first-visit sign-in screen
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 60; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready ?? `Boolean(${q("app-nav-header")})`, path); };
  const size = (width, mobile) => call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile });
  const hrefs = sel => ev(`Array.from(document.querySelectorAll('${sel}')).map(a => a.getAttribute("href"))`);
  const labels = sel => ev(`Array.from(document.querySelectorAll('${sel}')).map(a => a.textContent.trim())`);
  const current = sel => ev(`document.querySelector('${sel} [aria-current="page"]')?.getAttribute("href") ?? null`);
  await call("Runtime.enable");
  const text = sel => ev(`${q(sel)}?.innerText ?? null`);

  // ---- First visit: everything empty, each meal slot offers "+ Add".
  await size(1280, false);
  await go("/");
  await ev("localStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await go("/", `Boolean(${q("home-meals")})`);
  eq(await text("text-page-title"), "Home", "title");
  eq(await text("text-home-date"), await ev(`new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })`), "local date");
  for (const slot of ["breakfast", "lunch", "dinner"]) eq(await ev(`${q(`home-add-${slot}`)}.tagName`), "BUTTON", `+ Add ${slot} opens the picker, not the Week`);
  eq(await text("home-add-dinner"), "+ Add dinner", "add dinner copy");
  eq(await current('[data-testid="app-nav-header"]'), "/", "Home active");
  ok(await ev(`!${q("home-groceries")}`), "no grocery card on Home");

  // ---- Today's dinner.
  const recipe = await ev(`fetch("/api/recipes").then(r => r.json()).then(list => list.find(r => r.ingredients.length > 1))`);
  ok(recipe, "a recipe with ingredients");
  await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify({ selectedIds: [${JSON.stringify(recipe.id)}], planAssignments: [{ recipeId: ${JSON.stringify(recipe.id)}, mealType: "Dinner", startDay: new Date().getDay(), spanDays: 1 }] }))`);
  try {
    await go("/", `Boolean(${q(`home-meal-${recipe.id}`)})`);
    ok((await text("home-meals")).includes("DINNER") || (await text("home-meals")).includes("Dinner"), "grouped under Dinner");
    ok(Boolean(await text("home-add-breakfast")) && Boolean(await text("home-add-lunch")) && !(await text("home-add-dinner")), "empty slots offer + Add, filled slot does not");
    await ev(`${q(`home-meal-${recipe.id}`)}.click()`);
    await until(`location.pathname === "/recipe/${encodeURIComponent(recipe.id)}" && Boolean(${q("text-recipe-title")})`, "meal opens recipe");

    // ---- Mobile and Hebrew.
    await size(390, true);
    await ev("localStorage.setItem('tablewise_language','he')");
    await go("/", `Boolean(${q("home-meals")})`);
    eq(await ev("document.documentElement.dir"), "rtl", "rtl");
    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
    await go("/plan", `location.pathname === "/meals"`); // deep link still redirects to Week

    // ---- Tasks: collapsed, with the open-task count beside the title; opening shows every open task.
    await ev("localStorage.setItem('tablewise_language','en')");
    await ev(`Promise.all(Array.from({ length: 15 }, (_, i) => fetch("/api/home-tasks/" + crypto.randomUUID(), { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Home browser task " + (i + 1), dueDate: null, priority: "normal", image: null, completedAt: null }) })))`);
    for (const [width, height] of [[375, 667], [360, 640]]) {
      await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
      await go("/", `Boolean(${q("home-task-count")})`); await sleep(300);
      ok(await ev(`document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth`), `${width}px: Home does not scroll`);
    }
    eq(await text("home-task-count"), "15", "task count beside the title");
    ok(await ev(`!${q("home-task-preview")}.open`), "tasks collapsed");
    eq(await labels('[data-testid="app-nav-bottom"] a'), ["Home", "Groceries", "Tasks"], "bottom tabs");
    ok(await ev(`${q("home-task-preview")}.getBoundingClientRect().bottom <= ${q("app-nav-bottom")}.getBoundingClientRect().top`), "meals and collapsed tasks above the tabs");
    await ev(`${q("home-task-preview")}.querySelector("summary").click()`);
    eq(await ev(`document.querySelectorAll('[data-testid="home-task"]').length`), 15, "opened: every open task");
    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
    await ev(`${q("link-view-all-tasks")}.click()`);
    await until(`location.pathname === "/home-tasks"`, "View all tasks opens Tasks");
    eq(await current('[data-testid="app-nav-bottom"]'), "/home-tasks", "Tasks tab active");
    await ev(`fetch("/api/home-tasks").then(r => r.json()).then(list => Promise.all(list.map(t => fetch("/api/home-tasks/" + t.id, { method: "DELETE" }))))`);

    // ---- "+ Add lunch": a suggestion from the household settings, added only after the person agrees; no trip to the Week.
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await go("/", `Boolean(${q("home-add-lunch")}) && !${q("home-add-lunch")}.disabled`);
    await ev(`${q("home-add-lunch")}.click()`);
    await until(`Boolean(${q("meal-suggestion-recipe")})`, "picker suggests a recipe");
    ok((await text("meal-suggestion")).includes("Today’s lunch"), "picker is for today's lunch");
    ok(Boolean(await text("meal-suggestion-filters")), "household settings shown");
    const lunchPlanned = `(JSON.parse(localStorage.getItem("weeklyMealsState") ?? "{}").planAssignments?.filter(a => a.mealType === "Lunch") ?? [])`;
    eq(await ev(`${lunchPlanned}.length`), 0, "nothing added before the person agrees");
    const first = await ev(`${q("meal-suggestion-recipe")}.dataset.recipeId`);
    if (await ev(`Boolean(${q("meal-suggestion-another")})`)) {
      await ev(`${q("meal-suggestion-another")}.click()`);
      ok(await ev(`${q("meal-suggestion-recipe")}.dataset.recipeId`) !== first, "Suggest another shows a different recipe");
    }
    const pick = await ev(`${q("meal-suggestion-recipe")}.dataset.recipeId`);
    await ev(`${q("meal-suggestion-add")}.click()`);
    await until(`!${q("meal-suggestion")} && Boolean(document.querySelector('[data-testid="home-meal-${pick}"]'))`, "added meal shows on Home");
    eq(await ev("location.pathname"), "/", "stays on Home");
    eq(await ev(`${lunchPlanned}.map(a => [a.recipeId, a.startDay])`), [[pick, await ev("new Date().getDay()")]], "added to today's lunch");
    // A locked Week is never changed from Home.
    await ev(`localStorage.setItem("week_locked_v1", "true"); ${q("home-add-breakfast")}.click()`);
    await until(`Boolean(${q("meal-suggestion-blocked")})`, "locked message");
    eq(await ev(`${q("meal-suggestion-add")}?.disabled ?? true`), true, "Add disabled while the Week is locked");
  } finally {
    await ev(`fetch("/api/home-tasks").then(r => r.json()).then(list => Promise.all(list.map(t => fetch("/api/home-tasks/" + t.id, { method: "DELETE" }))))`);
  }
  eq(errors, [], "no page errors");
  console.log(`PASS home browser: ${checks} checks`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
