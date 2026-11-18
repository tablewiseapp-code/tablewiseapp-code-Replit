// Home screen in a real browser (throwaway Chrome profile = new owner; adds and removes its own grocery extras).
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
  for (const slot of ["breakfast", "lunch", "dinner"]) eq(await ev(`${q(`home-add-${slot}`)}.getAttribute("href")`), "/meals?plan", `+ Add ${slot}`);
  eq(await text("home-add-dinner"), "+ Add dinner", "add dinner copy");
  await until(`Boolean(${q("home-add-item")})`, "empty groceries");
  eq(await current('[data-testid="app-nav-header"]'), "/", "Home active");
  await ev(`${q("home-add-item")}.click()`);
  await until(`location.pathname === "/grocery-list" && Boolean(${q("input-add-item")})`, "Add item opens the add form");

  // ---- Today's dinner plus a hand-added product that is also a recipe ingredient.
  const recipe = await ev(`fetch("/api/recipes").then(r => r.json()).then(list => list.find(r => r.ingredients.length > 1))`);
  ok(recipe, "a recipe with ingredients");
  await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify({ selectedIds: [${JSON.stringify(recipe.id)}], planAssignments: [{ recipeId: ${JSON.stringify(recipe.id)}, mealType: "Dinner", startDay: new Date().getDay(), spanDays: 1 }] }))`);
  const extras = []; // one at a time: parallel first requests would each get a new owner cookie
  for (const text of [recipe.ingredients[0].toUpperCase(), "Home test product"])
    extras.push(await ev(`fetch("/api/grocery-extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: ${JSON.stringify(text)} }) }).then(r => r.json()).then(x => x.id)`));
  try {
    await go("/", `Boolean(${q("home-grocery-count")}) && Boolean(${q(`home-meal-${recipe.id}`)})`);
    ok((await text("home-meals")).includes("DINNER") || (await text("home-meals")).includes("Dinner"), "grouped under Dinner");
    ok(Boolean(await text("home-add-breakfast")) && Boolean(await text("home-add-lunch")) && !(await text("home-add-dinner")), "empty slots offer + Add, filled slot does not");
    const expected = new Set(recipe.ingredients.map(i => i.toLowerCase())).size + 1;
    eq(await text("home-grocery-count"), `${expected} items to buy`, "manual item matching an ingredient counted once");
    await ev(`localStorage.setItem("tablewise:grocery-list:v1", JSON.stringify({ checked: [...${JSON.stringify(recipe.ingredients)}.map(i => i.toLowerCase()), "home test product"], expansion: {} }))`);
    await go("/", `Boolean(${q("home-grocery-count")})`);
    eq(await text("home-grocery-count"), "All groceries checked.", "all checked");
    await ev(`${q(`home-meal-${recipe.id}`)}.click()`);
    await until(`location.pathname === "/recipe/${encodeURIComponent(recipe.id)}" && Boolean(${q("text-recipe-title")})`, "meal opens recipe");

    // ---- Mobile and Hebrew.
    await size(390, true);
    await ev("localStorage.setItem('tablewise_language','he')");
    await go("/", `Boolean(${q("home-grocery-count")})`);
    eq(await ev("document.documentElement.dir"), "rtl", "rtl");
    ok(await ev(`${q("home-meals")}.getBoundingClientRect().bottom <= ${q("home-groceries")}.getBoundingClientRect().top`), "meals above groceries");
    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
    await go("/plan", `location.pathname === "/meals"`); // deep link still redirects to Week
  } finally {
    await ev(`Promise.all(${JSON.stringify(extras)}.map(id => fetch("/api/grocery-extras/" + id, { method: "DELETE" })))`);
  }
  eq(errors, [], "no page errors");
  console.log(`PASS home browser: ${checks} checks`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
