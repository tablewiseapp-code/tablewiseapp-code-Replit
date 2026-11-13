// Weekly Meals × My Basic Settings in a real browser (throwaway Chrome profile; reads recipes only).
// Usage: BASE_URL=http://localhost:5001 node script/test-weekly-preferences-browser.mjs   (Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error("Only run against a local app.");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-weekly-prefs-"));
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

  // 1. No settings: bar says so, nothing hidden.
  await go("/meals"); await ev("localStorage.clear()"); await resetPage(); await openMeals();
  await until(q("preferences-none"), "no-preferences text");
  ok((await cards()).length === total, `all ${total} recipes without settings`);
  const num = id => ev(`Number(${q(id)}?.dataset.count ?? -1)`);
  ok(await num("count-matching") === total && await num("count-settings") === 0 && await num("count-filters") === -1, "counts without settings");
  ok((await ev(`document.body.innerText`)).includes("Filters (0)"), "Filters label");

  // 2. Saved settings apply automatically; chips reflect them.
  await setSettings(settings()); await openMeals();
  const baseline = await cards();
  ok(baseline.length > 0 && baseline.length < total, `restrictions applied automatically (${baseline.length}/${total})`);
  ok(!(await titles()).includes("Macaroni cheese"), "gluten + milk recipe excluded");
  ok(await num("count-matching") === baseline.length, `matching count equals rendered cards (${baseline.length})`);
  ok(await num("count-settings") === total - baseline.length, "excluded count equals the recipes not rendered");
  await ev(`${q("button-why-excluded")}.click()`); await until(q("match-breakdown"), "breakdown");
  const parts = await ev(`[...document.querySelectorAll('[data-testid^="breakdown-"]')].map(e => [e.dataset.testid, Number(e.dataset.count)])`);
  ok(parts.some(([k]) => k === "breakdown-dietary") && parts.some(([k]) => k === "breakdown-allergies") && parts.some(([k]) => k === "breakdown-devices"), `breakdown reasons: ${JSON.stringify(parts)}`);
  ok(parts.every(([, n]) => n > 0 && n <= total - baseline.length), "each reason ≤ total excluded (a recipe is counted once overall)");
  const hardChips = await ev(`[...${q("preferences-hard")}.querySelectorAll('[data-testid^="preference-chip-"]')].map(c => c.textContent)`);
  ok(JSON.stringify(hardChips) === JSON.stringify(["Gluten-free", "Allergy: milk (Leo)", "Devices: Stovetop · Microwave"]), `hard chips: ${hardChips}`);
  ok(await ev(`!${q("preference-chip-dislikes")}`), "collapsed list shows the first chips only");
  await ev(`${q("button-preferences-toggle")}.click()`);
  await until(q("preference-chip-dislikes"), "Show all reveals remaining chips");
  ok((await ev(`${q("preference-chip-dislikes")}.textContent`)) === "Dislikes: mushrooms", "dislike chip value");
  ok((await ev(`${q("button-preferences-toggle")}.textContent`)) === "Show less", "Show less label");

  // 3. Soft time preference reorders only; a hard maximum excludes.
  await setSettings(settings({ cooking: { weekdayMax: 15 } })); await openMeals();
  ok((await cards()).length === baseline.length, "soft time limit hides nothing");
  await setSettings(settings({ cooking: { weekdayMax: 15, weekendMax: 15, hardMax: true } })); await openMeals();
  ok((await cards()).length < baseline.length, "hard time limit excludes");
  await setSettings(settings()); await openMeals();

  // 4. Search respects saved restrictions.
  await ev(`(() => { const i = ${q("recipe-search-input")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "macaroni"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(600);
  ok(!(await titles()).includes("Macaroni cheese"), "search never shows an excluded recipe");
  await ev(`(() => { const i = ${q("recipe-search-input")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "beef"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(600);
  const beef = await cards();
  ok(beef.length > 0 && beef.every(id => baseline.includes(id)), "search results are a subset of the eligible baseline");
  await ev(`${q("recipe-search-clear")}?.click()`); await sleep(300);

  // 5. Manual filters combine with the baseline; Clear filters keeps saved settings.
  // Sidebar order: meal type, time, protein, ingredients, dietary, method, source; cuisine only under More filters.
  const order = await ev(`[...document.querySelectorAll("#meal-filters [data-filter-section]")].map(e => e.dataset.filterSection)`);
  ok(JSON.stringify(order) === JSON.stringify(["mealType", "time", "protein", "ingredients", "dietary", "method", "source"]), `sidebar order ${order}`);
  await ev(`${q("button-more-filters")}.click()`); await until(`document.querySelector('[data-filter-section="cuisine"]')`, "cuisine under More filters");
  ok(JSON.stringify(await ev(`[...document.querySelectorAll("#meal-filters [data-filter-section]")].map(e => e.dataset.filterSection)`)).endsWith('"source","cuisine"]'), "cuisine listed after the main sections");
  // Advanced groups start collapsed; open protein to check it is listed once.
  await ev(`document.querySelector('#meal-filters [data-filter-section="protein"] button').click()`); await sleep(150);
  ok(await ev(`document.querySelectorAll('#meal-filters [data-testid^="filter-protein-"]').length`) === 4, "protein shown once (not duplicated in More)");
  await ev(`document.querySelector('#meal-filters [data-filter-section="protein"] button').click()`); await sleep(150);
  const open = async section => { if (!(await ev(`!!document.querySelector('[data-filter-section="${section}"] [data-testid^="filter-"]')`))) await ev(`document.querySelector('[data-filter-section="${section}"] button').click()`); await sleep(150); };
  const sidebar = () => num("sidebar-matching");
  ok(await sidebar() === baseline.length && await num("count-matching") === baseline.length, "sidebar count = top count = cards");
  // Same filters, opposite order → same cards (visual order never changes results).
  await open("mealType"); await open("protein");
  await ev(`${q("filter-meal-dinner")}.click()`); await sleep(250); await ev(`${q("filter-protein-chicken")}.click()`); await sleep(400);
  const dinnerThenChicken = (await cards()).sort();
  ok(await sidebar() === dinnerThenChicken.length, "sidebar count updates immediately");
  const chipLabels = await ev(`[...document.querySelectorAll('[data-testid="active-filter-chip"]')].map(b => b.textContent)`);
  ok(chipLabels.length === 2, `two active filter chips: ${chipLabels}`);
  await ev(`${q("button-clear-filters")}.click()`); await sleep(300);
  await ev(`${q("filter-protein-chicken")}.click()`); await sleep(250); await ev(`${q("filter-meal-dinner")}.click()`); await sleep(400);
  ok(JSON.stringify((await cards()).sort()) === JSON.stringify(dinnerThenChicken), "filter order does not change results");
  // Removing one chip removes only that filter.
  await ev(`[...document.querySelectorAll('[data-testid="active-filter-chip"]')].find(b => /dinner/i.test(b.textContent)).click()`); await sleep(400);
  ok((await ev(`[...document.querySelectorAll('[data-testid="active-filter-chip"]')].map(b => b.textContent)`)).length === 1, "chip × removes only its filter");
  ok(await num("count-matching") === await sidebar(), "both counts agree after removal");
  const chicken = await cards();
  ok(chicken.length > 0 && chicken.length < baseline.length && chicken.every(id => baseline.includes(id)), "manual filter narrows within the baseline");
  ok(await num("count-matching") === chicken.length && await num("count-filters") === baseline.length - chicken.length, "counts follow the manual filter");
  ok(await num("count-settings") === total - baseline.length, "manual filters never change the settings count");
  ok((await ev(`${q("button-clear-filters")}.textContent`)).trim() === "Clear all", "Clear all label");
  const savedBefore = await ev(`localStorage.getItem("tablewise_basic_settings")`);
  await ev(`${q("button-clear-filters")}.click()`); await sleep(400);
  ok(JSON.stringify(await cards()) === JSON.stringify(baseline), "Clear filters returns to the saved baseline");
  ok(await num("count-matching") === baseline.length && await num("count-filters") === -1, "counts back to baseline after Clear filters");
  ok((await ev(`localStorage.getItem("tablewise_basic_settings")`)) === savedBefore, "Clear filters leaves My Basic Settings untouched");

  // 6. Editing settings updates Weekly Meals (Edit preferences → /settings → back).
  await ev(`${q("button-edit-preferences")}.click()`);
  await until(`location.pathname === "/settings" && ${q("section-dietary-toggle")}`, "settings page");
  await ev(`${q("section-dietary-toggle")}.click()`); await until(q("diet-vegetarian"), "dietary open");
  await ev(`${q("diet-vegetarian")}.click()`);
  await until(`${q("settings-status")}.dataset.status === "saved"`, "saved");
  await ev(`${q("app-nav-link-meals")}.click()`);
  await until(`${q("preference-chip-diet-vegetarian")} && document.querySelectorAll('[data-testid^="recipe-card-"]').length > 0`, "vegetarian chip on return");
  const vegetarian = await cards();
  ok(vegetarian.length < baseline.length && vegetarian.every(id => baseline.includes(id)), "returning applies the new restriction");

  // 7. Fill my week: eligibility + planning defaults; an existing plan entry is kept; incompatible pick warned.
  await setSettings(settings({ planning: { meals: ["Dinner"], cookingDays: 3, leftovers: "often", repeatFavorites: false, variety: "balanced", novelty: "balanced" } }));
  const all = await fetch(`${BASE}/api/recipes`).then(r => r.json());
  const dinners = baseline.filter(id => all.find(r => r.id === id)?.tags?.[0] === "Dinner");
  const keep = baseline[0];
  const blocked = all.find(r => r.title === "Macaroni cheese")?.id;
  await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify({ filters: { maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], source: [], proteinType: [], withNotes: false, modifiedByMe: false, myPicks: false, minRating: null, servings: null, mustInclude: [], mustExclude: [] },
    selectedIds: ${JSON.stringify([...new Set([keep, ...dinners.slice(0, 5), blocked].filter(Boolean))])}, expandedSections: [], showMoreFilters: false,
    planAssignments: [{ recipeId: ${JSON.stringify(keep)}, mealType: "Lunch", startDay: 3, spanDays: 1 }] }))`);
  await openMeals();
  if (blocked) ok(await ev(`!!${q(`incompatible-${blocked}`)}`), "incompatible selected meal is warned, not removed");
  await ev(`${q("button-generate-plan")}.click()`); await until(q("button-fill-week"), "plan view");
  await ev(`${q("button-fill-week")}.click()`); await sleep(600);
  const plan = await ev(`JSON.parse(localStorage.getItem("weeklyMealsState")).planAssignments`);
  ok(plan.some(a => a.recipeId === keep && a.mealType === "Lunch" && a.startDay === 3), "existing plan entry kept");
  const filled = plan.filter(a => !(a.recipeId === keep && a.mealType === "Lunch"));
  ok(filled.length > 0 && filled.every(a => a.mealType === "Dinner" && a.servings === 2 * a.spanDays && a.recipeId !== blocked), "Fill my week: dinners only, household servings, never the incompatible pick");
  await resetPage();

  // Recipes open at the household's servings (Dana + Leo = 2), scaling the ingredients.
  await go(`/recipe/${encodeURIComponent(keep)}`);
  await until(`[...document.querySelectorAll('[data-testid="text-servings"]')].some(e => e.textContent.trim().startsWith("2 ")) && ${q("servings-note")}?.textContent.includes("scaled from")`, "recipe opens at 2 servings, scaled");
  ok(true, "recipe page uses household servings");

  // 8. My Recipes stays unfiltered.
  await go("/recipes"); await until(`document.querySelectorAll('[data-testid^="card-recipe-"]').length === ${total}`, "My Recipes lists everything");
  ok(true, "My Recipes unfiltered");

  // 9. Nothing matches: named reasons + edit action.
  await setSettings(settings({ kitchen: { devices: [] }, dietary: { diets: ["vegan"], allergies: ["milk", "eggs", "peanuts", "treeNuts", "soy", "gluten", "fish", "shellfish", "sesame", "mustard"], customAllergies: [], dislikes: [], favorites: [], preferredCuisines: [], avoidCuisines: [] }, cooking: { weekdayMax: 5, weekendMax: 5, hardMax: true } }));
  await go("/meals"); await until(q("no-match-settings"), "no-match state");
  ok((await ev(`${q("no-match-settings")}.textContent`)).includes("No recipes match your current settings."), "no-match title");
  ok((await ev(`${q("no-match-settings")}.querySelectorAll("li").length`)) > 0, "limiting restrictions listed");
  ok(await ev(`!!${q("button-no-match-edit")}`) && (await cards()).length === 0, "edit action, and no incompatible suggestions");

  // 10. Languages, RTL, mobile.
  await setSettings(settings());
  for (const [lang, title, dir] of [["ru", "Подходящие рецепты", "ltr"], ["he", "המתכונים שמתאימים לך", "rtl"]]) {
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await ev(`localStorage.setItem("tablewise_language", "${lang}")`); await openMeals();
    ok((await ev(`document.getElementById("active-preferences-title").textContent`)) === title, `${lang} title`);
    ok((await ev(`${q("active-preferences")}.textContent`)).match(lang === "ru" ? /Аллергия: молоко \(Leo\)/ : /אלרגיה: חלב \(Leo\)/), `${lang} chips`);
    ok((await ev(`getComputedStyle(${q("active-preferences")}).direction`)) === dir, `${lang} direction ${dir}`);
    ok(await ev("document.documentElement.scrollWidth <= window.innerWidth + 1"), `${lang} mobile: no horizontal overflow`);
  }
  for (const lang of ["en", "ru", "he"]) {
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`localStorage.setItem("tablewise_language", "${lang}")`); await openMeals();
    await ev(`${q("button-more-filters")}?.click()`); await sleep(200);
    for (const section of ["mealType", "time", "protein", "ingredients", "dietary", "method", "source"]) await open(section);
    const raw = (await ev("document.body.innerText")).match(/\b(nav|meals|recipes|settings|planner|grocery)\.[a-zA-Z]+\b/g);
    ok(!raw, `${lang}: untranslated keys ${raw}`);
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await openMeals(); await ev(`${q("app-nav-menu-trigger")}?.click()`); await sleep(400);
    const rawMobile = (await ev("document.body.innerText")).match(/\b(nav|meals)\.[a-zA-Z]+\b/g);
    ok(!rawMobile, `${lang} mobile menu: untranslated keys ${rawMobile}`);
  }
  await resetPage();
  ok(exceptions.length === 0, `uncaught page errors: ${exceptions.join(" | ")}`);
  console.log(`PASS Weekly Meals preferences browser: ${checks} checks — auto-applied restrictions, chips/Show all, soft vs hard time, search, manual filters + Clear filters, edit → return, Fill my week, My Recipes, no-match state, ru/he + RTL mobile`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
