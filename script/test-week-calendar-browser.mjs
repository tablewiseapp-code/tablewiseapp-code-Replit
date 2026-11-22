// The Week as a cooking plan (/meals?plan, docs/cooking-plan.md): draft by cooking day, + Add a dish, Swap dish, Edit
// servings, Move cooking day with conflicts, Remove dish with Undo, approval and Groceries, Weekly deals, legacy weeks,
// at desktop and phone widths in a real browser.
// Throwaway Chrome profile = a new guest. Usage: node script/test-week-calendar-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SCREENSHOT_DIR; // optional: save desktop and phone screenshots here
const profile = mkdtempSync(join(tmpdir(), "tw-week-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
// The API allows 120 requests a minute for everyone (server/security.ts); wait out a spent window instead of failing on it.
const rested = async () => {
  for (;;) {
    const r = await fetch(`${BASE}/api/auth/me`);
    if (r.status !== 429) return;
    await sleep((Number(r.headers.get("retry-after")) || 5) * 1000 + 500);
  }
};
const monday = (offsetWeeks = 0) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Page.enable"); await call("Runtime.enable");
  // An answered household with its cooking days saved (the guided setup and the first-use question: script/test-household-browser.mjs).
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.setItem('tablewise_language','en'); localStorage.getItem('tablewise_basic_settings') || localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped', noRestrictions: true, scheduled: true }, household: { servingsMode: 'fixed', fixedServings: 4 }, kitchen: { devices: ['Oven', 'Air fryer', 'Stovetop', 'Microwave'] } }))" });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const click = async id => { await until(`Boolean(${q(id)})`, id); await ev(`${q(id)}.click()`); };
  // Radix menus open on pointerdown, not click.
  const openMenu = async id => { await until(`Boolean(${q(id)})`, id); await ev(`${q(id)}.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }))`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const shot = async name => { if (!SHOTS) return; const { result } = await call("Page.captureScreenshot", { format: "png" }); if (result?.data) (await import("node:fs")).writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, "base64")); };
  const week = () => ev(`${q("week-range")}?.dataset.week`);
  const status = () => ev(`${q("week-status")}?.dataset.state`);
  // { "YYYY-MM-DD": [{ id, recipe }] } for every day of the shown week, in display order.
  // The current week folds days other than today: open them all before reading the dishes.
  const folded = `'[data-testid^="day-toggle-"][aria-expanded="false"]'`;
  const days = async () => {
    await ev(`document.querySelectorAll(${folded}).forEach(b => b.click())`);
    await until(`!document.querySelector(${folded})`, "days unfolded");
    return readDays();
  };
  const readDays = () => ev(`Object.fromEntries([...document.querySelectorAll('section[data-testid^="day-"]')].map(d => [d.dataset.testid.slice(4),
    [...d.querySelectorAll('[data-testid^="dish-"][data-recipe]')].map(a => ({ id: a.dataset.testid.slice(5), recipe: a.dataset.recipe }))]))`);
  const text = id => ev(`${q(id)}?.textContent ?? null`);
  const press = (scope, label) => ev(`[...document.querySelectorAll('[data-testid="${scope}"] button')].find(b => b.getAttribute("aria-label") === ${JSON.stringify(label)}).click()`);
  const serverWeek = w => ev(`fetch("/api/week-plan?week=${w}").then(r => r.json())`);
  const calendarReady = `Boolean(${q("week-status")})`;
  const desktop = () => call("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  const phone = () => call("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const thisWeek = monday();
  await desktop();
  await rested();

  // ---- The Week opens as a draft of cooking days before any action.
  await go("/meals?plan", calendarReady);
  eq(await week(), thisWeek, "opens the current week");
  // The current week folds every day with dishes except today; each folded day lists its dishes on one line.
  const toggles = await ev(`[...document.querySelectorAll('[data-testid^="day-toggle-"]')].map(b => ({ date: b.dataset.testid.slice(11), open: b.getAttribute("aria-expanded") === "true" }))`);
  const todayDate = await ev(`document.querySelector("[data-today]").dataset.testid.slice(4)`);
  ok(toggles.length > 0 && toggles.every(d => d.open === (d.date === todayDate)), "only today is open");
  for (const d of toggles.filter(d => !d.open)) {
    ok(await ev(`${q(`day-summary-${d.date}`)}.textContent.length > 0 && !${q(`day-${d.date}`)}.querySelector("[data-recipe]")`), "a folded day shows dish names, no cards");
    await click(`day-toggle-${d.date}`);
  }
  ok(await ev(`!document.querySelector(${folded})`), "a tap opens a folded day");
  let plan = await days();
  const dates = Object.keys(plan);
  eq(dates.length, 7, "seven days");
  ok(dates.every((d, i) => i === 0 || d > dates[i - 1]) && dates[0] === thisWeek, "chronological, Monday first");
  const cooking = dates.filter(d => plan[d].length);
  eq(cooking.length, 3, "Not sure yet → three cooking days, one dish each");
  ok(cooking.every(d => plan[d].length === 1), "one initial dish per cooking day");
  eq(await ev(`document.querySelectorAll('[data-today]').length`), 1, "today is highlighted");
  const free = dates.find(d => !plan[d].length);
  ok(await ev(`!${q(`day-${free}`)}.querySelector("[data-recipe], h3")`), "a day without cooking is one line, no meal sections");
  eq(await text(`add-dish-${free}`), "+ Add dish", "one + Add dish per day");
  eq(await ev(`document.querySelector("h1").textContent`), "Weekly cooking plan");
  eq(await status(), "draft");
  eq(await text("button-approve-week"), "Approve plan");
  eq(await ev(`document.getElementById("approve-hint").textContent`), "Approval builds your grocery list.");
  ok(await ev(`${q("week-header")}.contains(${q("button-approve-week")})`), "approval sits in the header, before the days");
  const first = plan[cooking[0]][0].id;
  eq(await ev(`${q(`meal-${cooking[0]}-dinner`)}.querySelector("h3").textContent`), "Dinner", "the meal is a heading above its dishes");
  ok(await ev(`!${q(`dish-meta-${first}`)}.textContent.includes("Dinner")`), "and not repeated in the info line");
  ok(await ev(`!${q(`dish-dates-${first}`)}`), "a dish eaten only on its cooking day shows no dates");
  ok(await ev(`!${q(`dish-view-${first}-mainTool`)}`), "the cooking tool stays on the recipe page (prep and cook show, 2026-11-21)");
  eq(await ev(`${q(`swap-${first}`)}.getAttribute("aria-label")`), `Swap ${await ev(`${q(`dish-link-${first}`)}.textContent`)}`);
  ok((await serverWeek(thisWeek))?.proposed === true, "the draft is saved once");
  // Weekly deals: the sample offers apply to every week; always open.
  eq(await ev(`${q("week-deals-title")}.textContent`), "Weekly deals · 2 offers");
  ok(await ev(`${q("week-deal-chicken-thighs")}.textContent.includes("Walmart") && ${q("week-deal-chicken-thighs")}.textContent.includes("/lb")`), "item, store, price and unit");
  eq(await ev(`${q("week-deal-recipes-chicken-thighs")}.getAttribute("href")`), "/meals?browse&deal=chicken-thighs");
  await shot("week-desktop");

  // ---- Acceptance 3: two dishes share a day; Swap dish changes only one; moving onto a day with one dish → three.
  const [early, late] = cooking;
  await openMenu(`add-dish-${late}`);
  await click(`add-dish-${late}-dinner`);
  await until(`Boolean(${q("pick-list")})`, "picker");
  await ev(`document.querySelector('[data-testid="pick-list"] button').click()`);
  await until(`document.querySelectorAll('[data-testid="day-${late}"] [data-recipe]').length === 2`, "two dishes");
  plan = await days();
  const [keep, change] = plan[late];
  eq(await ev(`[...${q(`day-${late}`)}.querySelectorAll("[data-meal]")].map(d => d.dataset.meal)`), ["Dinner", "Dinner"], "a second dinner sits beside the first");
  eq(await ev(`${q(`day-${late}`)}.querySelector("[data-layout]").dataset.layout`), "row", "two dishes keep the photo-left cards");
  await click(`swap-${change.id}`);
  await until(`Boolean(${q("pick-list")})`, "picker");
  ok(await ev(`!${q(`pick-${change.recipe}`)}`), "the current recipe is not offered");
  await click("pick-cancel");
  eq((await days())[late], plan[late], "Cancel keeps the dish");
  await click(`swap-${change.id}`);
  await until(`Boolean(${q("pick-list")})`, "picker");
  const replacement = await ev(`document.querySelector('[data-testid="pick-list"] button').dataset.testid.slice(5)`);
  await click(`pick-${replacement}`);
  await until(`${q(`dish-${change.id}`)}.dataset.recipe === ${JSON.stringify(replacement)}`, "swapped");
  eq((await days())[late][0], keep, "the other dish is untouched");
  // Try another: one tap puts a different recipe on the same dish; Undo brings the previous one back.
  await click(`try-another-${change.id}`);
  await until(`${q(`dish-${change.id}`)}.dataset.recipe !== ${JSON.stringify(replacement)}`, "tried another");
  const another = await ev(`${q(`dish-${change.id}`)}.dataset.recipe`);
  ok(another !== keep.recipe, "Try another skips recipes already in the Week");
  await click("undo-try-another");
  await until(`${q(`dish-${change.id}`)}.dataset.recipe === ${JSON.stringify(replacement)}`, "Undo restores the recipe");
  ok(await ev(`[...document.querySelectorAll('[data-testid^="move-day-"]')].length === 3`), "Move cooking day once per populated day");
  await click(`move-day-${late}`);
  await click(`move-to-${early}`);
  ok(await ev(`!${q("move-conflicts")} && !${q("button-confirm-move")}.disabled`), "moving earlier keeps every serving date valid");
  await click("button-confirm-move");
  await until(`document.querySelectorAll('[data-testid="day-${early}"] [data-recipe]').length === 3`, "three dishes");
  eq(await ev(`${q(`day-${early}`)}.querySelector("[data-layout]").dataset.layout`), "stacked", "three dishes: photo on top");
  ok(await ev(`!${q(`day-${early}`)}.querySelector("article.flex-row")`), "no photo-left cards on that day");
  ok(await ev(`!${q(`day-${late}`)}.querySelector("[data-recipe]")`), "the old day is empty");
  // ---- Acceptance 2 (reload): a manual move survives a reload and is on the server.
  await go("/meals?plan", calendarReady);
  eq((await days())[early].length, 3, "reload keeps the move");
  eq((await serverWeek(thisWeek)).batches.filter(b => b.cookDate === early).length, 3);

  // ---- Acceptance 4: Edit servings — 2 adults + 3 kids on the cooking day and two days later → Make 7 servings.
  const dish = (await days())[early][0].id;
  const later = (await serverWeek(thisWeek)).batches.find(b => b.id === dish);
  const plus2 = await ev(`(() => { const d = new Date(${JSON.stringify(early)} + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })()`);
  await click(`edit-servings-${dish}`);
  await until(`Boolean(${q(`serve-row-${early}`)})`, "editor");
  for (const date of [early, plus2]) {
    if (date === plus2) await click(`serve-date-${plus2}`);
    if (await ev(`Boolean(${q(`amount-${date}`)})`)) await click(`mode-${date}`); // no household counts yet: start from adults and kids
    while (Number(await text(`adults-${date}`)) < 2) await press(`serve-row-${date}`, "More Adults");
    while (Number(await text(`adults-${date}`)) > 2) await press(`serve-row-${date}`, "Fewer Adults");
    while (Number(await text(`kids-${date}`)) < 3) await press(`serve-row-${date}`, "More Kids");
    while (Number(await text(`kids-${date}`)) > 3) await press(`serve-row-${date}`, "Fewer Kids");
  }
  eq(await text("servings-total"), "Total: 7 servings", "running total, half servings kept");
  await click("servings-cancel");
  eq((await serverWeek(thisWeek)).batches.find(b => b.id === dish), later);
  await click(`edit-servings-${dish}`);
  await until(`Boolean(${q(`serve-row-${early}`)})`, "editor");
  for (const date of [early, plus2]) {
    if (date === plus2) await click(`serve-date-${plus2}`);
    if (await ev(`Boolean(${q(`amount-${date}`)})`)) await click(`mode-${date}`);
    while (Number(await text(`adults-${date}`)) < 2) await press(`serve-row-${date}`, "More Adults");
    while (Number(await text(`adults-${date}`)) > 2) await press(`serve-row-${date}`, "Fewer Adults");
    while (Number(await text(`kids-${date}`)) < 3) await press(`serve-row-${date}`, "More Kids");
    while (Number(await text(`kids-${date}`)) > 3) await press(`serve-row-${date}`, "Fewer Kids");
  }
  await click("button-save-servings");
  await until(`${q(`dish-make-${dish}`)}.textContent === "7 servings"`, "7 servings");
  const wd = d => new Date(`${d}T12:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });
  eq(await text(`dish-dates-${dish}`), `For ${wd(early)} & ${wd(plus2)}`, "separate days are listed with &");
  eq((await serverWeek(thisWeek)).batches.find(b => b.id === dish).serves, [{ date: early, adults: 2, kids: 3 }, { date: plus2, adults: 2, kids: 3 }]);
  // The recipe opens at this batch: 7 servings.
  await click(`dish-link-${dish}`);
  await until(`${q("text-servings")}?.textContent === "7 servings"`, "recipe at 7 servings");
  await click("link-back-to-planner");
  await until(calendarReady, "back to the week");

  // ---- Approve → Groceries; an edit after approval waits for Save changes.
  await click("button-approve-week");
  await until(`${q("week-status")}.dataset.state === "approved"`, "approved");
  ok(Boolean((await serverWeek(thisWeek)).approved?.length), "approved dishes saved");
  await click("button-view-groceries");
  await until(`location.pathname === "/grocery-list" && document.body.innerText.length > 200 && !document.body.innerText.includes("Approve your cooking plan")`, "groceries");
  await go("/meals?plan", calendarReady);
  // ---- Acceptance 5: moving that batch's day to the next day flags the cooking day's portions; Cancel changes nothing.
  const nextDay = dates[dates.indexOf(early) + 1];
  const approvedBefore = JSON.stringify((await serverWeek(thisWeek)).approved);
  await click(`move-day-${early}`);
  await click(`move-to-${nextDay}`);
  await until(`Boolean(${q("move-conflicts")})`, "conflicts listed");
  ok(await ev(`Boolean(${q(`conflict-${dish}:${early}`)}) && ${q(`conflict-${dish}:${early}`)}.textContent.includes("3.5 servings")`), "dish, date and portions identified");
  ok(await ev(`${q("button-confirm-move")}.disabled`), "Move waits until each portion is resolved");
  await click("move-cancel");
  eq(await status(), "approved", "Cancel keeps the approved plan");
  eq(JSON.stringify((await serverWeek(thisWeek)).approved), approvedBefore, "and its groceries");
  eq((await days())[early].length, 3);
  await click(`move-day-${early}`);
  await click(`move-to-${nextDay}`);
  await until(`Boolean(${q("move-conflicts")})`, "conflicts listed");
  await ev(`[...document.querySelectorAll('[data-testid^="conflict-move-"]')].forEach(b => b.click())`);
  await until(`!${q("button-confirm-move")}.disabled`, "resolved");
  await click("button-confirm-move");
  await until(`document.querySelectorAll('[data-testid="day-${nextDay}"] [data-recipe]').length >= 3`, "moved together");
  eq(await status(), "changed");
  eq(await text("button-approve-week"), "Save changes");
  // Remove dish: only that entry; Undo restores it.
  const gone = (await days())[nextDay].at(-1).id;
  await click(`remove-${gone}`);
  await until(`!${q(`dish-${gone}`)}`, "removed");
  await click("undo-remove-dish");
  await until(`Boolean(${q(`dish-${gone}`)})`, "restored");
  await click("button-approve-week");
  await until(`${q("week-status")}.dataset.state === "approved"`, "saved");
  await until(`fetch("/api/week-plan?week=${thisWeek}").then(r => r.json()).then(w => JSON.stringify(w.approved) === JSON.stringify(w.batches))`, "the server has the approved dishes"); // the save is queued, not awaited

  // ---- Phone: stacked cards, no sideways scroll, labelled buttons.
  await phone();
  await go("/meals?plan", calendarReady);
  await days();
  const xs = await ev(`[...document.querySelectorAll('[data-testid="day-${nextDay}"] [data-recipe]')].map(a => Math.round(a.getBoundingClientRect().x))`);
  eq(new Set(xs).size, 1, "dishes stack");
  ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
  ok(await ev(`[...document.querySelectorAll('[data-testid^="swap-"], [data-testid^="try-another-"], [data-testid^="edit-servings-"], [data-testid^="remove-"]')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44; })`), "Swap, servings and Remove fit and are 44px tall");
  ok(await ev(`${q("week-actions")}.getBoundingClientRect().top > ${q("week-range")}.getBoundingClientRect().bottom - 1 && ${q("week-actions")}.querySelector("button").getBoundingClientRect().bottom < innerHeight`), "the plan action wraps below the dates, above the fold");
  await shot("week-phone");
  await desktop();

  // ---- Other weeks and legacy plans: next week gets its own draft; a slot plan saved before cooking days is shown by date.
  await click("button-next-week");
  await until(`${q("week-range")}?.dataset.week === ${JSON.stringify(monday(1))} && Boolean(${q("week-status")})`, "next week");
  eq((await serverWeek(monday(1))).batches.length, 3, "its own draft");
  const put = body => ev(`fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify(body))} }).then(r => r.status)`);
  eq(await put({ weekStart: monday(3), proposed: false, selectedIds: [], planAssignments: [], locked: false }), 400, "the old shape is refused");
  await go(`/meals?week=${monday(2)}`, calendarReady);
  eq(await status(), "draft");

  await sleep(61_000); // a fresh request window for the second half (this file alone uses about 120 a minute)
  await rested();
  // ---- A seven-day plan (as a slot week reads: one dinner a day, ids legacy-N) with two dishes on Monday, a breakfast for
  // Mon & Wed and a dinner covering Tue–Thu; a breakfast added to Friday comes before its dinner.
  const ids = [...new Set((await serverWeek(thisWeek)).batches.map(b => b.recipeId))];
  const w4 = monday(4), d4 = i => ev(`(() => { const d = new Date(${JSON.stringify(w4)} + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + ${i}); return d.toISOString().slice(0, 10); })()`);
  const wk = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(d4));
  const batches = wk.map((date, i) => ({ id: `legacy-${i}`, recipeId: ids[i % ids.length], cookDate: date, serves: i === 1 ? [1, 2, 3].map(j => ({ date: wk[j], servings: 2 })) : [{ date, servings: 2 }] }));
  batches.push({ id: "nc", recipeId: ids[1 % ids.length], cookDate: wk[0], meal: "Breakfast", serves: [{ date: wk[0], servings: 2 }, { date: wk[2], servings: 2 }] });
  eq(await put({ weekStart: w4, proposed: true, selectedIds: [], batches, approved: null }), 204);
  await go(`/meals?week=${w4}`, calendarReady);
  plan = await days();
  ok(Object.values(plan).length === 7 && Object.values(plan).every(list => list.length >= 1), "all seven days are cooking days");
  eq(await ev(`[...${q(`day-${wk[0]}`)}.querySelectorAll("[data-meal]")].map(d => d.dataset.meal)`), ["Breakfast", "Dinner"], "breakfast before dinner");
  eq(await text("dish-dates-nc"), `For ${wd(wk[0])} & ${wd(wk[2])}`);
  eq(await text("dish-dates-legacy-1"), `For ${wd(wk[1])}–${wd(wk[3])}`, "consecutive days as a range");
  ok(await ev(`!${q("dish-dates-legacy-0")}`), "a one-day dish shows no dates");
  eq(await ev(`document.querySelectorAll('[data-testid^="move-day-"]').length`), 7, "Move day beside every date");
  await openMenu(`add-dish-${wk[4]}`);
  await click(`add-dish-${wk[4]}-breakfast`);
  await until(`Boolean(document.querySelector('[data-testid="pick-list"] button'))`, "picker");
  await ev(`document.querySelector('[data-testid="pick-list"] button').click()`);
  await until(`document.querySelectorAll('[data-testid="day-${wk[4]}"] [data-recipe]').length === 2`, "added");
  eq(await ev(`[...${q(`day-${wk[4]}`)}.querySelectorAll("[data-meal]")].map(d => d.dataset.meal)`), ["Breakfast", "Dinner"], "sorted by meal");

  // ---- Meal rows and Move to lunch / Move to dinner (2026-11-21). Chicken: today's lunch covering today and tomorrow;
  // potatoes: today's dinner; approved. Move chicken to dinner, reload, move it back; Home and groceries follow.
  const today = await ev(`(() => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); })()`);
  const tomorrow = await ev(`(() => { const d = new Date(${JSON.stringify(today)} + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })()`);
  const meals = [{ id: "ch", recipeId: ids[0], cookDate: today, meal: "Lunch", serves: [{ date: today, servings: 2 }, { date: tomorrow, servings: 2 }] },
    { id: "po", recipeId: ids[1 % ids.length], cookDate: today, serves: [{ date: today, servings: 3 }] }];
  eq(await put({ weekStart: thisWeek, proposed: true, selectedIds: [], batches: meals, approved: meals }), 204);
  const inMeal = (date, meal) => ev(`[...(${q(`meal-${date}-${meal}`)}?.querySelectorAll("[data-recipe]") ?? [])].map(d => d.dataset.testid.slice(5))`);
  await go("/meals?plan", calendarReady);
  eq(await inMeal(today, "lunch"), ["ch"]);
  eq(await inMeal(today, "dinner"), ["po"]);
  const chMeta = await text("dish-meta-ch");
  eq(await ev(`${q("move-meal-ch")}.getAttribute("aria-label")`), `Move ${await text("dish-link-ch")} to dinner`);
  eq(await ev(`${q("move-meal-po")}.getAttribute("aria-label")`), `Move ${await text("dish-link-po")} to lunch`);
  await click("move-meal-ch");
  await until(`${q(`meal-${today}-dinner`)}.querySelectorAll("[data-recipe]").length === 2`, "chicken at dinner");
  eq(await inMeal(today, "dinner"), ["po", "ch"], "appended after potatoes, one Dinner heading");
  eq(await text("dish-meta-ch"), chMeta, "same servings and coverage");
  ok(await ev(`Boolean(${q(`add-meal-${today}-lunch`)})`), "the empty lunch row offers + Add lunch");
  eq(await status(), "approved", "a meal move keeps the status");
  if (tomorrow < monday(1)) ok(await ev(`!${q(`day-${tomorrow}`)}.querySelector("[data-recipe]")`), "the dish shows once, on its cooking day");
  await until(`fetch("/api/week-plan?week=${thisWeek}").then(r => r.json()).then(w => w.batches.find(b => b.id === "ch").meal === "Dinner")`, "saved");
  await go("/meals?plan", calendarReady);
  eq(await inMeal(today, "dinner"), ["po", "ch"], "the grouping survives a reload");
  await click("move-meal-ch");
  await until(`Boolean(${q(`meal-${today}-lunch`)}?.querySelector("[data-recipe]"))`, "chicken back at lunch");
  eq(await inMeal(today, "dinner"), ["po"], "potatoes stay at dinner");
  await until(`fetch("/api/week-plan?week=${thisWeek}").then(r => r.json()).then(w => w.batches.find(b => b.id === "ch").meal === "Lunch")`, "saved");
  const back = await serverWeek(thisWeek);
  eq(back.batches.map(b => [b.id, b.serves]), [["po", meals[1].serves], ["ch", meals[0].serves]], "dates and portions unchanged");
  eq(JSON.stringify(back.approved), JSON.stringify(back.batches), "groceries use the same dishes");
  await go("/", `Boolean(${q("home-today")})`);
  ok(await ev(`Boolean(${q("home-slot-lunch")}.querySelector('[data-testid="home-remove-ch"]')) && Boolean(${q("home-slot-dinner")}.querySelector('[data-testid="home-remove-po"]'))`), "Home shows chicken at lunch, potatoes at dinner");

  // ---- Only Lunch planned: the draft is lunches; an empty scheduled day offers + Add lunch, which opens the lunch picker.
  const setMeals = list => ev(`(() => { const s = JSON.parse(localStorage.getItem("tablewise_basic_settings")); s.planning.meals = ${JSON.stringify(list)}; s.rev += 1;
    return fetch("/api/household-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }).then(r => r.status); })()`);
  eq(await setMeals(["Lunch"]), 204);
  await go(`/meals?week=${monday(6)}`, calendarReady);
  const lunchWeek = await serverWeek(monday(6));
  ok(lunchWeek.batches.length > 0 && lunchWeek.batches.every(b => b.meal === "Lunch"), "every suggestion is a lunch");
  const lunchDay = lunchWeek.batches[0].cookDate;
  ok(await ev(`!${q(`meal-${lunchDay}-dinner`)} && !${q(`meal-${lunchDay}-breakfast`)}`), "only the planned meal has a row");
  await click(`remove-${lunchWeek.batches[0].id}`);
  await until(`Boolean(${q(`add-meal-${lunchDay}-lunch`)})`, "+ Add lunch on the empty scheduled day");
  eq(await text(`add-meal-${lunchDay}-lunch`), "+ Add lunch");
  await click(`add-meal-${lunchDay}-lunch`);
  await until(`Boolean(document.querySelector('[data-testid="pick-list"] button'))`, "picker");
  ok(await ev(`${q("planner-dialog")}.textContent.startsWith("Lunch")`), "straight to lunch recipes");
  await ev(`document.querySelector('[data-testid="pick-list"] button').click()`);
  await until(`Boolean(${q(`meal-${lunchDay}-lunch`)}?.querySelector("[data-recipe]"))`, "added under Lunch");

  // ---- Only Dinner planned: a dinner moved to lunch stays there after a reload; the next draft is still dinners.
  eq(await setMeals(["Dinner"]), 204);
  await go(`/meals?week=${monday(7)}`, calendarReady);
  const dinner = (await serverWeek(monday(7))).batches[0];
  await click(`move-meal-${dinner.id}`);
  await until(`fetch("/api/week-plan?week=${monday(7)}").then(r => r.json()).then(w => w.batches.find(b => b.id === ${JSON.stringify(dinner.id)}).meal === "Lunch")`, "saved");
  await go(`/meals?week=${monday(7)}`, calendarReady);
  ok(await ev(`Boolean(${q(`meal-${dinner.cookDate}-lunch`)}?.querySelector('[data-testid="dish-${dinner.id}"]'))`), "the dish shows under Lunch, though Lunch is not planned");
  await go(`/meals?week=${monday(8)}`, calendarReady);
  ok((await serverWeek(monday(8))).batches.every(b => (b.meal ?? "Dinner") === "Dinner"), "future drafts follow the Dinner preference");

  ok(errors.length === 0, `no page errors: ${errors.join(" | ")}`);
  console.log(`week calendar browser: ${checks} checks passed`);
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still be closing */ }
}
