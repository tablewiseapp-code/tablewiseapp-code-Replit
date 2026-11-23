// Home screen in a real browser (throwaway Chrome profile = new owner; adds and removes its own Home tasks).
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
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.getItem('tablewise_basic_settings') || localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped', noRestrictions: true, scheduled: true }, household: { servingsMode: 'fixed', fixedServings: 4 }, kitchen: { devices: ['Oven', 'Air fryer', 'Stovetop', 'Microwave'] } }))" }); // skip the first-visit sign-in screen; an answered household (2026-11-21)
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 60; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}; page: ${(await ev("document.body.innerText.slice(0, 300)").catch(() => "?"))}; errors: ${errors.join(" | ")}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready ?? `Boolean(${q("app-nav-header")})`, path); };
  const size = (width, mobile) => call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile });
  const hrefs = sel => ev(`Array.from(document.querySelectorAll('${sel}')).map(a => a.getAttribute("href"))`);
  const labels = sel => ev(`Array.from(document.querySelectorAll('${sel}')).map(a => a.textContent.trim())`);
  const current = sel => ev(`document.querySelector('${sel} [aria-current="page"]')?.getAttribute("href") ?? null`);
  await call("Runtime.enable");
  const text = sel => ev(`${q(sel)}?.innerText ?? null`);

  // ---- First visit: nothing today, so three example dishes (beef, chicken, plant-based) with "+ Add" below (2026-11-22).
  await size(1280, false);
  await go("/");
  await ev("localStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await go("/", `Boolean(${q("home-examples")})`);
  eq(await text("text-page-title"), "Home", "title");
  eq(await text("text-home-date"), await ev(`new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })`), "local date");
  const exampleCount = `document.querySelectorAll('[data-testid^="home-example-"]').length`;
  eq(await ev(exampleCount), 3, "three examples");
  ok(await ev(`[...document.querySelectorAll('[data-testid^="home-example-"]')].every(c => c.querySelector("img") && /Example/.test(c.innerText))`), "each with a photo, labelled Example");
  ok(await ev(`Boolean(${q("home-find-my-dish")}) && !${q("home-today")}`), "Find my dish; no empty meals");
  eq(await ev(`${q("home-add-dinner")}.tagName`), "BUTTON", "+ Add dinner opens the generator, not the Week");
  eq(await text("home-add-dinner"), "+ Add dinner", "add copy");
  eq(await current('[data-testid="app-nav-header"]'), "/", "Home active");
  ok(await ev(`!${q("home-groceries")}`), "no grocery card on Home");

  // ---- Today's dinner.
  const recipe = await ev(`fetch("/api/recipes").then(r => r.json()).then(list => list.find(r => r.ingredients.length > 1))`);
  ok(recipe, "a recipe with ingredients");
  const todayDate = await ev(`(d => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`)(new Date())`);
  const dish = (id, recipeId, cookDate, serves) => ({ id, recipeId, cookDate, serves: serves ?? [{ date: cookDate, adults: 2, kids: 1 }] });
  await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify(${JSON.stringify({ weekStart: thisWeek, selectedIds: [], approved: null, batches: [dish("h1", recipe.id, todayDate)] })}))`);
  try {
    await go("/", `Boolean(${q(`home-meal-${recipe.id}`)})`);
    ok((await text(`home-meal-meta-${recipe.id}`)).includes("Make 2.5 servings"), "cooked today: how much to make");
    ok(Boolean(await text("home-add-dinner")), "+ Add dinner stays");
    ok(await ev(`!${q("home-examples")} && Boolean(${q("home-find-my-dish")})`), "a dish today replaces every example; Find my dish stays");
    // A dish cooked yesterday and eaten today counts too (not on a Monday: Home reads only this week's plan).
    if (todayDate !== thisWeek) {
      const yesterday = await ev(`(d => (d.setDate(d.getDate() - 1), \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`))(new Date())`);
      const eaten = { id: "h0", recipeId: recipe.id, cookDate: yesterday, serves: [{ date: yesterday, adults: 1, kids: 0 }, { date: todayDate, adults: 1, kids: 0 }] };
      await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify(${JSON.stringify({ weekStart: thisWeek, selectedIds: [], approved: null, batches: [eaten] })}))`);
      await go("/", `Boolean(${q(`home-meal-${recipe.id}`)})`);
      ok(await ev(`!${q("home-examples")}`), "eaten today from yesterday: no examples");
    }
    await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify(${JSON.stringify({ weekStart: thisWeek, selectedIds: [], approved: null, batches: [] })}))`);
    await go("/", `Boolean(${q("home-examples")})`);
    eq(await ev(exampleCount), 3, "no dish today: all three examples return");
    await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify(${JSON.stringify({ weekStart: thisWeek, selectedIds: [], approved: null, batches: [dish("h1", recipe.id, todayDate)] })}))`);
    await go("/", `Boolean(${q(`home-meal-${recipe.id}`)})`);
    await ev(`${q(`home-meal-${recipe.id}`)}.querySelector("a").click()`);
    await until(`location.pathname === "/recipe/${encodeURIComponent(recipe.id)}" && Boolean(${q("text-recipe-title")})`, "meal opens recipe");

    // ---- Mobile and Hebrew.
    await size(390, true);
    await ev("localStorage.setItem('tablewise_language','he')");
    await go("/", `Boolean(${q("home-meals")})`);
    eq(await ev("document.documentElement.dir"), "rtl", "rtl");
    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
    await go("/plan", `location.pathname === "/meals"`); // deep link still redirects to Week

    // ---- Tasks: collapsed, with the open-task count beside the title; opening shows every open task.
    await ev("localStorage.setItem('tablewise_language','en')");
    await ev(`Promise.all(Array.from({ length: 15 }, (_, i) => fetch("/api/home-tasks/" + crypto.randomUUID(), { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Home browser task " + (i + 1), dueDate: null, priority: "normal", image: null, completedAt: null }) })))`);
    // Breakfast and lunch with nutrition: an earlier meal collapses to one line (name, two nutrients, "…") that must fit a phone.
    const fed = await ev(`fetch("/api/recipes").then(r => r.json()).then(list => list.filter(r => r.nutrition && /^\\d+$/.test(r.servings ?? "")).sort((a, b) => b.title.length - a.title.length)[0]?.id)`);
    ok(fed, "a recipe with nutrition");
    await ev(`(() => { const p = JSON.parse(localStorage.getItem("weeklyMealsState")); p.batches.push(${JSON.stringify({ ...dish("b1", fed, todayDate), meal: "Breakfast" })}, ${JSON.stringify({ ...dish("l1", fed, todayDate), meal: "Lunch" })}); localStorage.setItem("weeklyMealsState", JSON.stringify(p)); })()`);
    for (const [width, height] of [[375, 667], [360, 640]]) {
      await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
      await go("/", `Boolean(${q("home-task-count")})`); await sleep(300);
      // Today's meals are full recipe cards on a phone (2026-11-20), so Home may scroll down, never sideways.
      ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), `${width}px: Home does not scroll sideways`);
    }
    eq(await text("home-task-count"), "15", "task count beside the title");
    ok(await ev(`!${q("home-task-preview")}.open`), "tasks collapsed");
    eq(await labels('[data-testid="app-nav-bottom"] a'), ["Home", "Groceries", "Tasks"], "bottom tabs");
    await ev("scrollTo(0, document.documentElement.scrollHeight)"); await sleep(100); // phone cards make Home taller than the screen
    ok(await ev(`${q("home-task-preview")}.getBoundingClientRect().bottom <= ${q("app-nav-bottom")}.getBoundingClientRect().top`), "collapsed tasks scroll clear of the tabs");
    await ev(`${q("home-task-preview")}.querySelector("summary").click()`);
    eq(await ev(`document.querySelectorAll('[data-testid="home-task"]').length`), 15, "opened: every open task");
    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
    await ev(`${q("link-view-all-tasks")}.click()`);
    await until(`location.pathname === "/home-tasks"`, "View all tasks opens Tasks");
    eq(await current('[data-testid="app-nav-bottom"]'), "/home-tasks", "Tasks tab active");
    await ev(`fetch("/api/home-tasks").then(r => r.json()).then(list => Promise.all(list.map(t => fetch("/api/home-tasks/" + t.id, { method: "DELETE" }))))`);

    // ---- "+ Add a dish": the generator. Defaults → one recipe → Add; the Week changes only on Add.
    await call("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    const added = `(JSON.parse(localStorage.getItem("weeklyMealsState") ?? "{}").batches ?? [])`;
    await ev(`localStorage.setItem("weeklyMealsState", JSON.stringify({ weekStart: ${JSON.stringify(thisWeek)}, selectedIds: [], batches: [], approved: null })); fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: ${JSON.stringify(thisWeek)}, proposed: true, selectedIds: [], batches: [], approved: null }) })`);
    await go("/", `Boolean(${q("home-add-dinner")}) && !${q("home-add-dinner")}.disabled`);
    await ev(`${q("home-add-dinner")}.click()`);
    await until(`Boolean(${q("meal-generator")})`, "generator opens");
    eq(await ev(`document.querySelector('[role="dialog"] h2').textContent`), "Generate dinner", "dinner first");
    ok((await text("meal-generator-date")).startsWith("Today · "), "target date");
    ok(await ev(`document.activeElement !== ${q("meal-generator-query")}`), "keyboard stays closed");
    await ev(`${q("meal-generator-kind-breakfast")}.click()`);
    eq(await ev(`document.querySelector('[role="dialog"] h2').textContent`), "Generate breakfast", "kind of dish can change");
    eq(await ev(`${q("meal-generator-query")}.placeholder`), "Something savory with eggs and potatoes", "breakfast example");
    eq(await ev(`[${q("meal-generator-time-any")}, ${q("meal-generator-style-quick")}].map(b => b.getAttribute("aria-pressed"))`), ["true", "true"], "defaults: Any time, Quick & easy");
    await sleep(400); // open animation
    ok(await ev(`Math.abs(${q("meal-generator")}.getBoundingClientRect().bottom - innerHeight) <= 1`), "phone: bottom sheet");
    await ev(`${q("meal-generator-generate")}.click()`);
    await until(`Boolean(${q("meal-generator-recipe")})`, "one breakfast suggestion");
    eq(await ev(`${added}.length`), 0, "preview leaves the Week untouched");
    ok(await ev(`${q("meal-generator-ingredients")}.children.length > 0`), "ingredients shown");
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await until(`!${q("meal-generator")}`, "Escape closes");
    await until(`document.activeElement === ${q("home-add-dinner")}`, "focus back on + Add dinner");
    eq(await ev(`${added}.length`), 0, "closing adds nothing");

    // Free text + time + style; Edit request keeps them; Try another; Add; Undo.
    await ev(`${q("home-add-dinner")}.click()`);
    await until(`Boolean(${q("meal-generator-query")})`, "reopens");
    await ev(`${q("meal-generator-kind-breakfast")}.click()`);
    await ev(`(() => { const i = ${q("meal-generator-query")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "eggs"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await ev(`${q("meal-generator-time-30")}.click(); ${q("meal-generator-style-everyday")}.click()`);
    await ev(`${q("meal-generator-generate")}.click()`);
    await until(`Boolean(${q("meal-generator-recipe")} || ${q("meal-generator-none")})`, "result or message");
    await ev(`${q("meal-generator-back")}.click()`);
    eq(await ev(`[${q("meal-generator-query")}.value, ${q("meal-generator-time-30")}.getAttribute("aria-pressed"), ${q("meal-generator-style-everyday")}.getAttribute("aria-pressed")]`), ["eggs", "true", "true"], "Edit request restores the inputs");
    await ev(`(() => { const i = ${q("meal-generator-query")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "zzqx unicorn"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await ev(`${q("meal-generator-generate")}.click()`);
    await until(`Boolean(${q("meal-generator-none")})`, "no match message");
    ok((await text("meal-generator-none")).includes("zzqx unicorn"), "says what did not match");
    await ev(`${q("meal-generator-edit-filters")}.click()`);
    await ev(`(() => { const i = ${q("meal-generator-query")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    // One click per call: React applies a click's state after the event, so a Generate in the same call would use the old time.
    await ev(`${q("meal-generator-time-any")}.click()`);
    await ev(`${q("meal-generator-generate")}.click()`);
    await until(`Boolean(${q("meal-generator-recipe")})`, "suggestion");
    const first = await ev(`${q("meal-generator-recipe")}.dataset.recipeId`);
    await ev(`${q("meal-generator-another")}.click()`);
    await until(`${q("meal-generator-recipe")}?.dataset.recipeId !== ${JSON.stringify(first)}`, "another suggestion");
    const pick = await ev(`${q("meal-generator-recipe")}?.dataset.recipeId ?? null`);
    ok(pick && pick !== first, `Try another shows a different recipe (shown: ${await text("meal-generator-none")})`);
    eq(await text("meal-generator-add"), "Add to today", "add label");
    await ev(`${q("meal-generator-add")}.click(); ${q("meal-generator-add")}?.click()`); // double tap
    await until(`!${q("meal-generator")} && Boolean(${q(`home-meal-${pick}`)})`, "added dish shows on Home");
    eq(await ev(`${added}.map(b => [b.recipeId, b.cookDate])`), [[pick, todayDate]], "one dish, cooked today");
    ok((await ev("document.body.innerText")).includes("Added to today"), "confirmation");
    await ev(`${q("home-meal-undo")}.click()`);
    await until(`!${q(`home-meal-${pick}`)}`, "Undo removes the dish");
    eq(await ev(`${added}.length`), 0, "Undo removed only that dish");

    // Dinner: add beside another dish, then the Week (server copy) agrees after a reload.
    await ev(`${q("home-add-dinner")}.click()`);
    await until(`Boolean(${q("meal-generator-generate")})`, "dinner generator");
    await ev(`${q("meal-generator-generate")}.click()`);
    await until(`Boolean(${q("meal-generator-add")})`, "dinner suggestion");
    const dinner = await ev(`${q("meal-generator-recipe")}.dataset.recipeId`);
    await ev(`${q("meal-generator-add")}.click()`);
    await until(`Boolean(${q(`home-meal-${dinner}`)})`, "dinner on Home");
    await sleep(800); // write-through to /api/week-plan
    const server = await ev(`fetch("/api/week-plan?week=" + ${JSON.stringify(thisWeek)}).then(r => r.json())`);
    ok(server.batches.some(b => b.recipeId === dinner && b.cookDate === todayDate), "the Week on the server has today's dish");
    eq(server.approved, null, "approval state unchanged");
    await ev(`localStorage.removeItem("weeklyMealsState")`);
    await go("/", `Boolean(${q(`home-meal-${dinner}`)})`); // reloaded from the server copy
    // A dish cooked yesterday and eaten today shows as "Cooked <day>".
    const yesterday = await ev(`(d => { d.setDate(d.getDate() - 1); return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`; })(new Date())`);
    if (yesterday >= thisWeek) {
      await ev(`(() => { const p = JSON.parse(localStorage.getItem("weeklyMealsState")); p.batches.push(${JSON.stringify(dish("y1", recipe.id, "", []))}); const b = p.batches.at(-1); b.cookDate = ${JSON.stringify(yesterday)}; b.serves = [{ date: ${JSON.stringify(yesterday)} }, { date: ${JSON.stringify(todayDate)} }]; localStorage.setItem("weeklyMealsState", JSON.stringify(p));
        // The server copy wins on load (meal-plan.ts syncWeekPlan), so it gets the dish too.
        return fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: ${JSON.stringify(thisWeek)}, proposed: p.proposed === true, selectedIds: p.selectedIds, batches: p.batches, approved: p.approved }) }).then(r => r.status); })()`);
      await go("/", `Boolean(${q(`home-meal-${recipe.id}`)})`);
      ok((await text(`home-meal-meta-${recipe.id}`)).startsWith("Cooked "), "leftovers say when they were cooked");
    }

    await ev(`${q("home-add-dinner")}.click()`);
    await until(`Boolean(${q("meal-generator-generate")})`, "generator");
    // Choose from my recipes: an empty list for a new owner, and back restores the request.
    await until(`Boolean(${q("meal-generator-mine")})`, "request form");
    await ev(`${q("meal-generator-mine")}.click()`);
    await until(`Boolean(${q("meal-generator-mine-empty")} || ${q("meal-generator-mine-list")})`, "my recipes");
    await ev(`${q("meal-generator-back")}.click()`);
    await until(`Boolean(${q("meal-generator-generate")})`, "back to the request");

    // Desktop: a centred dialog.
    await size(1280, false);
    await sleep(200);
    ok(await ev(`(() => { const r = ${q("meal-generator")}.getBoundingClientRect(); return r.width <= 460 && r.top > 0 && r.bottom < innerHeight; })()`), "desktop: compact centred dialog");
    await ev(`fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: ${JSON.stringify(thisWeek)}, proposed: false, selectedIds: [], batches: [], approved: null }) })`);
  } finally {
    await ev(`fetch("/api/home-tasks").then(r => r.json()).then(list => Array.isArray(list) && Promise.all(list.map(t => fetch("/api/home-tasks/" + t.id, { method: "DELETE" }))))`).catch(() => undefined);
  }
  eq(errors, [], "no page errors");
  console.log(`PASS home browser: ${checks} checks`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
