// Browser test for Grocery List Share / Export against the running app (throwaway Chrome profile only).
// Usage: node script/test-grocery-share-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-share-"));
const downloads = mkdtempSync(join(tmpdir(), "tw-share-dl-"));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await Promise.all([new Promise(r => (ws.onopen = r)), new Promise(r => (browser.onopen = r))]);
  let n = 0; const waiting = {};
  const onMsg = m => { const d = JSON.parse(m.data); waiting[d.id]?.(d); };
  ws.onmessage = onMsg; browser.onmessage = onMsg;
  const send = (sock, method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
  const call = (method, params) => send(ws, method, params);
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true, userGesture: true })).result; if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what}; page says: ${String(await ev('document.body.innerText')).slice(0, 200).replace(/\n/g, ' | ')}`); };
  const click = id => ev(`document.querySelector('[data-testid=${id}]').click()`);
  const count = scope => ev(`document.querySelector('[data-testid=share-scope-${scope}]').parentElement.querySelector('.grocery-share-count').textContent`).then(Number);

  await send(browser, "Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await send(browser, "Browser.grantPermissions", { origin: new URL(BASE).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await call("Emulation.setFocusEmulationEnabled", { enabled: true }); // clipboard needs a focused document
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  const recipes = await (await fetch(`${BASE}/api/recipes`)).json();
  const ids = recipes.filter(r => r.id.startsWith("tablewise:real:v1:")).slice(0, 3).map(r => r.id);
  const plan = { selectedIds: ids, planAssignments: ids.map((recipeId, i) => ({ recipeId, mealType: "Dinner", startDay: i, spanDays: 1 })) };
  const load = async lang => {
    await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','${lang}'); localStorage.setItem('weeklyMealsState', ${JSON.stringify(JSON.stringify(plan))})`);
    await call("Page.navigate", { url: `${BASE}/grocery-list` }); await sleep(800);
    await until("Boolean(document.querySelector('[data-testid=button-share-export]'))", "share button renders");
  };
  await load("en");

  // Check two items, then open the dialog: remaining excludes them, all includes them.
  await ev("[...document.querySelectorAll('.grocery-item input[type=checkbox]')].slice(0, 2).forEach(b => b.click())");
  const counter = await ev("document.querySelector('.grocery-count strong').textContent.trim()");
  const total = Number(counter.split("/")[1]);
  await click("button-share-export");
  await until("Boolean(document.querySelector('[data-testid=grocery-share-dialog]'))", "dialog opens");
  assert.equal(await ev("document.querySelectorAll('.grocery-share-action').length"), 6, "six actions");
  assert.equal(await count("remaining"), total - 2);
  assert.equal(await count("all"), total);
  assert.equal(await ev("document.querySelector('[data-testid=share-scope-remaining]').checked"), true, "remaining is the default");

  // Mobile: bottom sheet.
  await sleep(400); // let the open animation finish
  const rect = await ev("(() => { const r = document.querySelector('[data-testid=grocery-share-dialog]').getBoundingClientRect(); return { bottom: Math.round(r.bottom), width: Math.round(r.width) }; })()");
  assert.deepEqual(rect, { bottom: 844, width: 390 }, "bottom sheet on phones");

  // Stub outbound navigation to capture URLs.
  await ev(`window.__opened = []; window.open = (url) => { window.__opened.push(url); return { document: { write: h => window.__pdf = h, close() {} }, addEventListener() {}, focus() {}, print() { window.__printed = true; } }; }`);
  await click("share-whatsapp");
  const wa = decodeURIComponent((await ev("window.__opened[0]")).split("?text=")[1]);
  assert.ok(wa.startsWith("TableWise Grocery List\n\n"), "WhatsApp text has the title");
  assert.equal(wa.split("\n").filter(l => l.startsWith("- ")).length, total - 2, "remaining items only");
  assert.ok(!/[<>]|data-testid|tablewise:real/.test(wa), "no HTML, test attributes or ids");

  await click("share-copy"); await sleep(200);
  assert.equal(await ev("navigator.clipboard.readText()"), wa, "copy matches shared text");

  await click("share-facebook"); await sleep(200);
  assert.equal(new URL(await ev("window.__opened[1]")).searchParams.get("u"), new URL(BASE).origin, "Facebook shares a link only");

  await ev("window.__shared = null; navigator.share = d => { window.__shared = d; return Promise.resolve(); }");
  await click("share-more"); await sleep(100);
  assert.equal(await ev("window.__shared.text"), wa, "Web Share API gets the list");
  await ev("navigator.share = undefined; navigator.clipboard.writeText('')");
  await click("share-more"); await sleep(200);
  assert.equal(await ev("navigator.clipboard.readText()"), wa, "no Web Share: falls back to copying");

  // Entire list + exports.
  await click("share-scope-all");
  await click("share-export");
  await click("export-pdf"); await sleep(100);
  assert.ok(await ev("window.__printed && window.__pdf.includes('✓')"), "PDF page printed with checked marks");
  await click("export-txt"); await click("export-csv");
  for (let i = 0; i < 40 && readdirSync(downloads).filter(f => !f.endsWith(".crdownload")).length < 2; i++) await sleep(150);
  const files = readdirSync(downloads);
  const txt = readFileSync(join(downloads, files.find(f => f.endsWith(".txt"))), "utf8");
  const csv = readFileSync(join(downloads, files.find(f => f.endsWith(".csv"))), "utf8");
  assert.equal(txt.split("\n").filter(l => /^[-✓] /.test(l)).length, total, "TXT has the entire list");
  assert.ok(csv.startsWith("﻿Category,Ingredient,Quantity,Unit,Checked,In pantry"));
  assert.equal(csv.trim().split("\r\n").length, total + 1, "CSV row per item");
  assert.equal((csv.match(/,yes,(yes|no)\r\n/g) ?? []).length, 2, "two checked rows");

  // Sharing changed nothing on the list.
  await ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); await sleep(300);
  assert.equal(await ev("document.querySelector('.grocery-count strong').textContent.trim()"), counter, "progress unchanged");

  // Hebrew: RTL dialog and translated text; desktop: centered dialog.
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await load("he");
  await click("button-share-export");
  await until("Boolean(document.querySelector('[data-testid=grocery-share-dialog]'))", "dialog opens (he)");
  assert.equal(await ev("document.documentElement.dir"), "rtl");
  assert.equal(await ev("getComputedStyle(document.querySelector('[data-testid=grocery-share-dialog]')).direction"), "rtl");
  assert.ok((await ev("document.querySelector('[data-testid=grocery-share-dialog]').textContent")).includes("שיתוף / ייצוא"));
  await sleep(400);
  const desk = await ev("(() => { const r = document.querySelector('[data-testid=grocery-share-dialog]').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - 640) < 2 && r.bottom < 900; })()");
  assert.ok(desk, "centered dialog on desktop");
  await ev(`window.open = u => { window.__he = u; }`);
  await click("share-whatsapp");
  assert.ok(decodeURIComponent((await ev("window.__he")).split("?text=")[1]).startsWith("רשימת הקניות של TableWise"), "Hebrew text encoded intact");

  console.log(`PASS grocery share: ${total} items, scopes, WhatsApp/Facebook/Web Share/copy, PDF/TXT/CSV, unchanged progress, mobile sheet, desktop + RTL Hebrew.`);
  ws.close(); browser.close();
} finally {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  rmSync(downloads, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
