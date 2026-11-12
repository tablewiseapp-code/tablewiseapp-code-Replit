// Weekly Meals pagination, compact Selected list and sticky Continue in a real browser (reads recipes only).
// Usage: BASE_URL=http://localhost:5001 node script/test-weekly-pagination-browser.mjs   (Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error("Only run against a local app.");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-weekly-pages-"));
const port = 9400 + Math.floor(Math.random() * 40);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const member = (id, name, kind, extra = {}) => ({ id, name, kind, diets: [], allergies: [], customAllergies: [], dislikes: [], favorites: [], portion: null, ...extra });
const settings = (patch = {}) => {
  const base = { version: 2, rev: 1,
    household: { members: [member("dana0001", "Dana", "adult"), member("leo00002", "Leo", "child", { allergies: ["milk"] })], portion: "regular", servingsMode: "auto", fixedServings: 4 },
    dietary: { diets: ["glutenFree"], allergies: [], customAllergies: [], dislikes: ["mushrooms"], favorites: [], preferredCuisines: ["Italian"], avoidCuisines: [] },
    kitchen: { devices: ["Stovetop", "Microwave"] },
    cooking: { weekdayMax: null, weekendMax: null, hardMax: false, weekday: { quick: false, minimalCleanup: false, onePot: false, batch: false }, weekend: { quick: false, minimalCleanup: false, onePot: false, batch: false } },
    planning: { meals: ["Breakfast", "Lunch", "Dinner"], cookingDays: 7, leftovers: "none", repeatFavorites: false, variety: "balanced", novelty: "balanced" },
    shopping: { budgetFriendly: false, reuseIngredients: false, pantry: [] } };
  return JSON.stringify({ ...base, ...patch, cooking: { ...base.cooking, ...patch.cooking } });
};
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const exceptions = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r?.result?.value; };
  const until = async (e, what) => { for (let i = 0; i < 150; i++) { if (await ev(`Boolean(${e})`).catch(() => false)) return; await sleep(120); } throw new Error(`timeout: ${what}; page: ${String(await ev("document.body.innerText")).slice(0, 300).replace(/\n/g, " | ")}`); };
  const go = async path => { await call("Page.navigate", { url: BASE + path }); await sleep(400); };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const pageCards = () => ev(`[...document.querySelectorAll('[data-testid^="recipe-card-"]')].map(c => c.dataset.testid.slice(12))`);
  // Results are paginated (12 per page): walk every page so set comparisons see the full list.
  const cards = async () => {
    if (await ev(`!!${q("page-1")}`)) { await ev(`${q("page-1")}.click()`); await sleep(150); }
    const all = [...await pageCards()];
    while (await ev(`!!${q("page-next")} && !${q("page-next")}.disabled`)) { await ev(`${q("page-next")}.click()`); await sleep(150); all.push(...await pageCards()); }
    return all;
  };
  const titles = () => ev(`[...document.querySelectorAll('[data-testid^="recipe-card-"]')].map(c => c.querySelector("h3,h4,p,span")?.textContent ?? c.textContent).join(" | ")`);
  const openMeals = async () => { await go("/meals"); await until(`${q("active-preferences")} && document.querySelectorAll('[data-testid^="recipe-card-"]').length > 0`, "meals loaded"); };
  const setSettings = value => ev(`localStorage.setItem("tablewise_basic_settings", ${JSON.stringify(value)})`);
  const resetPage = () => ev(`localStorage.removeItem("weeklyMealsState"); localStorage.setItem("tablewise_language", "en")`);
  await call("Runtime.enable"); await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const total = (await fetch(`${BASE}/api/recipes`).then(r => r.json())).length;
  ok(total > 24, `needs more than two pages of recipes (have ${total})`);
  const text = id => ev(`${q(id)}?.textContent ?? ""`);
  const click = async id => { await ev(`${q(id)}.click()`); await sleep(200); };
  const pages = Math.ceil(total / 12);

  // 0 selected: Continue disabled with the reason; page 1 shows 12; range + total.
  await go("/meals"); await ev("localStorage.clear()"); await resetPage(); await openMeals();
  ok(await ev(`${q("button-generate-plan")}.disabled`), "Continue disabled with nothing selected");
  ok((await text("selected-count")).includes("Select at least 1"), `disabled Continue explains why: ${await text("selected-count")}`);
  ok((await pageCards()).length === 12, "12 recipes on page 1");
  ok(await text("results-range") === `Showing 1–12 of ${total} recipes`, `range on page 1: ${await text("results-range")}`);
  ok(await ev(`${q("page-prev")}.disabled`) && !(await ev(`${q("page-next")}.disabled`)), "Previous disabled on page 1");

  // Every recipe exactly once across pages; Next disabled on the last page.
  const all = await cards();
  ok(all.length === total && new Set(all).size === total, "no duplicates or gaps across pages");
  ok(await ev(`${q("page-next")}.disabled`) && await ev(`${q(`page-${pages}`)}.getAttribute("aria-current")`) === "page", "Next disabled on last page");

  // Page 2: select one there, it stays selected on page 1; count is global.
  await click("page-1"); await click("page-next");
  ok((await text("results-range")).startsWith("Showing 13–24"), "page 2 range");
  ok(await ev(`Math.abs(document.getElementById("meal-results").getBoundingClientRect().top) < 200`), "page change scrolls to results");
  const picked = (await pageCards())[0];
  await click(`button-add-${picked}`);
  await click("page-1");
  ok(await ev(`!!${q(`selected-recipe-${picked}`)}`) && await text("selected-counter") === "1 / 12", "selection survives page change");
  ok((await text("selected-count")) === "1 selected" && !(await ev(`${q("button-generate-plan")}.disabled`)), "header count + Continue enabled");
  ok(!(await cards()).includes(picked) && (await ev(`Number(${q("results-range")}.dataset.total)`)) === total - 1, "selected recipe leaves results; totals follow");

  // Compact row: link to the recipe, total time, no price or tools.
  ok(await ev(`${q(`selected-recipe-link-${picked}`)}.getAttribute("href")`) === `/recipe/${picked}`, "recipe name opens full recipe");
  ok(await ev(`!${q("panel-selected-recipes")}.querySelector('[data-testid^="recipe-price"], [data-testid^="meal-facts"]')`), "no price/facts in Selected");

  // Many selected: list collapses behind Show all.
  await click("page-1");
  for (const id of (await pageCards()).slice(0, 6)) await click(`button-add-${id}`);
  ok(await text("selected-counter") === "7 / 12" && await ev(`${q("panel-selected-recipes")}.querySelectorAll("li").length`) === 5, "7 selected, 5 shown");
  await click("button-toggle-selected");
  ok(await ev(`${q("panel-selected-recipes")}.querySelectorAll("li").length`) === 7, "Show all expands");

  // Remove updates the panel, counter, header and results.
  await click(`remove-selected-${picked}`);
  ok(!(await ev(`!!${q(`selected-recipe-${picked}`)}`)) && await text("selected-counter") === "6 / 12" && await text("selected-count") === "6 selected", "remove updates all counts");

  // Sticky header stays at the top while scrolling.
  await ev("window.scrollTo(0, document.body.scrollHeight)"); await sleep(200);
  ok(await ev(`Math.abs(${q("weekly-meals-header")}.getBoundingClientRect().top) < 2`), "header sticks on desktop");

  // Filter/search change resets to page 1; a shrinking list never strands you on an empty page.
  await click("page-next"); await click("page-next");
  await ev(`(() => { const i = ${q("recipe-search-input")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "chicken"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(500);
  ok((await text("results-range")).startsWith("Showing 1–"), `search resets to page 1: ${await text("results-range")}`);

  // Continue runs the existing plan step (no new route).
  await click("button-generate-plan");
  ok(await ev(`location.pathname`) === "/meals" && await ev(`!!${q("button-back-to-selection")}`), "Continue opens the existing plan step");

  // Mobile + Russian: sticky compact header, translated copy, no raw keys.
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await resetPage(); await ev(`localStorage.setItem("tablewise_language", "ru")`); await openMeals();
  ok((await text("results-range")).startsWith("Рецепты 1–12 из"), "ru range");
  ok((await text("button-generate-plan")).includes("Составить план") && (await text("page-next")).includes("Далее"), "ru buttons");
  await ev("window.scrollTo(0, 2000)"); await sleep(200);
  const box = await ev(`(() => { const r = ${q("weekly-meals-header")}.getBoundingClientRect(); return [r.top, r.height, document.documentElement.scrollWidth]; })()`);
  ok(Math.abs(box[0]) < 2 && box[1] < 100 && box[2] <= 390, `mobile header sticky, compact, no sideways scroll: ${box}`);
  ok(!(await ev("document.body.innerText")).match(/\bmeals\.[a-zA-Z]+\b/), "no untranslated keys");

  await resetPage();
  ok(exceptions.length === 0, `uncaught page errors: ${exceptions.join(" | ")}`);
  console.log(`PASS Weekly Meals pagination browser: ${checks} checks`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
