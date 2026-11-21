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
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}; at ${await ev("location.href").catch(() => "?")}; page: ${(await ev("document.body.innerText.slice(0, 400)").catch(() => "?"))}`); };
  const click = id => ev(`${q(id)}.click()`);
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const noScroll = () => ev("document.documentElement.scrollWidth <= innerWidth");
  const plan = () => ev("JSON.parse(localStorage.getItem('weeklyMealsState'))");
  const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
  const dishes = async () => (await plan()).batches.slice().sort((a, b) => a.cookDate.localeCompare(b.cookDate));
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
  ok((await ev(`${q("household-summary")}.textContent`)).startsWith("Quick & easy · 5 servings · 3"), "summary shows the constraints");
  // Too many fixed days: an inline offer, selections kept.
  for (const d of [1, 2, 3]) await click(`fixed-${d}`);
  await until(`Boolean(${q("over-count")})`, "over-count offer");
  for (const d of [1, 2, 3]) await click(`fixed-${d}`);
  ok(await ev(`!${q("over-count")}`), "offer disappears");
  eq(await ev(`[...document.querySelectorAll('[data-testid^="allergy-"]')].map(b => b.dataset.testid.slice(8))`),
    ["milk", "eggs", "peanuts", "treeNuts", "soy", "gluten", "fish", "shellfish", "sesame", "mustard"], "all ten allergies offered");
  // "None" answers the restrictions question, so that group folds away and shows "None" beside its title.
  ok(await ev(`${q("restriction-none")}.getAttribute("aria-pressed") === "false"`), "None is not pre-selected");
  await click("button-suggest-week");
  await until(`Boolean(${q("restrictions-required")})`, "restrictions answer required");
  ok(await ev(`location.pathname === "/household"`), "not suggested without an answer");
  await click("restriction-none");
  ok(await ev(`document.querySelector('[data-testid="q-restrictions-toggle"]').getAttribute("aria-expanded") === "false"`), "None collapses the restrictions group");
  eq(await ev(`${q("q-restrictions-summary")}.textContent`), "None", "None shown beside the title");
  // A closed "None" still offers one tap to add an allergy; it reopens the group and the link goes away.
  await click("q-restrictions-reopen");
  ok(await ev(`document.querySelector('[data-testid="q-restrictions-toggle"]').getAttribute("aria-expanded") === "true"`), "add link reopens the group");
  ok(await ev(`!${q("q-restrictions-reopen")}`), "add link hidden while open");
  await click("restriction-none");
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

  // Kid favourites is left out until the catalog has enough Kid friendly recipes (a later cycle); the shared filters are
  // checked below with Total time.
  const inPanel = (root, id) => `document.querySelector('${root} [data-testid="${id}"]')`;

  // ---- Suggest my week → the Week: Friday plus two cooking days spread out (Mon, Wed), one dish each, 5 servings each.
  await click("button-suggest-week");
  await until(`location.pathname === "/meals" && Boolean(${q("week-status")})`, "Week");
  let week = await dishes();
  eq(week.map(b => weekday(b.cookDate)), [1, 3, 5], "Friday is kept; Monday and Wednesday spread the rest");
  ok(week.every(b => b.serves.length === 1 && b.serves[0].date === b.cookDate && b.serves[0].adults === 5 && b.serves[0].kids === 0), "five servings each, eaten the day they are cooked");
  ok(await ev(`[...document.querySelectorAll('[data-testid^="dish-make-"]')].every(e => e.textContent === "5 servings")`), "card shows how much to make");
  ok(await noScroll(), "the Week fits a phone");

  // ---- Swap only Friday's dish.
  const friday = week.find(b => weekday(b.cookDate) === 5);
  await click(`swap-${friday.id}`);
  await until(`Boolean(document.querySelector('[data-testid="pick-list"] button'))`, "picker");
  await ev(`document.querySelector('[data-testid="pick-list"] button').click()`);
  await until(`${q(`dish-${friday.id}`)}.dataset.recipe !== ${JSON.stringify(friday.recipeId)}`, "Friday swapped");
  const after = await dishes();
  eq(after.filter(b => b.id !== friday.id), week.filter(b => b.id !== friday.id), "other dishes unchanged");
  eq(after.find(b => b.id === friday.id).serves, friday.serves, "Friday keeps its dates and portions");
  week = after;

  // ---- Refresh keeps the draft.
  await go("/meals?plan", `Boolean(${q("week-status")})`);
  eq(await dishes(), week, "draft survives a refresh");

  // ---- Approve → Groceries from the approved dishes only; approving the same plan again changes nothing.
  await click("button-approve-week");
  await until(`Boolean(${q("button-view-groceries")})`, "approved");
  const scheduled = new Set((await Promise.all(week.map(b => recipe(b.recipeId)))).map(r => r.title));
  const groceryTitles = async () => {
    await go("/grocery-list", `document.querySelectorAll('[data-testid="grocery-item-recipes"]').length > 0`);
    return ev(`[...document.querySelectorAll('[data-testid="grocery-item-recipes"]')].map(e => e.textContent)`);
  };
  const first = await groceryTitles();
  ok(first.every(text => [...scheduled].some(t => text.includes(t))), "every grocery row comes from an approved dish");
  await go("/meals?plan", `Boolean(${q("button-view-groceries")})`);
  await click(`remove-${week[0].id}`);
  await until(`${q("week-status")}.dataset.state === "changed"`, "changed");
  await click("undo-remove-dish");
  await until(`${q("week-status")}.dataset.state === "approved"`, "approved again");
  eq(await groceryTitles(), first, "the same plan gives the same groceries");

  // ---- Same filter state on the Week page, and back: a filter set there shows on Your household.
  await go("/meals?browse", `Boolean(${inPanel("#meal-filters", "filter-time-any")})`);
  await ev(`${inPanel("#meal-filters", "filter-time-any")}.click()`);
  await go("/household", `Boolean(${q("q-filters-summary")})`);
  ok((await ev(`${q("q-filters-summary")}.textContent`)).startsWith("Any"), "Your household shows the Week page filter");

  // ---- Changed answers leave the Week as it is; the Week asks, and "Update the week" rebuilds it (Groceries wait for Save changes).
  await click("diet-glutenFree"); await click("button-suggest-week");
  await until(`location.pathname === "/meals" && Boolean(${q("prefs-changed")})`, "asked to update");
  eq(await ev(`${q("week-status")}.dataset.state`), "approved", "nothing changed before the answer");
  await click("button-update-week");
  await until(`!${q("prefs-changed")} && ${q("week-status")}?.dataset.state === "changed"`, "rebuilt week, not saved");
  eq((await dishes()).map(b => weekday(b.cookDate)), [1, 3, 5], "one dish on each of the three cooking days");

  // ---- Home: Suggest a recipe uses the same rule (gluten-free now set), changes nothing, Start cooking opens Zen mode.
  const planBefore = await plan();
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
  eq(await plan(), planBefore, "Home suggestion leaves the Week unchanged");

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
