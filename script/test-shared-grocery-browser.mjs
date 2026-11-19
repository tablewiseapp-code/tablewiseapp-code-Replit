// Browser test for grocery item notes and share links against the running app (throwaway Chrome profile only).
// Usage: node script/test-shared-grocery-browser.mjs   (BASE_URL, CHROME_PATH, SHOTS_DIR optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS_DIR;
const profile = mkdtempSync(join(tmpdir(), "tw-shared-"));
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
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.getItem('tablewise_basic_settings') || localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped' } }))" }); // skip the first-visit sign-in screen
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true, userGesture: true })).result; if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what}; page says: ${String(await ev('document.body.innerText')).slice(0, 300).replace(/\n/g, ' | ')}`); };
  const has = id => `Boolean(document.querySelector('[data-testid=${id}]'))`;
  const click = id => ev(`document.querySelector('[data-testid=${id}]').click()`);
  // On the owner's list the note is an action in the first row's "…" menu.
  const ownNote = async () => {
    await ev("document.querySelector('.grocery-item [data-testid=button-item-picture-menu]').focus()");
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", windowsVirtualKeyCode: 13 });
    await until(has("button-item-note"), "row menu opens");
    await click("button-item-note");
  };
  // React reads values through the native setter.
  const type = (selector, text, event = "input") => ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('${event}', { bubbles: true })); })()`);
  const shot = async name => { if (SHOTS) writeFileSync(join(SHOTS, `${name}.png`), Buffer.from((await call("Page.captureScreenshot")).result.data, "base64")); };
  const open = async (url, ready) => { await call("Page.navigate", { url }); await sleep(600); await until(ready, `${url} renders`); };
  const overflow = () => ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");

  await call("Network.enable");
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  const recipes = await (await fetch(`${BASE}/api/recipes`)).json();
  const ids = recipes.filter(r => r.id.startsWith("tablewise:real:v1:")).slice(0, 3).map(r => r.id);
  const plan = { selectedIds: ids, planAssignments: ids.map((recipeId, i) => ({ recipeId, mealType: "Dinner", startDay: i, spanDays: 1 })) };
  await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','en'); localStorage.setItem('weeklyMealsState', ${JSON.stringify(JSON.stringify(plan))})`);
  const list = () => open(`${BASE}/grocery-list`, has("button-share-export"));
  await list();

  // A note on an item saves, shows under the item and survives a reload.
  const total = await ev("document.querySelectorAll('.grocery-item').length");
  const firstItem = await ev("document.querySelector('.grocery-item .grocery-ingredient').textContent");
  await ownNote();
  await until(has("input-item-note"), "note input opens");
  await type("[data-testid=input-item-note]", "the ripe ones");
  await ev("document.querySelector('[data-testid=input-item-note]').blur()");
  await until("document.querySelector('[data-testid=grocery-item-note]')?.textContent === 'the ripe ones'", "note shows");
  await sleep(400);
  await list();
  await until("document.querySelector('[data-testid=grocery-item-note]')?.textContent === 'the ripe ones'", "note survives a reload");
  assert.equal(await overflow(), 0, "no sideways scroll on the list");
  await shot("1-own-list-note");

  // Create a share link with the "add" role.
  await click("button-share-export");
  await until(has("button-create-link"), "share dialog shows the link block");
  await sleep(400);
  await shot("2-share-dialog");
  await type("[data-testid=select-link-role]", "add", "change");
  await click("button-create-link");
  await until(has("link-open-shared"), "the new link is listed");
  await shot("3-share-dialog-link");
  const link = await ev("document.querySelector('[data-testid=link-open-shared]').href");
  assert.match(link, /\/shared\/[a-f0-9]{64}$/);

  const shared = () => open(link, has("shared-access"));
  const access = () => ev("document.querySelector('[data-testid=shared-access]').textContent");
  const cookies = () => call("Network.getAllCookies").then(r => r.result.cookies);
  const ownerCookies = await cookies();
  const asGuest = async () => { await call("Network.clearBrowserCookies"); await shared(); };
  const asOwner = async () => { await call("Network.setCookies", { cookies: ownerCookies }); await shared(); };
  const setRole = async role => { await asOwner(); await type("[data-testid=select-shared-role]", role, "change"); await sleep(500); };

  // The owner sees the saved copy, with the note, and the owner controls.
  await shared();
  assert.equal(await access(), "You shared this list.");
  assert.equal(await ev("document.querySelectorAll('[data-testid=shared-item]').length"), total, "the whole list was saved");
  assert.equal(await ev("[...document.querySelectorAll('[data-testid=grocery-item-note]')].map(n => n.textContent).join()"), "the ripe ones");
  assert.equal(await ev(has("button-turn-off-link")), true);
  await shot("4-shared-owner");

  // Guest with "add": tick, add an item, write a note; no edit or remove buttons, no owner controls.
  await asGuest();
  assert.equal(await access(), "Tick, add items and notes");
  assert.deepEqual([await ev(has("button-turn-off-link")), await ev(has("button-shared-edit")), await ev(has("input-shared-add"))], [false, false, true]);
  await type("[data-testid=input-shared-add]", "oat milk");
  await click("button-shared-add");
  await until("[...document.querySelectorAll('[data-testid=shared-item] .grocery-ingredient')].some(n => n.textContent === 'oat milk')", "added item shows");
  await ev("document.querySelector('[data-testid=shared-item] input[type=checkbox]').click()");
  await until("document.querySelector('.grocery-count strong').textContent.trim().startsWith('1 /')", "tick counts");
  assert.equal(await overflow(), 0, "no sideways scroll on the shared list");
  await shot("5-shared-guest-add");

  // "View": nothing can be changed.
  await setRole("view");
  await asGuest();
  assert.equal(await access(), "View only");
  assert.deepEqual([await ev(has("input-shared-add")), await ev(has("button-item-note")), await ev(has("button-shared-edit"))], [false, false, false]);
  assert.equal(await ev("[...document.querySelectorAll('[data-testid=shared-item] input[type=checkbox]')].every(b => b.disabled)"), true);
  assert.equal(await ev("document.querySelector('.grocery-count strong').textContent.trim().startsWith('1 /')"), true, "the guest's tick was saved for everyone");
  await shot("6-shared-guest-view");

  // "Edit": rename and remove.
  await setRole("edit");
  await asGuest();
  assert.equal(await access(), "Also edit and remove items");
  const before = await ev("document.querySelectorAll('[data-testid=shared-item]').length");
  assert.equal(before, total + 1);
  await click("button-shared-edit");
  await until(has("input-shared-edit"), "edit input opens");
  await type("[data-testid=input-shared-edit]", "renamed item");
  await ev("document.querySelector('[data-testid=input-shared-edit]').blur()");
  await until("[...document.querySelectorAll('[data-testid=shared-item] .grocery-ingredient')].some(n => n.textContent === 'renamed item')", "rename shows");
  await sleep(500);
  await click("button-shared-remove");
  await until(`document.querySelectorAll('[data-testid=shared-item]').length === ${before - 1}`, "item removed");
  await shot("7-shared-guest-edit");

  // Hebrew, right to left.
  await ev("localStorage.setItem('tablewise_language','he')");
  await shared();
  assert.equal(await ev("document.documentElement.dir"), "rtl");
  assert.equal(await overflow(), 0, "no sideways scroll in Hebrew");
  await shot("8-shared-hebrew");
  await ev("localStorage.setItem('tablewise_language','en')");

  // The owner's own list was never touched, and turning the link off ends access for everyone.
  await asOwner();
  await ev("window.confirm = () => true");
  await click("button-turn-off-link");
  await until("location.pathname === '/grocery-list'", "owner returns to their list");
  await until(has("button-share-export"), "own list renders");
  assert.equal(await ev("document.querySelectorAll('.grocery-item').length"), total, "own list unchanged");
  assert.equal(await ev("document.querySelector('.grocery-item .grocery-ingredient').textContent"), firstItem);
  await open(link, has("shared-list-gone"));
  await shot("9-shared-gone");
  // Leave no test note behind.
  await list();
  await ownNote();
  await until(has("input-item-note"), "note input opens");
  await type("[data-testid=input-item-note]", "");
  await ev("document.querySelector('[data-testid=input-item-note]').blur()");
  await sleep(500);

  console.log(`PASS shared grocery: ${total} items, note saved, link per role (view / add / edit), owner controls, Hebrew RTL, link turned off.`);
  ws.close();
} finally {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
