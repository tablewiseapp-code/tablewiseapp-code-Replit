// UI pass checks in a real browser (throwaway Chrome profile; reads recipes only, plan lives in that profile).
// Grocery "Uncheck all" Undo, recipe cards without internal/placeholder content, recipe detail header order, nutrition honesty.
// Usage: node script/test-ui-pass-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-ui-"));
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
  const until = async (expr, what) => { for (let i = 0; i < 60; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  await call("Runtime.enable");
  const recipes = await fetch(`${BASE}/api/recipes`).then(r => r.json());
  const withNutrition = recipes.find(r => r.nutrition && !/mock/i.test(r.nutrition.model));
  const without = recipes.find(r => !r.nutrition);

  for (const width of [375, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 812, deviceScaleFactor: 1, mobile: width < 600 });
    await go("/", "true");
    const ids = recipes.slice(0, 3).map(r => r.id);
    const plan = { selectedIds: ids, planAssignments: ids.map((recipeId, i) => ({ recipeId, mealType: "Dinner", startDay: i, spanDays: 1 })) };
    await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','en'); localStorage.setItem('weeklyMealsState', ${JSON.stringify(JSON.stringify(plan))})`);

    // Recipes: cards show title, time/servings and dietary labels only — no internal tags or "not specified" filler.
    await go("/recipes", `document.querySelectorAll('[data-testid^="card-recipe-"]').length === ${recipes.length}`);
    const cardText = await ev(`Array.from(document.querySelectorAll('[data-testid^="card-recipe-"]')).map(c => c.innerText).join("\\n")`);
    ok(!/not specified|source-verified|ai-generated|meal:|synthetic test data|development estimates|ingredients - /i.test(cardText), `${width}: no internal or filler text on cards`);
    ok(await ev(`Array.from(document.querySelectorAll('[data-testid^="text-recipe-title-"]')).every(h => getComputedStyle(h).textOverflow !== "ellipsis" && getComputedStyle(h).whiteSpace !== "nowrap")`), `${width}: titles wrap`);
    ok(await ev(`!document.querySelector('[data-testid^="card-recipe-"] img') || Array.from(document.querySelectorAll('[data-testid^="card-recipe-"] img')).every(i => i.getAttribute("src"))`), `${width}: images only when available`);
    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), `${width}: no horizontal overflow on Recipes`);

    // Detail: title, time, servings and Start cooking come before Ingredients; no placeholder image.
    await go(`/recipe/${encodeURIComponent(without.id)}`, `Boolean(${q("button-start-cooking")})`);
    const top = id => ev(`${q(id)}.getBoundingClientRect().top`);
    const ys = [await top("text-recipe-title"), await top("button-start-cooking"), await top("text-ingredients-heading"), await top("text-steps-heading")];
    ok(ys.every((y, i) => i === 0 || y > ys[i - 1]), `${width}: header order title → Start cooking → Ingredients → Steps`);
    ok(await ev(`!${q("img-recipe-placeholder")}`), `${width}: no image placeholder`);
    ok((await ev(`${q("nutrition-unavailable")}?.textContent`)) === "Nutrition unavailable", `${width}: missing nutrition says unavailable`);
    ok(await ev(`!/\\b0 kcal/.test(document.body.innerText)`), `${width}: never shows 0 kcal for missing data`);
    if (withNutrition) {
      await go(`/recipe/${encodeURIComponent(withNutrition.id)}`, `Boolean(${q("nutrition-detail-row")})`);
      ok(/kcal/.test(await ev(`${q("nutrition-detail-row")}.innerText`)) && /Estimate/.test(await ev(`${q("nutrition-detail-row-basis")}.innerText`)), `${width}: nutrition row with basis + estimate label`);
    }

    // Groceries: Uncheck all offers an Undo that restores exactly what was checked.
    await go("/grocery-list", `document.querySelectorAll('.grocery-page input[type="checkbox"]').length > 3`);
    await ev(`Array.from(document.querySelectorAll('.grocery-page input[type="checkbox"]')).slice(0, 3).forEach(b => b.click())`);
    const checked = `JSON.stringify(Array.from(document.querySelectorAll('.grocery-page input[type="checkbox"]')).map(b => b.checked))`;
    await until(`document.querySelectorAll('.grocery-page input[type="checkbox"]:checked').length === 3`, "three checked");
    const before = await ev(checked);
    await ev(`${q("button-uncheck-all")}.click()`);
    await until(`document.querySelectorAll('.grocery-page input[type="checkbox"]:checked').length === 0 && Boolean(${q("button-undo-uncheck")})`, "undo offered");
    await ev(`${q("button-undo-uncheck")}.click()`);
    await until(`${checked} === ${JSON.stringify(before)}`, "undo restores checks");
    ok(true, `${width}: grocery Undo restores previous checks`);
  }

  assert.deepEqual(errors, []);
  console.log(`PASS UI pass browser: ${checks} checks — cards without internal/filler text, wrapping titles, detail header order, no image placeholder, honest nutrition, grocery Undo, 375px + desktop`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
