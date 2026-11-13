// Week display controls, nutrition row, mobile filter sheet and Undo in a real browser (throwaway Chrome profile; reads recipes only).
// Usage: node script/test-week-display-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-week-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
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
  const until = async (expr, what) => { for (let i = 0; i < 60; i++) { if (await ev(`Boolean(${expr})`).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const cards = `[...document.querySelectorAll('[data-testid^="recipe-card-"]')]`;
  await call("Runtime.enable");

  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: BASE }); await sleep(1000);
  await ev("localStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await call("Page.navigate", { url: `${BASE}/meals` });
  await until(`${cards}.length > 0`, "cards");

  // Display controls: Time Prep / Total (pressed buttons) and Show nutrition (switch, default Off).
  const toggle = q("nutrition-details-toggle");
  ok(await ev(`${toggle}.getAttribute("role") === "switch" && ${toggle}.getAttribute("aria-checked") === "false"`), "nutrition is a switch, Off by default");
  ok(await ev(`${cards}.every(c => !c.querySelector('[data-testid^="meals-catalog-nutrition-"]'))`), "Off: no nutrition on cards");
  ok(await ev(`!document.body.innerText.includes("Chef / creator not specified") && !/\\bai-generated\\b|meal:dinner|Source-verified/.test(document.querySelector("#meal-results").innerText)`), "no internal tags or missing-author text on cards");

  await ev(`${toggle}.click()`);
  await until(`${toggle}.getAttribute("aria-checked") === "true"`, "nutrition on");
  ok(await ev(`${cards}.every(c => c.querySelector('[data-testid^="meals-catalog-nutrition-"]'))`), "On: every visible card has a nutrition row");
  ok(await ev(`${cards}.every(c => { const r = c.querySelector('[data-testid^="meals-catalog-nutrition-"]'); return r.dataset.state === "unavailable" ? r.textContent.trim() === "Nutrition unavailable" : /kcal/.test(r.textContent) && /Per |per /.test(r.textContent) && /Estimate/.test(r.textContent); })`), "rows show values with basis + estimate, or 'Nutrition unavailable'");
  ok(await ev(`!/(^|\\D)0 kcal/.test(document.querySelector("#meal-results").innerText)`), "never '0 kcal'");
  ok(await ev(`document.body.innerText.includes("Show nutrition: On")`), "state announced");
  // A recipe with real estimates renders numbers (12 such recipes exist in the dev catalog; search one by page).
  const withData = await ev(`fetch("/api/recipes").then(r => r.json()).then(rs => rs.filter(r => r.nutrition && !/mock/i.test(r.nutrition.model)).map(r => r.title))`);
  if (withData.length) {
    await ev(`(() => { const i = ${q("recipe-search-input")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(withData[0])}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await until(`${cards}.some(c => c.querySelector('[data-state="available"]'))`, "card with nutrition values");
    ok(await ev(`${cards}.some(c => /\\d+ kcal/.test(c.querySelector('[data-state="available"]')?.textContent ?? ""))`), "real estimates show kcal values");
    await ev(`${q("recipe-search-clear")}.click()`); await until(`${cards}.length >= 10`, "search cleared");
  }
  await ev(`${toggle}.click()`);
  await until(`${cards}.every(c => !c.querySelector('[data-testid^="meals-catalog-nutrition-"]'))`, "nutrition off again");

  // Time mode switches the card meta label.
  await ev(`${q("meals-time-preparation")}.click()`);
  await until(`${q("meals-time-preparation")}.getAttribute("aria-pressed") === "true"`, "prep mode");
  ok(await ev(`${cards}.every(c => !/Total \\d+ min/.test(c.innerText))`), "Prep mode shows no Total labels");
  await ev(`${q("meals-time-total")}.click()`);
  await until(`${cards}.some(c => /Total \\d+ min/.test(c.innerText))`, "total mode label");
  checks++;

  // Undo restores a removed selection in the same position.
  const ids = await ev(`${cards}.slice(0, 3).map(c => c.dataset.testid.slice("recipe-card-".length))`);
  for (const id of ids) { await ev(`${q(`button-add-${id}`)}.click()`); await sleep(150); }
  const before = await ev(`[...document.querySelectorAll('[data-testid^="selected-recipe-link-"]')].map(a => a.dataset.testid)`);
  await ev(`${q(`remove-selected-${ids[1]}`)}.click()`);
  await until(`Boolean([...document.querySelectorAll("li[role=status] button")].find(b => b.textContent.trim() === "Undo"))`, "undo toast");
  await ev(`[...document.querySelectorAll("li[role=status] button")].find(b => b.textContent.trim() === "Undo").click()`);
  await until(`[...document.querySelectorAll('[data-testid^="selected-recipe-link-"]')].map(a => a.dataset.testid).join() === ${JSON.stringify(before.join())}`, "undo restores order");
  checks++;

  // Mobile 375: filters in a sheet with Show results / Clear filters; no horizontal overflow.
  await call("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  ok(await ev(`getComputedStyle(document.getElementById("meal-filters")).display === "none"`), "sidebar hidden on mobile");
  ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal overflow at 375");
  await ev(`${q("button-open-filters")}.click()`);
  await until(`Boolean(${q("filters-sheet")})`, "filter sheet");
  await ev(`${q("filters-sheet")}.querySelector('[data-filter-section="mealType"] button').click()`);
  await until(`${q("filters-sheet")}.querySelector('[data-testid="filter-meal-dinner"]')`, "meal type expanded");
  await ev(`${q("filters-sheet")}.querySelector('[data-testid="filter-meal-dinner"]').click()`);
  await until(`/Show \\d+ results?/.test(${q("sheet-show-results")}.textContent) && ${q("filters-sheet")}.querySelector('[data-testid="active-filter-chip"]')`, "chip + count");
  ok(await ev(`${q("sheet-clear-filters")}.disabled === false`), "Clear filters enabled with a filter applied");
  await ev(`${q("sheet-show-results")}.click()`);
  await until(`!${q("filters-sheet")}`, "sheet closes");
  ok(await ev(`${q("button-open-filters")}.textContent.includes("Filters (1)")`), "trigger shows count");
  await ev(`${q("button-open-filters")}.click()`); await until(`Boolean(${q("filters-sheet")})`, "sheet again");
  await ev(`${q("sheet-clear-filters")}.click()`);
  await until(`${q("sheet-clear-filters")}.disabled`, "filters cleared");
  ok(true, "Clear filters works");

  ok(errors.length === 0, `no page errors: ${errors}`);
  console.log(`PASS Week display browser: ${checks} checks — nutrition switch Off/On, rows or 'Nutrition unavailable', never 0 kcal, Prep/Total labels, no internal tags, Undo restores order, mobile filter sheet, 375px no overflow`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
