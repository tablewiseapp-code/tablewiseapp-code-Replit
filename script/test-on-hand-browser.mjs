// Find my dish (Home) and Cook with what I have in a real browser: the Week's protein step, and Groceries' "Do you have enough?".
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

  // ---- Home → Find my dish (2026-11-22): one protein, optional Leave out; one main dish; writes nothing. ----
  const key = (sel, k) => ev(`${sel}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);
  const stored = () => ev(`JSON.stringify([localStorage.getItem('tablewise_basic_settings'), localStorage.getItem('weeklyMealsState'), localStorage.getItem('tablewise:grocery-list:v1')])`);
  await go("/", `Boolean(${q("home-find-my-dish")}) && !${q("home-find-my-dish")}.disabled`);
  ok(await ev(`Boolean(${q("home-task-preview")})`), "Tasks stay on Home");
  const before = [await stored(), await api("GET", `/api/week-plan?week=${thisWeek}`), await api("GET", "/api/household-settings")];
  await click("home-find-my-dish");
  await until(`Boolean(${q("find-my-dish-result")})`, "one click shows a dish");
  // Tap an ingredient as had: ✓, struck through, moved below the others; tap again restores its place.
  const rows = () => ev(`${qa("find-my-dish-ingredient")}.map(b => b.getAttribute('aria-pressed') + ':' + b.textContent)`);
  const start = await rows();
  ok(start.length >= 2 && start.every(r => r.startsWith("false:")), "every row starts unchecked");
  await ev(`${qa("find-my-dish-ingredient")}[0].click()`);
  const tapped = await rows();
  eq(tapped.at(-1), start[0].replace("false:", "true:"), "the tapped row moves to the bottom, checked");
  ok(await ev(`document.activeElement?.textContent === ${JSON.stringify(start[0].slice(6))}`), "focus stays on the tapped row");
  ok(await ev(`${q("find-my-dish-ingredients")}.querySelector('[aria-pressed=true] .line-through') !== null && /You have/.test(${q("find-my-dish-have")}.textContent)`), "struck through; You have updated");
  await ev(`${qa("find-my-dish-ingredient")}.at(-1).click()`);
  eq(await rows(), start, "a second tap restores the recipe order");
  await click("find-my-dish-edit");
  await until(`Boolean(${q("find-protein")})`, "the search controls");
  ok(await ev(`${q("find-protein")}.getAttribute('aria-expanded') === 'false' && ${q("find-protein")}.placeholder === 'Select or type a protein…'`), "closed at first, gray placeholder");
  ok(await ev(`${q("find-fridge")}.disabled && /Upload your fridge/.test(${q("find-fridge")}.textContent) && /Coming soon/.test(${q("find-fridge")}.textContent) && !document.querySelector('[data-testid="find-my-dish"] input[type=file]')`), "camera disabled, no file chooser");
  await key(q("find-protein"), "ArrowDown");
  await until(`Boolean(${q("find-protein-options")})`, "opened by keyboard");
  eq(await ev(`${qa("find-protein-option")}.slice(0, 2).map(o => o.textContent)`), ["Beef", "Chicken"], "Beef first, Chicken second");
  await type(q("find-protein"), "salm");
  eq(await ev(`${qa("find-protein-option")}.map(o => o.textContent)`), ["Salmon", "Use “salm”"], "typing narrows to specific kinds; own text offered");
  await type(q("find-protein"), "chick");
  await ev(`${qa("find-protein-option")}.find(o => o.textContent === 'Chicken').click()`);
  eq(await ev(`${q("find-protein")}.value`), "Chicken", "a suggestion picked by touch");
  await click("find-leave-out-open");
  await type(q("find-leave-out"), "Mushrooms");
  await key(q("find-leave-out"), "Enter");
  await until(`${qa("find-leave-out-remove")}.length === 1`, "Leave out added with Enter");
  await click("find-my-dish-submit");
  await until(`Boolean(${q("find-my-dish-result")})`, "a dish");
  const first = await ev(`${q("find-my-dish-result")}.querySelector('a[href^="/recipe/"]').getAttribute('href')`);
  ok(!/mushroom/i.test(await ev(`${q("find-my-dish-ingredients")}.textContent`)), "no mushrooms");
  ok(/chicken/i.test(await ev(`${q("find-my-dish-result")}.textContent`)), `a chicken dish: ${first}`);
  await click("find-my-dish-another");
  await until(`${q("find-my-dish-result")}.querySelector('a[href^="/recipe/"]').getAttribute('href') !== ${JSON.stringify(first)} || Boolean(${q("find-my-dish-no-other")})`, "Try another");
  await click("find-my-dish-edit");
  await until(`${q("find-protein")}?.value === "Chicken" && ${qa("find-leave-out-remove")}.length === 1`, "Edit search keeps the choices");
  // Own text with no match: the message, inputs kept.
  await type(q("find-protein"), "kangaroo");
  await click("find-my-dish-submit");
  await until(`Boolean(${q("find-my-dish-none")})`, "no match");
  ok(/No matching dish yet/.test(await ev(`${q("find-my-dish-none")}.textContent`)) && (await ev(`${q("find-protein")}.value`)) === "kangaroo", "no match keeps the inputs");
  // Close and reopen: a blank search.
  await key("document.activeElement || document.body", "Escape");
  await until(`!${q("find-my-dish")}`, "closed");
  await click("home-find-my-dish");
  await until(`Boolean(${q("find-my-dish-result")}) && !${q("find-my-dish-have")}`, "reopened blank, on a dish");
  await click("find-my-dish-edit");
  await until(`${q("find-protein")}?.value === "" && !${q("find-leave-out")}`, "blank search");
  eq([await stored(), await api("GET", `/api/week-plan?week=${thisWeek}`), await api("GET", "/api/household-settings")], before, "the search writes nothing");
  // Start cooking: Zen mode at the first step.
  await type(q("find-protein"), "Fish");
  await click("find-my-dish-submit");
  await until(`Boolean(${q("find-my-dish-start")})`, "a fish dish");
  await click("find-my-dish-start");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("cooking-mode")})`, "Zen mode");

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
