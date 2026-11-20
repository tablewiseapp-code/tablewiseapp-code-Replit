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
  // { "YYYY-MM-DD": [{ id, recipe }] } for every day of the shown week, in display order.
  const days = () => ev(`Object.fromEntries([...document.querySelectorAll('section[data-testid^="day-"]')].map(d => [d.dataset.testid.slice(4),
    [...d.querySelectorAll('article[data-testid^="dish-"]')].map(a => ({ id: a.dataset.testid.slice(5), recipe: a.dataset.recipe }))]))`);
  const text = id => ev(`${q(id)}?.textContent ?? null`);
  const press = (scope, label) => ev(`[...document.querySelectorAll('[data-testid="${scope}"] button')].find(b => b.getAttribute("aria-label") === ${JSON.stringify(label)}).click()`);
  const serverWeek = w => ev(`fetch("/api/week-plan?week=${w}").then(r => r.json())`);
  const calendarReady = `Boolean(${q("week-status")})`;
  const desktop = () => call("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  const phone = () => call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const thisWeek = monday();
  await desktop();

  // ---- A new guest skips Your household; the Week opens as a draft of cooking days before any action.
  await go("/meals?plan", `Boolean(${q("button-skip-household")})`);
  await click("button-skip-household");
  await go("/meals?plan", calendarReady);
  eq(await week(), thisWeek, "opens the current week");
  let plan = await days();
  const dates = Object.keys(plan);
  eq(dates.length, 7, "seven days");
  ok(dates.every((d, i) => i === 0 || d > dates[i - 1]) && dates[0] === thisWeek, "chronological, Monday first");
  const cooking = dates.filter(d => plan[d].length);
  eq(cooking.length, 3, "Not sure yet → three cooking days, one dish each");
  ok(cooking.every(d => plan[d].length === 1), "one initial dish per cooking day");
  eq(await ev(`document.querySelectorAll('[data-today]').length`), 1, "today is highlighted");
  ok(await ev(`Boolean(${q(`empty-${dates.find(d => !plan[d].length)}`)}) && ${q(`empty-${dates.find(d => !plan[d].length)}`)}.textContent.includes("No cooking planned")`), "empty days are compact");
  eq(await status(), "draft");
  eq(await text("button-approve-week"), "Approve cooking plan");
  ok((await serverWeek(thisWeek))?.proposed === true, "the draft is saved once");
  // Weekly deals: the sample offers apply to every week; collapsed until opened.
  eq(await ev(`${q("week-deals")}.querySelector("summary").textContent`), "Weekly deals · 2 offers");
  ok(await ev(`!${q("week-deals")}.open`), "collapsed");
  await ev(`${q("week-deals")}.querySelector("summary").click()`);
  ok(await ev(`${q("week-deal-chicken-thighs")}.textContent.includes("Walmart") && ${q("week-deal-chicken-thighs")}.textContent.includes("/lb")`), "item, store, price and unit");
  await shot("week-desktop");

  // ---- Acceptance 3: two dishes share a day; Swap dish changes only one; moving onto a day with one dish → three.
  const [early, late] = cooking;
  await click(`add-dish-${late}`);
  await until(`Boolean(${q("pick-list")})`, "picker");
  await ev(`document.querySelector('[data-testid="pick-list"] button').click()`);
  await until(`document.querySelectorAll('[data-testid="day-${late}"] article').length === 2`, "two dishes");
  plan = await days();
  const [keep, change] = plan[late];
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
  ok(await ev(`[...document.querySelectorAll('[data-testid^="move-day-"]')].length === 3`), "Move cooking day once per populated day");
  await click(`move-day-${late}`);
  await click(`move-to-${early}`);
  ok(await ev(`!${q("move-conflicts")} && !${q("button-confirm-move")}.disabled`), "moving earlier keeps every serving date valid");
  await click("button-confirm-move");
  await until(`document.querySelectorAll('[data-testid="day-${early}"] article').length === 3`, "three dishes");
  ok(await ev(`Boolean(${q(`empty-${late}`)})`), "the old day is empty");
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
  await until(`${q(`dish-make-${dish}`)}.textContent === "Make 7 servings"`, "Make 7 servings");
  ok((await text(`dish-dates-${dish}`)).startsWith("For ") && (await text(`dish-dates-${dish}`)).includes("&"), "both serving dates on the card");
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
  await until(`document.querySelectorAll('[data-testid="day-${nextDay}"] article').length >= 3`, "moved together");
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
  eq(JSON.stringify((await serverWeek(thisWeek)).approved.map(b => b.cookDate)), JSON.stringify((await serverWeek(thisWeek)).batches.map(b => b.cookDate)));

  // ---- Phone: stacked cards, no sideways scroll, labelled buttons.
  await phone();
  await go("/meals?plan", calendarReady);
  const xs = await ev(`[...document.querySelectorAll('[data-testid="day-${nextDay}"] article')].map(a => Math.round(a.getBoundingClientRect().x))`);
  eq(new Set(xs).size, 1, "dishes stack");
  ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
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

  ok(errors.length === 0, `no page errors: ${errors.join(" | ")}`);
  console.log(`week calendar browser: ${checks} checks passed`);
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still be closing */ }
}
