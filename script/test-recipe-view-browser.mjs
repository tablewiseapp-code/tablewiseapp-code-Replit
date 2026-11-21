// Settings → Recipe View in a real browser (throwaway Chrome profile = new owner; changes only its own settings and Week).
// Usage: node script/test-recipe-view-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-recipe-view-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
// The Week API names a week by its Monday (local time, as the app does).
const thisWeek = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
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
  // Skip the sign-in screen and Your household.
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.setItem('tablewise_language','en')" });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready ?? `Boolean(${q("app-nav-header")})`, path); };
  const text = id => ev(`${q(id)}?.innerText.replace(/\\s+/g, " ").trim() ?? null`);
  const click = id => ev(`${q(id)}.click()`);
  const saved = () => until(`${q("settings-status")}?.dataset.status === "saved"`, "settings saved");
  const serverView = () => ev(`fetch("/api/household-settings").then(r => r.json()).then(s => s?.recipeView ?? null)`);
  const size = (width, height, mobile) => call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await size(1280, 900, false);

  // Settings saved before Recipe View existed, with the Week's old browser switch on: the choice is kept.
  await go("/");
  await ev(`fetch("/api/household-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 2, rev: 1, setup: { status: "skipped" } }) })`);
  await ev(`localStorage.setItem("tablewise:nutrition-details:v1", "true"); localStorage.removeItem("tablewise_basic_settings")`);
  await go("/settings", `Boolean(${q("section-recipe-view")})`);
  await click("section-recipe-view-toggle");
  await until(`Boolean(${q("recipe-view-nutrition")})`, "Recipe View opens");
  eq(await ev(`${q("recipe-view-nutrition")}.getAttribute("aria-checked")`), "true", "legacy Show nutrition kept");
  eq(await text("recipe-view-preview-rows-nutrition"), "Per serving Calories 520 kcal Protein 32 g Fat 14 g Fiber 4 g", "defaults: Calories, Protein, Fat, Fiber");
  eq(await text("section-recipe-view-summary"), "Calories, Protein, Fat, Fiber · Prep time, Cook time, Main cooking tool", "summary");

  // Preview follows every change at once; nutrient choices survive Off → On.
  await click("recipe-view-nutrient-sugars");
  await until(`${q("recipe-view-preview-rows-nutrition")}?.innerText.replace(/\\s+/g, " ").includes("Sugars 3 g")`, "sugars in preview");
  await click("recipe-view-nutrition");
  await until(`!${q("recipe-view-preview-rows-nutrition")} && !${q("recipe-view-nutrient-protein")}`, "nutrition off hides the row and the choices");
  await click("recipe-view-nutrition");
  await until(`Boolean(${q("recipe-view-preview-rows-nutrition")})`, "nutrition back on");
  eq(await text("recipe-view-preview-rows-nutrition"), "Per serving Calories 520 kcal Protein 32 g Fat 14 g Sugars 3 g Fiber 4 g", "choices kept");
  await click("recipe-view-detail-dietarytags");
  await until(`${q("recipe-view-preview-rows-details")}?.innerText.includes("Gluten-free")`, "details in preview");
  eq(await text("recipe-view-preview-rows-details"), "Prep 10 min · Cook 25 min · Gluten-free, Dairy-free · Oven", "details in fixed order, below nutrition");
  eq(await text("recipe-view-preview-meta"), "Total 35 min 4 servings", "time and servings");
  await saved();
  await until(`fetch("/api/household-settings").then(r => r.json()).then(s => s?.recipeView?.details?.length === 4)`, "saved on the server");
  eq(await serverView(), { showNutrition: true, nutrients: ["calories", "protein", "fat", "sugars", "fiber"], details: ["prepTime", "cookTime", "dietaryTags", "mainTool"] }, "server copy");

  // Survives a reload.
  await go("/settings", `Boolean(${q("section-recipe-view")})`);
  await click("section-recipe-view-toggle");
  await until(`Boolean(${q("recipe-view-preview-rows-details")})`, "after reload");
  eq(await text("recipe-view-preview-rows-nutrition"), "Per serving Calories 520 kcal Protein 32 g Fat 14 g Sugars 3 g Fiber 4 g", "reload keeps nutrients");

  // Recipes with and without nutrition.
  const recipes = await ev(`fetch("/api/recipes").then(r => r.json())`);
  const rich = recipes.find(r => r.nutrition && !/mock/i.test(r.nutrition.model) && /^\d+$/.test((r.servings ?? "").trim()));
  const bare = recipes.find(r => !r.nutrition && r.sourceUrl);
  ok(rich && bare, "a recipe with nutrition and an imported one without");
  const per = key => Math.round(rich.nutrition.totals[key] / Number(rich.servings));

  await go("/recipes", `Boolean(${q(`card-recipe-${rich.id}`)})`);
  await until(`Boolean(${q(`recipe-view-${rich.id}-nutrition`)})`, "Recipes card nutrition");
  ok((await text(`recipe-view-${rich.id}-nutrition`)).startsWith("Est. per serving Calories"), "estimate label on the Recipes card");
  ok((await text(`recipe-view-${rich.id}-protein`)).includes(`${per("proteinG")} g`), "protein per serving");
  eq(await ev(`Boolean(${q(`recipe-view-${bare.id}-nutrition`)})`), false, "imported recipe without nutrition: no nutrition row");

  await go(`/recipe/${encodeURIComponent(bare.id)}`, `Boolean(${q("text-recipe-title")})`);
  eq(await ev(`Boolean(${q("recipe-view-detail")})`), false, "full view: no empty nutrition row");
  await go(`/recipe/${encodeURIComponent(rich.id)}`, `Boolean(${q("recipe-view-detail-nutrition")})`);
  ok((await text("recipe-view-detail-nutrition")).includes("Sugars"), "full view follows the selection");

  // Week → Plan: the Nutrition switch is the same preference.
  await go("/meals?browse", `Boolean(${q("nutrition-details-toggle")})`);
  eq(await ev(`${q("nutrition-details-toggle")}.getAttribute("aria-checked")`), "true", "Week switch reads Settings");
  await click("nutrition-details-toggle");
  await until(`${q("nutrition-details-toggle")}.getAttribute("aria-checked") === "false" && !document.querySelector('[data-testid$="-nutrition"][data-testid^="meals-catalog-view-"]')`, "Week switch off hides nutrition");
  await until(`fetch("/api/household-settings").then(r => r.json()).then(s => s?.recipeView?.showNutrition === false)`, "Week switch saved");
  await go("/settings", `Boolean(${q("section-recipe-view")})`);
  await click("section-recipe-view-toggle");
  await until(`Boolean(${q("recipe-view-nutrition")})`, "settings open");
  eq(await ev(`${q("recipe-view-nutrition")}.getAttribute("aria-checked")`), "false", "Settings shows the Week change");
  await click("recipe-view-nutrition");
  await until(`Boolean(${q("recipe-view-nutrient-fat")})`, "nutrients back");
  eq(await ev(`["calories","protein","fat","sugars","fiber"].every(n => document.querySelector('[data-testid="recipe-view-nutrient-' + n + '"]').getAttribute("aria-pressed") === "true")`), true, "nutrients kept through the Week switch");

  // Phone Home with every field on and three meals today: one screen, Start cooking reachable.
  await click("recipe-view-nutrient-sodium");
  await saved();
  const today = await ev(`(d => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`)(new Date())`);
  const three = recipes.filter(r => r.nutrition && !/mock/i.test(r.nutrition.model) && /^\d+$/.test((r.servings ?? "").trim())).slice(0, 3);
  const batches = three.map((r, i) => ({ id: `t${i}`, recipeId: r.id, cookDate: today, serves: [{ date: today }] }));
  const saveWeek = await ev(`fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify({ weekStart: thisWeek, proposed: true, selectedIds: [], batches, approved: null }))} }).then(async r => r.status < 300 || r.status + " " + await r.text())`);
  eq(saveWeek, true, "Week saved");
  await size(390, 844, true);
  await go("/", `Boolean(${q(`home-meal-view-${three[2].id}-nutrition`)})`);
  for (const r of three) ok((await text(`home-meal-view-${r.id}-nutrition`)).includes("Calories"), `Home shows nutrition for ${r.id}`);
  ok((await text(`home-meal-meta-${three[0].id}`)).length > 0, "Home shows time or servings");
  const fit = await ev(`({ wide: document.scrollingElement.scrollWidth })`);
  // Today's meals are full recipe cards on a phone (2026-11-20): Home may scroll down, never sideways.
  ok(fit.wide <= 390, "no sideways scroll");
  await click("home-suggest-recipe");
  await until(`Boolean(${q("meal-suggestion-cook")})`, "suggestion");
  const cook = await ev(`(() => { const b = ${q("meal-suggestion-cook")}.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })()`);
  ok(cook, "Start cooking is on screen");

  eq(errors, [], "no page errors");
  console.log(`PASS recipe view browser: ${checks} checks`);
} finally {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
