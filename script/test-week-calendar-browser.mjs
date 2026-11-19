// Week calendar (/meals): a complete 21-meal proposal, Swap, Change servings, Move meal, approval and Groceries,
// partial drafts, approved weeks, other weeks, an unfillable meal, at desktop and phone widths in a real browser.
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
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.setItem('tablewise_language','en')" });
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
  const cells = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-testid^="cell-"]')].map(c => [c.dataset.testid.slice(5), c.dataset.recipe]))`);
  const serverWeek = w => ev(`fetch("/api/week-plan?week=${w}").then(r => r.json())`);
  const calendarReady = `Boolean(${q("week-status")})`;
  const desktop = () => call("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  const phone = () => call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const thisWeek = monday();
  await desktop();

  // ---- A new guest skips Your household; the Week opens with 21 meals before any action.
  await go("/meals", `Boolean(${q("button-skip-household")})`);
  await click("button-skip-household");
  await go("/meals", calendarReady);
  eq(await week(), thisWeek, "opens the current week");
  const first = await cells();
  eq(Object.keys(first).length, 21, "seven days × three meals");
  ok(Object.values(first).every(Boolean), "every slot has a recipe");
  eq(await status(), "ready", "Ready for review");
  ok(await ev(`!${q("button-approve-week")}.disabled`), "Approve week is the primary action");
  ok(await ev(`!${q("button-fill-week")} && !${q("button-finalize-week")}`), "no Fill my week or Finalize week");
  ok(new Set(Object.values(first)).size >= 15, "variety: the catalog allows mostly different recipes");
  eq(await ev(`[...document.querySelectorAll('[data-testid="day-1"] [data-testid^="cell-"]')].map(c => c.dataset.testid)`), ["cell-Breakfast-1", "cell-Lunch-1", "cell-Dinner-1"], "Breakfast, Lunch, Dinner order");
  // Desktop: seven columns, meal rows aligned across days.
  eq(await ev(`new Set([1,2,3,4,5,6,0].map(d => Math.round(document.querySelector('[data-testid="day-'+d+'"]').getBoundingClientRect().y))).size`), 1, "days side by side");
  eq(await ev(`new Set([1,2,3,4,5,6,0].map(d => Math.round(document.querySelector('[data-testid="cell-Dinner-'+d+'"]').getBoundingClientRect().y))).size`), 1, "dinner row lines up");
  ok((await serverWeek(thisWeek))?.proposed === true, "the proposal is saved for this week");
  await shot("week-desktop");

  // ---- Swap Wednesday lunch (day 3): Cancel keeps it; picking replaces only that slot.
  await click("swap-Lunch-3");
  await until(`Boolean(${q("pick-list-Lunch-3")})`, "picker");
  ok(await ev(`!document.querySelector('[data-testid="pick-list-Lunch-3"] [data-testid="pick-${first["Lunch-3"]}"]')`), "current recipe not offered");
  await click("pick-cancel");
  eq((await cells())["Lunch-3"], first["Lunch-3"], "Cancel keeps the original");
  await click("swap-Lunch-3");
  await until(`Boolean(${q("pick-list-Lunch-3")})`, "picker");
  const replacement = await ev(`document.querySelector('[data-testid="pick-list-Lunch-3"] button').dataset.testid.slice(5)`);
  await click(`pick-${replacement}`);
  await until(`document.querySelector('[data-testid="cell-Lunch-3"]').dataset.recipe === ${JSON.stringify(replacement)}`, "swapped");

  // ---- Change Monday dinner's servings from the card menu.
  const before = (await serverWeek(thisWeek)).planAssignments.find(a => a.mealType === "Dinner" && a.startDay === 1).servings ?? null;
  await openMenu("menu-Dinner-1");
  await click("servings-Dinner-1");
  const start = Number(await ev(`${q("servings-value")}.textContent`));
  await ev(`document.querySelector('[aria-label="More servings"]').click()`);
  await ev(`document.querySelector('[aria-label="More servings"]').click()`);
  await click("button-save-servings");
  const servings = start + 2;
  await until(`${q("meta-Dinner-1")}.textContent.includes("${servings}")`, "servings shown on the card");
  ok(servings !== before, "servings changed");

  // ---- Refresh, then another week and back: both edits persist, the other 19 slots are unchanged.
  const edited = { ...first, "Lunch-3": replacement };
  await go("/meals", calendarReady);
  eq(await cells(), edited, "after reload");
  await click("button-next-week");
  await until(`${q("week-range")}?.dataset.week === "${monday(1)}" && Boolean(${q("week-status")})`, "next week");
  ok(Object.values(await cells()).every(Boolean), "next week gets its own complete proposal");
  await click("button-prev-week");
  await until(`${q("week-range")}?.dataset.week === "${thisWeek}" && Boolean(${q("week-status")})`, "back");
  eq(await cells(), edited, "after switching weeks");
  const saved = await serverWeek(thisWeek);
  eq(saved.planAssignments.find(a => a.mealType === "Dinner" && a.startDay === 1).servings, servings, "servings saved on the server");

  // ---- Recipe name opens the recipe; Back returns to the same week.
  await click("recipe-link-Lunch-3");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("link-back-to-planner")})`, "recipe page");
  await click("link-back-to-planner");
  await until(`${q("week-range")}?.dataset.week === "${thisWeek}" && Boolean(${q("week-status")})`, "back to planner");
  eq(await cells(), edited, "edits kept after the recipe page");

  // ---- Approve: one click, reload stays approved, Groceries uses the approved meals.
  await click("button-approve-week");
  await until(`${q("week-status")}.dataset.state === "approved"`, "approved");
  ok(await ev(`Boolean(${q("button-create-grocery-list")}) && Boolean(${q("button-edit-week")}) && !${q("swap-Lunch-3")}`), "approved actions; cards are read-only");
  await go("/meals", calendarReady);
  eq(await status(), "approved", "approval survives reload");
  eq(await cells(), edited, "approved exactly as shown");
  await click("button-create-grocery-list");
  await until(`location.pathname === "/grocery-list" && document.body.innerText.length > 200`, "grocery list");
  const plan = await ev(`JSON.parse(localStorage.getItem("weeklyMealsState"))`);
  eq(plan.planAssignments.find(a => a.mealType === "Lunch" && a.startDay === 3).recipeId, replacement, "Groceries reads the replacement");
  eq(plan.planAssignments.find(a => a.mealType === "Dinner" && a.startDay === 1).servings, servings, "Groceries reads the servings");
  const ingredient = await ev(`fetch("/api/recipes/${replacement}").then(r => r.json()).then(r => r.ingredients[0])`);
  const word = ingredient.toLowerCase().replace(/[^a-z ]/g, " ").split(" ").filter(w => w.length > 3).at(-1);
  ok(!word || (await ev(`document.body.innerText.toLowerCase().includes(${JSON.stringify(word)})`)), `grocery list has "${word}" from the replacement`);

  // ---- Phone: vertical agenda, no horizontal scroll, Move meal without dragging (trading places).
  await phone();
  await go("/meals", calendarReady);
  ok(await ev("document.documentElement.scrollWidth <= innerWidth"), "no horizontal scroll on a phone");
  ok(await ev(`document.querySelector('[data-testid="day-2"]').getBoundingClientRect().y > document.querySelector('[data-testid="day-1"]').getBoundingClientRect().bottom - 1`), "days stacked");
  ok(await ev(`/\\w/.test(document.querySelector('#day-heading-1').innerText)`), "day heading visible");
  ok(await ev(`[...document.querySelectorAll('[data-testid^="recipe-link-"]')].every(a => a.scrollWidth <= a.clientWidth + 1)`), "long titles wrap, never cut");
  await click("button-edit-week");
  await until(`${q("week-status")}.dataset.state === "ready"`, "editing again");
  const a = (await cells())["Breakfast-1"], b = (await cells())["Breakfast-2"];
  await openMenu("menu-Breakfast-1");
  await click("move-Breakfast-1");
  await click("move-day-2");
  await until(`Boolean(${q("move-trade")})`, "trade notice");
  await click("button-confirm-move");
  await until(`document.querySelector('[data-testid="cell-Breakfast-2"]').dataset.recipe === ${JSON.stringify(a)}`, "moved");
  eq((await cells())["Breakfast-1"], b, "the two meals traded places");
  await shot("week-phone");
  await click("button-approve-week");
  await until(`${q("week-status")}.dataset.state === "approved"`, "approved again");
  await desktop();

  // ---- An existing partial draft: kept, gaps filled once. An approved week: preserved exactly, gaps and all.
  const put = body => ev(`fetch("/api/week-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify(body))} }).then(r => r.status)`);
  const ids = Object.values(edited);
  const draftWeek = monday(2), approvedWeek = monday(3);
  const kept = [{ recipeId: ids[0], mealType: "Dinner", startDay: 3, spanDays: 1, servings: 7 }, { recipeId: ids[1], mealType: "Breakfast", startDay: 0, spanDays: 1 }];
  eq(await put({ weekStart: draftWeek, proposed: false, selectedIds: [], planAssignments: kept, locked: false }), 204);
  eq(await put({ weekStart: approvedWeek, proposed: false, selectedIds: [], planAssignments: kept, locked: true }), 204);
  await go(`/meals?week=${draftWeek}`, calendarReady);
  const draft = await cells();
  ok(Object.values(draft).every(Boolean), "partial draft completed");
  eq([draft["Dinner-3"], draft["Breakfast-0"]], [ids[0], ids[1]], "scheduled meals kept");
  eq((await serverWeek(draftWeek)).planAssignments.find(x => x.startDay === 3 && x.mealType === "Dinner").servings, 7, "their servings kept");
  await go(`/meals?week=${approvedWeek}`, calendarReady);
  eq(await status(), "approved");
  eq(Object.values(await cells()).filter(Boolean).length, 2, "approved week unchanged");
  eq((await serverWeek(approvedWeek)).planAssignments, kept, "nothing was added on the server");
  // Groceries for another week uses that week.
  await click("button-create-grocery-list");
  await until(`location.search === "?week=${approvedWeek}" && document.body.innerText.length > 100`, "grocery for another week");

  // ---- No eligible recipe for one meal: vegetarian household whose lunch rule requires meat. Lunches stay open; no approval.
  const settings = await ev(`JSON.parse(localStorage.getItem("tablewise_basic_settings"))`);
  settings.dietary.diets = ["vegetarian"]; settings.planning.mealRules.Lunch.type = "meat"; settings.rev += 1;
  await ev(`localStorage.setItem("tablewise_basic_settings", ${JSON.stringify(JSON.stringify(settings))})`);
  await ev(`fetch("/api/household-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: localStorage.getItem("tablewise_basic_settings") }).then(r => r.status)`);
  const emptyWeek = monday(4);
  await go(`/meals?week=${emptyWeek}`, calendarReady);
  const restricted = await cells();
  eq(Object.entries(restricted).filter(([, id]) => !id).map(([k]) => k.split("-")[0]), Array(7).fill("Lunch"), "only the lunches are open");
  eq(await status(), "incomplete");
  ok((await ev(`${q("week-status")}.textContent`)).includes("7"), "says how many meals are still needed");
  ok(await ev(`${q("button-approve-week")}.disabled && Boolean(${q("choose-Lunch-1")})`), "approval disabled; Choose recipe offered");
  ok(await ev(`${q("open-Lunch-1")}.textContent === "No eligible recipe"`), "the open slot says why");

  ok(errors.length === 0, `no page errors: ${errors.join(" | ")}`);
  console.log(`week calendar browser: ${checks} checks passed`);
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still be closing */ }
}
