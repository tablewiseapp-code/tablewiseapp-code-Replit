// Browser test for My Cooking Experience against the running app. The throwaway Chrome profile is a fresh private
// owner, so it never sees anyone else's history; every session it creates is deleted again at the end.
// Usage: node script/test-cooking-experience-browser.mjs   (BASE_URL, CHROME_PATH, RECIPE_ID optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ID = process.env.RECIPE_ID ?? "tablewise:real:v1:chicken-curry";
const profile = mkdtempSync(join(tmpdir(), "tw-made-it-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ev;
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const el = (id, scope = "document") => `${scope}.querySelector('[data-testid="${id}"]')`;
  const latest = el("cooking-session-latest");
  const click = (id, scope) => ev(`${el(id, scope)}.click()`);
  const until = async (expr, what) => { for (let i = 0; i < 60; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what} — section: ${await ev(`${el("my-cooking-experience")}?.innerHTML.split("My Photos")[1]?.slice(0, 1500)`)}`); };
  const history = () => ev(`fetch('/api/cooking-sessions?recipeId=${encodeURIComponent(ID)}').then(r => r.json())`);
  const open = async () => {
    await call("Page.navigate", { url: `${BASE}/recipe/${encodeURIComponent(ID)}` });
    await until(`Boolean(${el("button-made-it")} || ${el("text-cooked-count")})`, "cooking section");
  };

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  await ev("localStorage.clear(); sessionStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await open();

  // First time: "Made it?", nothing recorded, no header indicator.
  const section = `${el("my-cooking-experience")}.textContent`;
  assert.match(await ev(section), /Made it\?.*How did it turn out\?.*I made it! ✓/);
  assert.equal(await ev(`Boolean(${el("badge-cooked")})`), false);
  assert.ok(await ev(`document.querySelector('[data-testid="text-steps-heading"]').compareDocumentPosition(${el("my-cooking-experience")}) & Node.DOCUMENT_POSITION_FOLLOWING`), "after instructions");

  // One click records it immediately; a double tap does not duplicate.
  await ev(`${el("button-made-it")}.click(); ${el("button-made-it")}?.click()`);
  await until(`Boolean(${el("cooking-celebration")})`, "celebration");
  assert.match(await ev(`${el("cooking-celebration")}.textContent`), /You made it! 🎉/);
  assert.equal((await history()).length, 1, "exactly one session");
  assert.equal(await ev(`${el("badge-cooked")}.textContent`), "Made ×1");

  // Undo removes it again.
  await click("button-undo-cooked");
  await until(`Boolean(${el("button-made-it")})`, "undo");
  assert.equal((await history()).length, 0);
  assert.equal(await ev(`Boolean(${el("badge-cooked")})`), false);

  // Record, rate, take notes, add a photo — no Save buttons anywhere.
  await click("button-made-it"); await until(`Boolean(${latest})`, "recorded");
  await click("button-rate-4", latest);
  await ev(`(() => { const t = ${el("input-cooking-notes", latest)}; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Less salt.\\nMore lime.'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until(`${el("notes-status", latest)}.textContent === 'Saved'`, "notes autosaved");
  // A real 2000×1500 PNG from the page itself, delivered through the file input.
  await ev(`(async () => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1500;
    const g = c.getContext('2d'); g.fillStyle = '#c8553d'; g.fillRect(0, 0, 2000, 1500); g.fillStyle = '#f2c14e'; g.fillRect(400, 300, 900, 700);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const input = ${el("input-cooking-photo", latest)}; const dt = new DataTransfer();
    dt.items.add(new File([blob], 'dinner.png', { type: 'image/png' })); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await until(`${latest}.querySelectorAll('[data-testid="cooking-photos"] img').length === 1`, "photo uploaded");
  // Thumbnails are lazy-loaded: bring it on screen first.
  await ev(`${latest}.querySelector('[data-testid="cooking-photos"] img').scrollIntoView()`);
  await until(`(i => i.complete && i.naturalWidth > 0)(${latest}.querySelector('[data-testid="cooking-photos"] img'))`, "thumbnail loaded");
  const thumb = await ev(`(() => { const i = ${latest}.querySelector('[data-testid="cooking-photos"] img'); return [i.naturalWidth, i.naturalHeight]; })()`);
  assert.deepEqual(thumb, [400, 300], "thumbnail resized, aspect kept");
  const [stored] = await history();
  assert.deepEqual([stored.rating, stored.notes, stored.photoIds.length], [4, "Less salt.\nMore lime.", 1]);

  // Everything persists after refresh.
  await open();
  assert.equal(await ev(`${el("text-cooked-count")}.textContent`), "You've made this once!");
  const today = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date());
  assert.equal(await ev(`${el("text-last-cooked")}.textContent`), `Last cooked: ${today}`);
  assert.equal(await ev(`${el("input-cooking-notes", latest)}.value`), "Less salt.\nMore lime.");
  assert.deepEqual(await ev(`[4, 5].map(n => ${latest}.querySelector('[data-testid="button-rate-' + n + '"]').className.includes('fill-yellow-400'))`), [true, false]);
  assert.equal(await ev(`${el("badge-cooked")}.textContent`), "Made ×1");

  // Change the rating; it persists.
  await click("button-rate-5", latest);
  await until(`fetch('/api/cooking-sessions?recipeId=${encodeURIComponent(ID)}').then(r => r.json()).then(s => s[0].rating === 5)`, "rating changed");

  // Larger preview, then delete with confirmation.
  await ev(`${latest}.querySelector('[data-testid^="button-photo-"]').click()`);
  await until(`${el("img-photo-preview")}?.complete && ${el("img-photo-preview")}.naturalWidth > 0`, "preview");
  assert.equal(await ev(`${el("img-photo-preview")}.naturalWidth`), 1600, "stored photo capped at 1600px");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until(`!${el("img-photo-preview")}`, "preview closed");
  await ev(`${latest}.querySelector('[data-testid^="button-delete-photo-"]').click()`);
  await until(`Boolean(${el("button-confirm-delete-photo")})`, "confirm dialog");
  assert.equal((await history())[0].photoIds.length, 1, "nothing deleted before confirming");
  await click("button-confirm-delete-photo");
  await until(`!${latest}.querySelector('[data-testid="cooking-photos"]')`, "photo deleted");
  assert.equal((await history())[0].photoIds.length, 0);

  // Cooking again: an independent second session, accurate count, earlier session still editable.
  await click("button-made-again");
  await until(`${el("badge-cooked")}?.textContent === 'Made ×2'`, "second session");
  const [newest, earlier] = await history();
  assert.deepEqual([newest.rating, newest.notes, earlier.rating, earlier.notes], [null, null, 5, "Less salt.\nMore lime."]);
  await open();
  assert.equal(await ev(`${el("text-cooked-count")}.textContent`), "You've made this 2 times!");
  assert.equal(await ev(`document.querySelectorAll('[data-testid^="cooking-session-"]:not([data-testid="cooking-session-latest"])').length`), 1, "earlier times list");
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll on mobile");

  // Desktop layout also fits.
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll on desktop");
  console.log("cooking experience browser: all checks passed");
} finally {
  // Remove everything this throwaway owner recorded.
  await ev?.(`fetch('/api/cooking-sessions?recipeId=${encodeURIComponent(ID)}').then(r => r.json())
    .then(s => Promise.all(s.map(x => fetch('/api/cooking-sessions/' + x.id, { method: 'DELETE' }))))`).catch(() => {});
  chrome.kill(); await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
