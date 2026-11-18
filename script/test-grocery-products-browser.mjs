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
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1')" }); // skip the first-visit sign-in screen
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
  // Edit an existing row after creation, without changing its checked state.
  const row = key => `document.querySelector('[data-testid=' + CSS.escape(${JSON.stringify("grocery-item-" + key)}) + ']')`;
  const choosePhoto = async (key, color = 'purple', invalid = false) => ev(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = ${JSON.stringify(color)}; ctx.fillRect(0,0,900,600);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(${invalid ? "new File(['bad'], 'bad.svg', {type:'image/svg+xml'})" : "new File([blob], 'later.png', {type:'image/png'})"});
    const input = ${row(key)}.querySelector('[data-testid=input-existing-item-photo]');
    input.files = transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const openPictureMenu = async key => {
    await ev(`${row(key)}.querySelector('[data-testid=button-item-picture-menu]').focus()`);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", windowsVirtualKeyCode: 13 });
    await until("Boolean(document.querySelector('[data-testid=menu-item-picture-upload]'))", "picture menu opens with keyboard");
  };
  await ev(`${row('toothbrush')}.querySelector('input[type=checkbox]').click()`);
  await choosePhoto('toothbrush');
  await until(`Boolean(${row('toothbrush')}.querySelector('img'))`, "add picture after creating item");
  assert.equal(await ev(`${row('toothbrush')}.querySelector('input[type=checkbox]').checked`), true, "picture edit preserves checked state");
  await call("Page.reload");
  await until(`Boolean(${row('toothbrush')}?.querySelector('img'))`, "later picture survives reload");
  // Completed categories can be expanded to edit their checked rows.
  await ev(`${row('toothbrush')}.closest('section').querySelector('[aria-expanded=false]')?.click()`);
  const firstPhoto = await ev(`${row('toothbrush')}.querySelector('img').src`);
  await choosePhoto('toothbrush', 'blue');
  await until(`${row('toothbrush')}.querySelector('img').src !== ${JSON.stringify(firstPhoto)}`, "change picture");
  const changedPhoto = await ev(`${row('toothbrush')}.querySelector('img').src`);
  await choosePhoto('toothbrush', 'blue', true);
  await until(`Boolean(${row('toothbrush')}.querySelector('[role=alert]'))`, "invalid picture error");
  assert.equal(await ev(`${row('toothbrush')}.querySelector('img').src`), changedPhoto, "invalid file preserves picture");
  // A failed save retains the resized image for retry.
  await ev(`window.realPhotoFetch = window.fetch; window.fetch = (...args) => {
    if (args[0] === '/api/grocery-item-photos' && args[1]?.method === 'PUT') {
      window.fetch = window.realPhotoFetch;
      return Promise.resolve(new Response('{}', {status:500, headers:{'content-type':'application/json'}}));
    }
    return window.realPhotoFetch(...args);
  }`);
  await choosePhoto('toothbrush', 'orange');
  await until(`Boolean(${row('toothbrush')}.querySelector('[role=alert] button'))`, "failed save has retry");
  assert.equal(await ev(`${row('toothbrush')}.querySelector('img').src`), changedPhoto);
  await ev(`${row('toothbrush')}.querySelector('[role=alert] button').click()`);
  await until(`${row('toothbrush')}.querySelector('img').src !== ${JSON.stringify(changedPhoto)}`, "retry saves selected picture");
  await ev(`${row('toothbrush')}.querySelector('[data-testid=button-item-picture-preview]').click()`);
  await until("Boolean(document.querySelector('[role=dialog] img'))", "larger preview");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('[role=dialog]')", "preview closes with Escape");
  assert.equal(await ev(`${row('toothbrush')}.querySelector('input[type=checkbox]').checked`), true);
  await openPictureMenu('toothbrush');
  await ev("document.querySelector('[data-testid=menu-item-picture-remove]').click()");
  await until(`!${row('toothbrush')}.querySelector('img')`, "remove picture keeps row");
  await call("Page.reload");
  await until(`Boolean(${row('toothbrush')})`, "row still exists");
  assert.equal(await ev(`Boolean(${row('toothbrush')}.querySelector('img'))`), false, "removal survives reload");
  // A recipe ingredient has the same picture controls without creating an extra.
  await ev(`(async () => {
    const recipes = await fetch('/api/recipes').then(r => r.json());
    if (!recipes.length) throw new Error('Seed a recipe before running this test.');
    localStorage.setItem('weeklyMealsState', JSON.stringify({selectedIds:[recipes[0].id], planAssignments:[]}));
  })()`);
  await call("Page.reload");
  await until("Boolean(document.querySelector('[data-testid=grocery-item-recipes]'))", "recipe ingredients");
  const recipeKey = await ev("document.querySelector('[data-testid=grocery-item-recipes]').closest('li').dataset.testid.slice('grocery-item-'.length)");
  const beforeExtras = await ev("fetch('/api/grocery-extras').then(r => r.json()).then(r => r.length)");
  await choosePhoto(recipeKey, 'red');
  await until(`Boolean(${row(recipeKey)}.querySelector('img'))`, "recipe ingredient picture");
  assert.equal(await ev("fetch('/api/grocery-extras').then(r => r.json()).then(r => r.length)"), beforeExtras);
  for (const language of ['ru', 'he']) {
    await ev(`localStorage.setItem('tablewise_language', '${language}')`);
    await call("Page.reload");
    await until(`Boolean(${row(recipeKey)}?.querySelector('img'))`, `${language} picture persists`);
    assert.equal(await ev("document.documentElement.scrollWidth > innerWidth"), false, `${language} mobile fits viewport`);
    await ev(`${row(recipeKey)}.querySelector('[data-testid=button-item-picture-preview]').click()`);
    await until("Boolean(document.querySelector('[role=dialog] img'))", `${language} preview`);
    const bounds = await ev("(() => {const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};})()");
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width, `${language} preview fits viewport`);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
    await until("!document.querySelector('[role=dialog]')", "preview dismissed");
  }
  const privacy = await fetch(`${BASE}/api/grocery-extras`).then(r => r.json());
  assert.equal(privacy.length, 0, "fresh visitor cannot read saved photo");
  await call("Page.captureScreenshot", { format: "png" }).then(async response => {
    const { writeFileSync } = await import('node:fs'); writeFileSync('/tmp/tw-grocery-preview.png', Buffer.from(response.result.data,'base64'));
  });
  console.log("grocery products browser: autocomplete, photos at creation/later, replace/remove/reload, checked state, retry, preview, recipe ingredients, privacy and multilingual mobile layout ok");
  ws.close();
} finally { chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
