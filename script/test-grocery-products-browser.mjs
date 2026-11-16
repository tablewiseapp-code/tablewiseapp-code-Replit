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
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  if (!tabs) throw new Error("Chrome could not start. Check browser sandbox and socket permissions.");
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (!r) return undefined; /* page navigating */ if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what}; page says: ${String(await ev('document.body.innerText')).slice(0, 200).replace(/\n/g, ' | ')}`); };

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: `${BASE}/grocery-list` });
  await until("Boolean(document.querySelector('[data-testid=button-add-item]'))", "add control");
  await ev("document.querySelector('[data-testid=button-add-item]').click()");
  await until("Boolean(document.querySelector('[role=combobox]'))", "form");
  const type = async text => {
    await ev("document.querySelector('[role=combobox]').focus()");
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await call("Input.insertText", { text });
  };
  await type("tooth brush");
  await until("document.querySelector('[role=option]')?.textContent === 'Toothbrush'", "alias matches canonical product");
  for (const key of ["ArrowDown", "Enter"]) await call("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: key === "Enter" ? 13 : 40 });
  assert.equal(await ev("document.querySelector('[role=combobox]').value"), "Toothbrush");
  await ev("document.querySelector('[data-testid=button-add-item-submit]').click()");
  await until("Boolean(document.querySelector('[data-testid=\"grocery-item-toothbrush\"]'))", "suggested product saved");
  await type("My custom product");
  await ev(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'green'; ctx.fillRect(0,0,800,600);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'test.png', {type:'image/png'}));
    const input = document.querySelector('[data-testid=input-item-photo]'); input.files = transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await until("Boolean(document.querySelector('.grocery-photo-controls img'))", "preview");
  assert.equal(await ev("document.querySelector('.grocery-photo-controls img').naturalWidth"), 640);
  await ev("document.querySelector('[data-testid=button-add-item-submit]').click()");
  await until("Boolean(document.querySelector('[data-testid=\"grocery-item-my custom product\"] img'))", "photo saved");
  await call("Page.reload");
  await until("Boolean(document.querySelector('[data-testid=\"grocery-item-my custom product\"] img'))", "photo persists after reload");
  assert.equal(await ev("document.documentElement.scrollWidth > innerWidth"), false, "mobile fits viewport");
  const privacy = await fetch(`${BASE}/api/grocery-extras`).then(r => r.json());
  assert.equal(privacy.length, 0, "fresh visitor cannot read saved photo");
  await call("Page.captureScreenshot", { format: "png" }).then(async response => {
    const { writeFileSync } = await import('node:fs'); writeFileSync('/tmp/tw-grocery-preview.png', Buffer.from(response.result.data,'base64'));
  });
  console.log("grocery products browser: aliases, keyboard selection, custom item, photo resize/save/reload, privacy and mobile layout ok");
  ws.close();
} finally { chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
