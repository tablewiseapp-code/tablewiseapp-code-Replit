// Your household → suggested week → review → Groceries, and Home "Suggest a recipe", at phone width in a real browser.
// Throwaway Chrome profile = a new guest. Usage: node script/test-household-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-household-"));
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
  await call("Page.enable"); await call("Runtime.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1')" }); // past the sign-in screen, as a guest
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const click = id => ev(`${q(id)}.click()`);
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const noScroll = () => ev("document.documentElement.scrollWidth <= innerWidth");
  const plan = () => ev("JSON.parse(localStorage.getItem('weeklyMealsState'))");
  const dinners = async () => (await plan()).planAssignments.filter(a => a.mealType === "Dinner").sort((a, b) => a.startDay - b.startDay);
  const recipe = id => ev(`fetch("/api/recipes/${id}").then(r => r.json())`);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // ---- First visit lands on Your household. Quick & easy keeps More preferences collapsed.
  await go("/", `location.pathname === "/household" && Boolean(${q("button-suggest-week")})`);
  ok(true, "first visit opens Your household");
  ok(await noScroll(), "Your household fits a phone");
  ok(await ev(`[...document.querySelectorAll("button")].every(b => b.offsetParent === null || b.getBoundingClientRect().height >= 44)`), "44px targets");
  await click("style-quick");
  ok(await ev(`document.getElementById("q-weeknight-body").inert && document.getElementById("q-filters-body").inert`), "Quick & easy: optional groups collapsed");
  for (let i = 0; i < 3; i++) await click("servings-increase"); // prefilled 2 → 5
  eq(await ev(`${q("servings-value")}.textContent`), "5 servings", "five servings");
  await click("evenings-3");
  // Choosing in a group collapses every group above it; each header shows its answer in small text.
  eq(await ev(`["style", "servings", "restrictions", "equipment"].map(k => document.getElementById("q-" + k + "-body").inert)`), [true, true, true, true], "groups above collapse");
  ok(await ev(`!document.getElementById("q-evenings-body").inert`), "the current group stays open");
  eq(await ev(`${q("q-style-summary")}.textContent`), "Quick & easy", "style shown beside its title");
  eq(await ev(`${q("q-servings-summary")}.textContent`), "5 servings", "servings shown beside its title");
  eq(await ev(`${q("q-evenings-summary")}.textContent`), "3", "evenings shown beside its title");
  await click("q-style-toggle");
  ok(await ev(`!document.getElementById("q-style-body").inert`), "a collapsed group opens again");
  await click("fixed-5");
  ok((await ev(`${q("household-summary")}.textContent`)).startsWith("Quick & easy · 5 servings · None"), "summary shows the constraints");
  // Too many fixed days: an inline offer, selections kept.
  for (const d of [1, 2, 3]) await click(`fixed-${d}`);
  await until(`Boolean(${q("over-count")})`, "over-count offer");
  for (const d of [1, 2, 3]) await click(`fixed-${d}`);
  ok(await ev(`!${q("over-count")}`), "offer disappears");
  eq(await ev(`[...document.querySelectorAll('[data-testid^="allergy-"]')].map(b => b.dataset.testid.slice(8))`),
    ["milk", "eggs", "peanuts", "treeNuts", "soy", "gluten", "fish", "shellfish", "sesame", "mustard"], "all ten allergies offered");
  // "None" answers the restrictions question, so that group folds away and shows "None" beside its title.
  await click("q-restrictions-toggle"); await click("restriction-none");
  ok(await ev(`document.querySelector('[data-testid="q-restrictions-toggle"]').getAttribute("aria-expanded") === "false"`), "None collapses the restrictions group");
  eq(await ev(`${q("q-restrictions-summary")}.textContent`), "None", "None shown beside the title");
  // Switching style keeps entered values.
  await click("style-chef"); await click("style-quick");
  eq(await ev(`${q("servings-value")}.textContent`), "5 servings", "values survive a style switch");

  // ---- Kitchen equipment is required and sits right under the restrictions question; nothing is pre-selected.
  eq(await ev(`[...document.querySelectorAll("section[data-testid^='q-']")].map(f => f.dataset.testid).slice(0, 5)`),
    ["q-style", "q-servings", "q-restrictions", "q-equipment", "q-evenings"], "equipment under allergies");
  ok(await ev(`![...document.querySelectorAll('[data-testid^="device-"]')].some(b => b.getAttribute("aria-pressed") === "true")`), "no device assumed");
  await click("button-suggest-week");
  await until(`Boolean(${q("equipment-required")})`, "equipment required");
  ok(await ev(`location.pathname === "/household"`), "not suggested without equipment");
  await click("device-Stovetop"); await click("device-Oven");
  ok(await ev(`!${q("equipment-required")}`), "message clears once chosen");

  // ---- The Week → Plan filters, shared with the Week page: chosen here, shown there in the same state.
  await click("q-filters-toggle");
  const inPanel = (root, id) => `document.querySelector('${root} [data-testid="${id}"]')`;
  await ev(`${inPanel('[data-testid="household-filters"]', "filter-kid-favourites")}.click()`);
  await until(`${inPanel('[data-testid="household-filters"]', "filter-kid-favourites")}.getAttribute("aria-checked") === "true"`, "kid favourites on");
  ok((await ev(`${q("q-filters-summary")}.textContent`)).includes("Kid favourites"), "filters summary");

  // ---- Suggest my week → the populated board: Friday plus two more, 5 servings each.
  await click("button-suggest-week");
  await until(`location.pathname === "/meals" && Boolean(${q("dinner-review")})`, "Week review");
  let week = await dinners();
  eq(week.length, 3, "three dinners");
  ok(week.some(a => a.startDay === 5), "Friday scheduled");
  ok(week.every(a => a.servings === 5), "five servings each");
  ok((await ev(`${q("dinner-5")}.textContent`)).includes("5 servings"), "row shows servings");
  ok(await noScroll(), "Week review fits a phone");

  ok(await Promise.all(week.map(a => recipe(a.recipeId))).then(rs => rs.every(r => r.tags.includes("Kid friendly"))), "suggestions respect the shared filters");

  // ---- Swap only Friday.
  const before = week;
  await click("swap-5");
  await until(`${q("dinner-5")}.dataset.recipeId !== ${JSON.stringify(before.find(a => a.startDay === 5).recipeId)}`, "Friday swapped");
  week = await dinners();
  eq(week.filter(a => a.startDay !== 5), before.filter(a => a.startDay !== 5), "other evenings unchanged");

  // ---- Refresh keeps the draft.
  await go("/meals?plan", `Boolean(${q("dinner-review")})`);
  eq(await dinners(), week, "draft survives a refresh");

  // ---- Approve → Groceries from scheduled dinners only; approving again changes nothing.
  await click("button-approve-week");
  await until(`Boolean(${q("button-edit-week")})`, "approved");
  const scheduled = new Set((await Promise.all(week.map(a => recipe(a.recipeId)))).map(r => r.title));
  const groceryTitles = async () => {
    await go("/grocery-list", `document.querySelectorAll('[data-testid="grocery-item-recipes"]').length > 0`);
    return ev(`[...document.querySelectorAll('[data-testid="grocery-item-recipes"]')].map(e => e.textContent)`);
  };
  const first = await groceryTitles();
  ok(first.every(text => [...scheduled].some(t => text.includes(t))), "every grocery row comes from a scheduled dinner");
  await go("/meals?plan", `Boolean(${q("button-edit-week")})`);
  await click("button-edit-week"); await until(`Boolean(${q("button-approve-week")})`, "editable");
  await click("button-approve-week"); await until(`Boolean(${q("button-edit-week")})`, "approved again");
  eq(await groceryTitles(), first, "approving twice does not duplicate groceries");

  // ---- Same filter state on the Week page, and back: a filter set there shows on Your household.
  await go("/meals", `Boolean(${inPanel("#meal-filters", "filter-kid-favourites")})`);
  eq(await ev(`${inPanel("#meal-filters", "filter-kid-favourites")}.getAttribute("aria-checked")`), "true", "Week page shows the household filter");
  await ev(`${inPanel("#meal-filters", "filter-time-any")}.click()`);
  await go("/household", `Boolean(${q("q-filters-summary")})`);
  ok((await ev(`${q("q-filters-summary")}.textContent`)).startsWith("Any"), "Your household shows the Week page filter");

  // ---- An approved week survives Your household and preference edits.
  await click("diet-glutenFree"); await click("button-suggest-week");
  await until(`location.pathname === "/meals"`, "back on the Week");
  eq(await dinners(), week, "approved week kept");

  // ---- Home: Suggest a recipe uses the same rule (gluten-free now set), changes nothing, Start cooking opens Zen mode.
  const planBefore = JSON.stringify(await plan());
  await go("/", `Boolean(${q("home-suggest-recipe")}) && !${q("home-suggest-recipe")}.disabled`);
  ok(await noScroll(), "Home fits a phone");
  await click("home-suggest-recipe");
  await until(`Boolean(${q("meal-suggestion-recipe")})`, "a suggestion");
  const id = await ev(`${q("meal-suggestion-recipe")}.dataset.recipeId`);
  ok((await recipe(id)).tags.includes("Gluten-free"), "Home suggestion is explicitly gluten-free");
  await click("meal-suggestion-another");
  await until(`${q("meal-suggestion-recipe")}.dataset.recipeId !== ${JSON.stringify(id)}`, "another suggestion");
  ok((await recipe(await ev(`${q("meal-suggestion-recipe")}.dataset.recipeId`))).tags.includes("Gluten-free"), "the next one too");
  await click("meal-suggestion-cook");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("cooking-mode")})`, "Zen mode");
  eq(JSON.stringify(await plan()), planBefore, "Home suggestion leaves the Week unchanged");

  // ---- Hebrew, right to left.
  await ev("localStorage.setItem('tablewise_language','he')");
  await go("/household", `Boolean(${q("button-suggest-week")})`);
  eq(await ev("document.documentElement.dir"), "rtl", "rtl");
  eq(await ev(`${q("text-page-title")}.textContent`), "משק הבית שלכם", "Hebrew title");
  ok(await noScroll(), "Hebrew fits a phone");
  eq(errors, [], "no page errors");
  console.log(`PASS household browser: ${checks} checks`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
