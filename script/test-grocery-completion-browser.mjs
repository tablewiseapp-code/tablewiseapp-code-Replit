// Browser test for grocery category completion against the running app (throwaway Chrome profile only).
// Usage: node script/test-grocery-completion-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-grocery-"));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (!r) return undefined; /* page navigating */ if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what}; page says: ${String(await ev('document.body.innerText')).slice(0, 200).replace(/\n/g, ' | ')}`); };
  const section = c => `document.querySelector('[data-grocery-category=${JSON.stringify(c)}]')`;
  const info = c => ev(`(() => { const s = ${section(c)}; return { complete: s.dataset.complete === 'true', collapsed: s.dataset.collapsed === 'true', hidden: s.querySelector('ul').hidden,
    expanded: s.querySelector('.grocery-category-toggle').getAttribute('aria-expanded'), icon: !!s.querySelector('.grocery-complete-icon'), badge: s.querySelector('.grocery-complete-badge')?.textContent ?? null,
    sub: s.querySelector('[data-testid^=category-sub-]')?.textContent ?? null, count: s.querySelector('.grocery-category-count')?.textContent ?? null,
    boxes: [...s.querySelectorAll('input[type=checkbox]')].map(b => b.checked) }; })()`);
  const counter = () => ev("document.querySelector('.grocery-count strong').textContent.trim()");
  const box = (c, i) => ev(`${section(c)}.querySelectorAll('input[type=checkbox]')[${i}].click()`);
  const toggle = c => ev(`${section(c)}.querySelector('.grocery-category-toggle').click()`);
  const load = async () => { await call("Page.navigate", { url: `${BASE}/grocery-list` }); await sleep(800); await until("Boolean(document.querySelector('.grocery-category'))", "list renders"); };

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  const recipes = await (await fetch(`${BASE}/api/recipes`)).json();
  const ids = recipes.filter(r => r.id.startsWith("tablewise:real:v1:")).slice(0, 3).map(r => r.id);
  const plan = { selectedIds: ids, planAssignments: ids.map((recipeId, i) => ({ recipeId, mealType: "Dinner", startDay: i, spanDays: 1 })) };
  await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','en'); localStorage.setItem('weeklyMealsState', ${JSON.stringify(JSON.stringify(plan))})`);
  await load();

  const cats = await ev("[...document.querySelectorAll('[data-grocery-category]')].map(s => [s.dataset.groceryCategory, s.querySelectorAll('input[type=checkbox]').length])");
  assert.ok(cats.length >= 3 && cats.every(([, count]) => count > 0), "only non-empty categories render (empty ones are never shown or complete)");
  assert.equal(await ev("document.querySelectorAll('[data-complete=true]').length"), 0, "nothing complete at the start");
  const total = cats.reduce((sum, [, count]) => sum + count, 0);
  assert.equal(await counter(), `0 / ${total}`);
  const multi = cats.find(([, count]) => count >= 2)[0], multiCount = cats.find(([, count]) => count >= 2)[1];
  const other = cats.find(([name]) => name !== multi)[0];

  // Completing the final unchecked ingredient auto-collapses.
  for (let i = 0; i < multiCount - 1; i++) await box(multi, i);
  let s = await info(multi);
  assert.equal(s.complete, false); assert.equal(s.collapsed, false, "still open while one item remains"); assert.equal(s.icon, false);
  await box(multi, multiCount - 1);
  s = await info(multi);
  assert.equal(s.complete, true); assert.equal(s.collapsed, true); assert.equal(s.hidden, true, "item list replaced by the compact header");
  assert.equal(s.expanded, "false"); assert.equal(s.icon, true, "check-circle icon"); assert.equal(s.sub, "All items collected");
  assert.equal(s.badge, "Complete");
  assert.equal(await counter(), `${multiCount} / ${total}`, "overall counter stays accurate");
  assert.equal(await ev("document.activeElement?.classList.contains('grocery-category-toggle')"), true, "focus moves to the header");

  // Manual expand: stays expanded, other-category changes do not re-collapse it.
  await toggle(multi);
  s = await info(multi); assert.equal(s.collapsed, false); assert.equal(s.complete, true, "still marked complete when reviewing");
  await box(other, 0); await sleep(200);
  assert.equal((await info(multi)).collapsed, false, "no repeated auto-collapse after a deliberate expand");

  // Unchecking removes Complete and keeps it expanded; re-completing collapses again.
  await box(multi, 0);
  s = await info(multi);
  assert.equal(s.complete, false); assert.equal(s.collapsed, false); assert.equal(s.icon, false); assert.equal(s.badge, null); assert.equal(s.sub, null);
  assert.equal(await counter(), `${multiCount} / ${total}`, "counter drops by one and includes the other tick");
  await box(multi, 0);
  assert.equal((await info(multi)).collapsed, true, "completing again auto-collapses");

  // Persistence: collapsed + checked survive a reload; an explicit expand survives too.
  await load();
  s = await info(multi); assert.equal(s.complete, true); assert.equal(s.collapsed, true, "complete categories load collapsed");
  assert.equal(await counter(), `${multiCount + 1} / ${total}`);
  await toggle(multi); await load();
  assert.equal((await info(multi)).collapsed, false, "explicit expand preference persists over the default");
  await toggle(multi); await load();
  assert.equal((await info(multi)).collapsed, true);

  // Reordering still works (keyboard).
  const before = await ev("[...document.querySelectorAll('[data-grocery-category]')].map(s => s.dataset.groceryCategory)");
  await ev("document.querySelector('.grocery-drag-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))"); await sleep(200);
  const after = await ev("[...document.querySelectorAll('[data-grocery-category]')].map(s => s.dataset.groceryCategory)");
  assert.deepEqual(after.slice(0, 2), [before[1], before[0]], "category reordering unchanged");

  // Whole list complete.
  assert.equal(await ev("Boolean(document.querySelector('[data-testid=grocery-shopping-complete]'))"), false);
  for (const [name, count] of cats) {
    for (let i = 0; i < count; i++) {
      if ((await info(name)).collapsed) await toggle(name);
      if (!(await info(name)).boxes[i]) await box(name, i);
    }
  }
  await until("Boolean(document.querySelector('[data-testid=grocery-shopping-complete]'))", "success message");
  assert.match(await ev("document.querySelector('[data-testid=grocery-shopping-complete]').textContent"), /Shopping complete!.*All ingredients on your grocery list have been collected\./);
  assert.equal(await counter(), `${total} / ${total}`);
  assert.equal(await ev("document.querySelectorAll('.grocery-category').length"), cats.length, "list is never deleted or reset");
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll");
  await load();
  assert.equal(await ev("Boolean(document.querySelector('[data-testid=grocery-shopping-complete]'))"), true, "message persists after reload");
  // The loop above expanded some categories by hand (explicit preferences, which win). Drop them to check the default.
  await ev("(() => { const k = 'tablewise:grocery-list:v1', p = JSON.parse(localStorage.getItem(k)); p.expansion = {}; localStorage.setItem(k, JSON.stringify(p)); })()");
  await load();
  assert.equal(await ev("document.querySelectorAll('[data-collapsed=true]').length"), cats.length, "all categories load collapsed when complete and no explicit preference exists");
  await toggle(multi); await box(multi, 0);
  assert.equal(await ev("Boolean(document.querySelector('[data-testid=grocery-shopping-complete]'))"), false, "message disappears when an item is unchecked");
  console.log("PASS grocery completion browser: last-item completion, auto-collapse + icon/'All items collected'/Complete, manual expand kept, uncheck reopens, re-complete collapses, persistence on reload (default + explicit), only non-empty categories, reorder intact, overall counter, Shopping complete message, no horizontal scroll at 390px.");
} finally {
  chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
