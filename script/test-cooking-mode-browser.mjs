// Browser test for Cooking Mode against the running app (read-only: only touches this throwaway Chrome profile).
// Usage: node script/test-cooking-mode-browser.mjs   (BASE_URL, CHROME_PATH, RECIPE_ID optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ID = process.env.RECIPE_ID ?? "tablewise:real:v1:chicken-curry";
const profile = mkdtempSync(join(tmpdir(), "tw-cooking-"));
const port = 9400 + Math.floor(Math.random() * 400);
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
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const click = id => ev(`${el(id)}.click()`);
  const until = async (expr, what) => { for (let i = 0; i < 40; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const label = () => ev(`${el("cooking-step-label")}.textContent`);
  const open = async () => { await call("Page.navigate", { url: `${BASE}/recipe/${encodeURIComponent(ID)}` }); await until(`Boolean(${el("button-start-cooking")})`, "recipe page"); };

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  await ev("localStorage.clear(); sessionStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await open();
  const total = await ev("document.querySelectorAll('[data-testid^=\"text-step-\"]').length");
  assert.ok(total >= 3, "needs a recipe with several steps");

  // Servings chosen in the viewer reach Cooking Mode.
  await click("button-servings-decrease"); await click("button-servings-decrease");
  await click("button-start-cooking"); await until(`Boolean(${el("cooking-mode")})`, "cooking opens");
  assert.equal(await ev(`${el("cooking-title")}.textContent`), await ev(`${el("text-recipe-title")}.textContent`));
  assert.equal(await label(), `Step 1 of ${total}`);
  assert.equal(await ev(`${el("cooking-prev")}.disabled`), true, "first step: no previous");
  assert.equal(await ev(`${el("cooking-mode")}.dataset.zen`), "false", "Standard mode by default");
  assert.equal(await ev(`document.querySelectorAll('[data-testid^="cooking-step-"][data-active]').length`), total, "all steps visible");
  assert.equal(await ev(`${el("cooking-step-0")}.getAttribute('aria-current')`), "step");
  assert.match(await ev(`${el("cooking-ingredients")}.textContent`), /2 servings/);
  assert.match(await ev(`${el("cooking-ingredients")}.textContent`), /200 g canned chopped tomatoes/, "scaled quantities");
  assert.equal(await ev("document.body.textContent.includes('Time unspecified')"), false);
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll (standard)");

  // Next / click-to-activate / previous.
  await click("cooking-next"); assert.equal(await label(), `Step 2 of ${total}`);
  assert.equal(await ev(`${el("cooking-step-1")}.getAttribute('aria-current')`), "step");
  await ev(`${el("cooking-step-2")}.querySelector('button').click()`); assert.equal(await label(), `Step 3 of ${total}`);
  await click("cooking-prev"); assert.equal(await label(), `Step 2 of ${total}`);
  assert.equal(await ev(`${el("cooking-progress")}.getAttribute('aria-valuenow')`), "2");

  // Zen: only the current step; step preserved both ways.
  await click("cooking-zen-toggle");
  assert.equal(await ev(`${el("cooking-mode")}.dataset.zen`), "true");
  assert.equal(await ev(`${el("cooking-zen-toggle")}.getAttribute('aria-checked')`), "true");
  assert.equal(await label(), `Step 2 of ${total}`);
  assert.equal(await ev(`Boolean(${el("cooking-steps")}) || Boolean(${el("cooking-ingredients")})`), false, "other steps hidden");
  const zenText = await ev(`${el("cooking-current-text")}.textContent`);
  assert.equal(zenText, (await ev(`document.querySelectorAll('[data-testid^="text-step-"] p')[1].textContent`)));
  assert.ok(await ev("parseFloat(getComputedStyle(document.querySelector('[data-testid=\"cooking-current-text\"]')).fontSize) >= 24"), "large type");
  for (const id of ["cooking-prev", "cooking-exit", "cooking-progress", "cooking-zen-toggle"]) assert.equal(await ev(`Boolean(${el(id)})`), true, `${id} stays visible in Zen`);
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll (zen)");
  await click("cooking-next"); assert.equal(await label(), `Step 3 of ${total}`);
  await click("cooking-zen-toggle");
  assert.equal(await label(), `Step 3 of ${total}`, "leaving Zen keeps the step");
  assert.equal(await ev(`${el("cooking-step-2")}.getAttribute('aria-current')`), "step");

  // Exit and reopen keeps progress; Zen preference persists.
  await click("cooking-zen-toggle");
  await click("cooking-exit"); await until(`!${el("cooking-mode")}`, "exit");
  assert.match(await ev(`${el("button-start-cooking")}.textContent`), /Resume/);
  await click("button-start-cooking"); await until(`Boolean(${el("cooking-mode")})`, "reopen");
  assert.equal(await label(), `Step 3 of ${total}`, "progress preserved");
  assert.equal(await ev(`${el("cooking-mode")}.dataset.zen`), "true", "Zen preference preserved");
  await ev("document.querySelector('[data-testid=\"cooking-mode\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await until(`!${el("cooking-mode")}`, "Escape exits");
  await open(); await click("button-start-cooking"); await until(`Boolean(${el("cooking-mode")})`, "reload reopen");
  assert.equal(await label(), `Step 3 of ${total}`, "progress survives a reload in the same session");

  // Step timer: only where a duration is stated, set to its minimum, user-started, persists across exit/reopen.
  if ((await ev(`${el("cooking-mode")}.dataset.zen`)) === "true") await click("cooking-zen-toggle"); // Zen preference persisted from above
  const timerStep = await ev(`[...document.querySelectorAll('[data-testid^="text-step-"]')].findIndex(li => /\\d+\\s*[–-]\\s*\\d+\\s*minutes/.test(li.textContent))`);
  const plainStep = await ev(`[...document.querySelectorAll('[data-testid^="text-step-"]')].findIndex(li => !li.querySelector('[data-testid="step-duration"]'))`);
  const stated = await ev(`document.querySelectorAll('[data-testid^="text-step-"]')[${timerStep}].querySelector('p').textContent.match(/(\\d+)\\s*[–-]\\s*(\\d+)\\s*minutes/)[1]`);
  const startLabel = id => ev(`${el(id)}.querySelector('button')?.textContent`);
  await ev(`${el(`cooking-step-${timerStep}`)}.querySelector('button').click()`);
  await until(`Boolean(${el(`step-timer-${timerStep}`)})`, "timer shown on a timed step");
  assert.equal(await ev(`${el(`step-timer-${timerStep}`)}.dataset.state`), "idle", "never auto-starts");
  assert.equal(await ev(`${el(`step-timer-clock-${timerStep}`)}.textContent`), `${String(stated).padStart(2, "0")}:00`, "set to the minimum of the range");
  assert.match(await ev(`${el("timer-start")}.textContent`), new RegExp(`Start timer · ${String(stated).padStart(2, "0")}:00`));
  if (plainStep >= 0) { await ev(`${el(`cooking-step-${plainStep}`)}.querySelector('button').click()`); assert.equal(await ev(`Boolean(${el(`step-timer-${plainStep}`)})`), false, "no timer without a stated duration"); await ev(`${el(`cooking-step-${timerStep}`)}.querySelector('button').click()`); }
  await click("timer-start"); await sleep(1300);
  assert.equal(await ev(`${el(`step-timer-${timerStep}`)}.dataset.state`), "running");
  const running = await ev(`${el(`step-timer-clock-${timerStep}`)}.textContent`); assert.notEqual(running, `${String(stated).padStart(2, "0")}:00`, "counts down");
  await click("timer-pause"); const frozen = await ev(`${el(`step-timer-clock-${timerStep}`)}.textContent`); await sleep(1300);
  assert.equal(await ev(`${el(`step-timer-clock-${timerStep}`)}.textContent`), frozen, "pause freezes the clock");
  await click("timer-resume");
  await click("cooking-zen-toggle"); assert.equal(await ev(`Boolean(${el(`step-timer-${timerStep}`)})`), true, "timer shown in Zen"); await click("cooking-zen-toggle");
  await click("cooking-exit"); await until(`!${el("cooking-mode")}`, "exit with timer");
  await click("button-start-cooking"); await until(`Boolean(${el("cooking-mode")})`, "reopen with timer");
  assert.ok(["running", "paused"].includes(await ev(`${el(`step-timer-${timerStep}`)}.dataset.state`)), "timer survives exit/reopen");
  await click("timer-reset"); assert.equal(await ev(`${el(`step-timer-${timerStep}`)}.dataset.state`), "idle");
  await ev(`sessionStorage.setItem(${JSON.stringify(`tablewise:cooking-timers:v1:${ID}`)}, JSON.stringify({${timerStep}:{remaining:5,endsAt:Date.now()-1000}}))`);
  await click("cooking-exit"); await click("button-start-cooking"); await until(`Boolean(${el("cooking-mode")})`, "reopen expired");
  await until(`Boolean(${el("timer-done")})`, "expired timer announces completion");
  assert.equal(await ev(`${el("timer-done")}.getAttribute('role')`), "alert");
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll with timer");
  await click("timer-reset");

  await ev(`${el("cooking-step-2")}.querySelector('button').click()`); // back to step 3 for the restart checks
  // Restart needs a second tap; last step shows Finish; Finish clears progress.
  await click("cooking-restart"); assert.equal(await label(), `Step 3 of ${total}`, "first tap only asks to confirm");
  await click("cooking-restart"); assert.equal(await label(), `Step 1 of ${total}`);
  for (let i = 1; i < total; i++) await click("cooking-next");
  assert.equal(await label(), `Step ${total} of ${total}`);
  assert.equal(await ev(`Boolean(${el("cooking-next")})`), false, "no Next on the last step");
  await click("cooking-finish"); await until(`!${el("cooking-mode")}`, "finish closes");
  assert.equal(await ev(`sessionStorage.getItem(${JSON.stringify(`tablewise:cooking:v1:${ID}`)})`), null, "Finish clears progress");
  assert.match(await ev(`${el("button-start-cooking")}.textContent`), /Start cooking/);
  console.log("PASS cooking mode browser: start/exit, standard/zen with step kept, prev/next/click boundaries, progress + Zen preference preserved across exit and reload, restart confirm, finish clears, servings/title/scaled ingredients, no 'Time unspecified', no horizontal scroll at 390px.");
} finally {
  chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
