// Cook with what I have in a real browser: Home sheet, the Week's protein step, and Groceries' "Do you have enough?".
// Throwaway Chrome profile = new owner. Usage: node script/test-on-hand-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-on-hand-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const monday = offset => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const thisWeek = monday(0), nextWeek = monday(7);
const CHICKEN = "tablewise:diet:v1:paleo-thai-basil-chicken-lettuce-cups"; // "500 g minced chicken", serves 4
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
  await call("Page.enable"); await call("Runtime.enable");
  // An answered household; last week's shop bought chicken (and onions, which are not a protein).
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('tablewise_guest_v1','1');
    localStorage.getItem('tablewise_basic_settings') || localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped', noRestrictions: true, scheduled: true }, household: { servingsMode: 'fixed', fixedServings: 4 }, kitchen: { devices: ['Oven', 'Air fryer', 'Stovetop', 'Microwave'] } }));
    localStorage.getItem('tablewise:grocery-list:v1') || localStorage.setItem('tablewise:grocery-list:v1', JSON.stringify({ checked: ['500 g minced chicken', '2 onions'], expansion: {} }));` });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const qa = id => `Array.from(document.querySelectorAll('[data-testid="${id}"]'))`;
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}; page: ${(await ev("document.body.innerText.slice(0, 400)").catch(() => "?"))}; errors: ${errors.join(" | ")}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const click = id => ev(`${q(id)}.click()`);
  const type = (sel, value) => ev(`(() => { const el = ${sel}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const api = (method, path, body) => ev(`fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ""} }).then(r => r.status === 204 ? null : r.json())`);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // ---- Home: the compact action opens the sheet; last week's chicken is suggested unticked. ----
  await go("/", `Boolean(${q("home-cook-with-what-i-have")}) && !${q("home-cook-with-what-i-have")}.disabled`);
  ok(await ev(`Boolean(${q("home-task-preview")})`), "Tasks stay on Home");
  await click("home-cook-with-what-i-have");
  await until(`${qa("on-hand-name")}.length > 0`, "suggestions");
  eq(await ev(`${qa("on-hand-name")}.map(i => i.value)`), ["minced chicken"], "only the bought protein is suggested");
  eq(await ev(`${qa("on-hand-select")}.map(i => i.checked)`), [false], "suggestions start unchecked");
  ok(await ev(`${q("on-hand-find")}.disabled`), "nothing ticked: Find recipes is off");
  ok(await ev(`${q("on-hand-camera")}.disabled && /Coming later/.test(${q("on-hand-camera")}.textContent)`), "camera placeholder is disabled and labelled");
  ok(await ev(`${q("on-hand-minimize")}.getAttribute('aria-checked') === 'false'`), "Minimize groceries starts off");
  await click("on-hand-select");
  await until(`!${q("on-hand-find")}.disabled`, "find enabled");
  await click("on-hand-find");
  await until(`Boolean(${q("on-hand-results")} || ${q("on-hand-none")})`, "results");
  const found = await ev(`${qa("on-hand-results")}.length ? Array.from(${q("on-hand-results")}.querySelectorAll('a[href^="/recipe/"]')).map(a => decodeURIComponent(a.getAttribute('href'))) : []`);
  ok(found.some(href => href.includes(CHICKEN)), `a chicken recipe is found without an amount: ${found}`);
  const plan = await api("GET", `/api/week-plan?week=${thisWeek}`);
  ok(plan === null || plan.batches.length === 0, "Home suggestions change nothing in the Week");
  // Must include a protein no recipe uses: the requirement stays, with Edit search.
  await click("on-hand-edit");
  await until(`Boolean(${q("on-hand-input")})`, "back to the form");
  await type(q("on-hand-input"), "venison");
  await click("on-hand-add");
  await until(`${qa("on-hand-required")}.length === 2`, "typed entry");
  await ev(`${qa("on-hand-required")}[1].click()`);
  await click("on-hand-find");
  await until(`Boolean(${q("on-hand-none")})`, "no match");
  ok(/Must include/.test(await ev(`${q("on-hand-none")}.textContent`)), "a required protein with no match says so");
  ok(await ev(`Boolean(${q("on-hand-edit")})`), "Edit search is offered");

  // ---- The Week: next week asks first; Use selected proteins drafts with chicken and stores it. ----
  await go(`/meals?week=${nextWeek}`, `Boolean(${q("on-hand-step")})`);
  eq(await ev(`${qa("on-hand-select")}.map(i => i.checked)`), [false], "the Week's suggestion starts unchecked");
  await click("on-hand-select");
  await ev(`${q("on-hand-add-amount")}.click()`);
  await until(`Boolean(${q("on-hand-amount")})`, "amount field");
  await type(q("on-hand-amount"), "1 kg");
  await click("button-use-on-hand");
  await until(`Boolean(${q("week-status")})`, "the draft");
  await sleep(500);
  const next = await api("GET", `/api/week-plan?week=${nextWeek}`);
  eq(next.onHand, { minimize: false, items: [{ name: "minced chicken", amount: { quantity: 1000, unit: "g" } }] }, "the confirmed protein is stored on the Week");
  ok(next.batches.some(b => b.recipeId === CHICKEN), "the draft uses the protein on hand");
  // Skip: an ordinary draft, nothing stored.
  const later = monday(14);
  await go(`/meals?week=${later}`, `Boolean(${q("on-hand-step")})`);
  await click("button-skip-on-hand");
  await until(`Boolean(${q("week-status")})`, "the skipped draft");
  await sleep(500);
  eq((await api("GET", `/api/week-plan?week=${later}`)).onHand, null, "Skip stores nothing");

  // ---- Groceries: chicken confirmed without an amount keeps 500 g visible; Yes covers it; servings up asks for more. ----
  const dish = servings => ({ id: "d1", recipeId: CHICKEN, cookDate: thisWeek, serves: [{ date: thisWeek, servings }] });
  const week = (servings, onHand) => ({ weekStart: thisWeek, proposed: true, selectedIds: [], batches: [dish(servings)], approved: [dish(servings)], onHand });
  await api("PUT", "/api/week-plan", week(4, { minimize: false, items: [{ name: "chicken", amount: null }] }));
  // Grocery progress is per browser, not per week (docs/PRODUCT.md): last week's ticked chicken would count as bought.
  await ev(`localStorage.setItem('tablewise:grocery-list:v1', JSON.stringify({ checked: [], expansion: {} }))`);
  const chickenRow = `${qa("grocery-item-measure")}.find(e => /minced chicken/.test(e.closest('li').innerText))`;
  await go("/grocery-list", `Boolean(${q("on-hand-review")})`);
  ok(/500 g/.test(await ev(`${q("on-hand-review")}.closest('li').innerText`)), "the total stays visible for review");
  await click("on-hand-enough");
  await until(`!${q("on-hand-review")} && !${chickenRow}`, "covered");
  const covered = (await api("GET", `/api/week-plan?week=${thisWeek}`)).onHand;
  // Servings doubled: only the extra 500 g is asked about.
  await api("PUT", "/api/week-plan", week(8, covered));
  await go("/grocery-list", `Boolean(${q("on-hand-review")})`);
  eq(await ev(`${q("on-hand-review")}.dataset.kind`), "more", "demand beyond the confirmation is asked about");
  ok(/500 g/.test(await ev(`${q("on-hand-review")}.closest('li').innerText`)), "the extra amount is listed");
  // Enter what I have: 600 g of 1 kg leaves 400 g.
  await click("on-hand-enter");
  await until(`Boolean(${q("on-hand-amount-input")})`, "amount dialog");
  await type(q("on-hand-amount-input"), "600 g");
  await ev(`${q("on-hand-amount-input")}.form.requestSubmit()`);
  await until(`/400 g/.test(${chickenRow}?.closest('li').innerText ?? '')`, "400 g left");
  ok(!(await ev(`Boolean(${q("on-hand-review")})`)), "a known amount needs no review");
  // Reopening produces the same total.
  await go("/grocery-list", `Boolean(${chickenRow})`);
  ok(/400 g/.test(await ev(`${chickenRow}.closest('li').innerText`)), "the same total after reopening");
  eq(errors, [], "no page errors");
  console.log(`on-hand browser: ${checks} checks passed`);
} finally {
  chrome.kill();
  await sleep(300); try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome still closing */ }
}
