// Shared app navigation in a real browser (throwaway Chrome profile; reads recipes only, plan lives in that profile).
// Usage: node script/test-app-nav-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-nav-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 60; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready ?? `Boolean(${q("app-nav-header")})`, path); };
  const size = (width, mobile) => call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile });
  const hrefs = sel => ev(`Array.from(document.querySelectorAll('${sel}')).map(a => a.getAttribute("href"))`);
  const labels = sel => ev(`Array.from(document.querySelectorAll('${sel}')).map(a => a.textContent.trim())`);
  const current = sel => ev(`document.querySelector('${sel} [aria-current="page"]')?.getAttribute("href") ?? null`);
  const ORDER = ["/recipes", "/meals", "/grocery-list", "/my-ideas"];
  await call("Runtime.enable");

  // ---- Desktop
  await size(1280, false);
  await go("/");
  await ev("localStorage.clear(); sessionStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await go("/recipes", `document.querySelectorAll('[data-testid^="card-recipe-"]').length > 0`);
  eq(await hrefs('[data-testid="app-nav"] a'), ORDER, "desktop order");
  eq(await labels('[data-testid="app-nav"] a'), ["Recipes", "Week", "Groceries", "Ideas"], "desktop labels");
  ok(await ev(`!document.body.innerText.includes("Import Recipe") && !document.querySelector('[data-testid="app-nav-header"] a[href="/recipe-view"], [data-testid="app-nav-header"] a[href="/import"]')`), "no Import/Recipe View in nav");
  ok(await ev(`${q("app-nav-link-settings")}.getBoundingClientRect().left > ${q("app-nav-link-my-ideas")}.getBoundingClientRect().right + 100`), "Settings separate, right-aligned");
  ok(await ev(`getComputedStyle(${q("app-nav-bottom")}).display === "none"`), "no bottom nav on desktop");

  // Every destination opens its screen and is marked current.
  const screens = { "/recipes": "text-page-title", "/meals": "weekly-meals-header", "/grocery-list": null, "/my-ideas": "text-page-title", "/settings": "text-page-title" };
  for (const [path, ready] of Object.entries(screens)) {
    await ev(`document.querySelector('[data-testid="app-nav-header"] a[href="${path}"]').click()`);
    await until(`location.pathname === "${path}" && ${ready ? `Boolean(${q(ready)})` : `Boolean(document.querySelector(".grocery-page, [data-testid='mvp-grocery']"))`}`, `open ${path}`);
    eq(await current('[data-testid="app-nav-header"]'), path, `${path} active`);
    eq(await ev(`document.querySelectorAll('[data-testid="app-nav-header"] [aria-current="page"]').length`), 1, `${path}: one current item`);
  }

  // Back/forward through client-side navigation.
  await ev("history.back()"); await until(`location.pathname === "/my-ideas"`, "back");
  eq(await current('[data-testid="app-nav-header"]'), "/my-ideas", "active after back");
  await ev("history.forward()"); await until(`location.pathname === "/settings"`, "forward");

  // Add recipe → import; Recipes stays active there and on recipe details.
  await go("/recipes", `Boolean(${q("link-add-recipe")}) && document.querySelectorAll('[data-testid^="card-recipe-"]').length > 0`);
  ok((await ev(`${q("link-add-recipe")}.textContent.trim()`)) === "Add recipe", "Add recipe label");
  await ev(`${q("link-add-recipe")}.click()`); await until(`location.pathname === "/import"`, "import");
  eq(await current('[data-testid="app-nav-header"]'), "/recipes", "Recipes active on import");
  await ev("history.back()"); await until(`document.querySelectorAll('[data-testid^="card-recipe-"]').length > 0`, "back to recipes");
  const cardHref = await ev(`document.querySelector('[data-testid^="card-recipe-"]').getAttribute("href")`);
  await ev(`document.querySelector('[data-testid^="card-recipe-"]').click()`);
  await until(`location.pathname === ${JSON.stringify(cardHref)} && Boolean(${q("text-recipe-title")})`, "saved recipe opens");
  eq(await current('[data-testid="app-nav-header"]'), "/recipes", "Recipes active on detail");
  await go(`${cardHref}?week=2026-11-09`, `Boolean(${q("text-recipe-title")})`);
  eq(await current('[data-testid="app-nav-header"]'), "/meals", "Week active on recipe opened from planner");
  await go("/recipe-view", `location.pathname.startsWith("/recipe/") && Boolean(${q("text-recipe-title")})`);
  eq(await current('[data-testid="app-nav-header"]'), "/recipes", "/recipe-view still works, Recipes active");

  // Keyboard: Tab reaches the nav in order with a visible focus ring.
  await go("/settings", `Boolean(${q("text-page-title")})`);
  await ev("document.activeElement?.blur(); window.focus()");
  const tab = async () => { await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); };
  const seen = [];
  for (let i = 0; i < 7; i++) { await tab(); seen.push(await ev(`document.activeElement.getAttribute("href") ?? document.activeElement.dataset.testid`)); }
  eq(seen.slice(0, 7), ["/", ...ORDER, "/settings", "button-language-selector"], "tab order");
  ok(await ev(`(s => s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2)(getComputedStyle(document.activeElement))`), "visible focus ring");

  // ---- Mobile
  await size(390, true);
  await go("/recipes", `document.querySelectorAll('[data-testid^="card-recipe-"]').length > 0`);
  eq(await hrefs('[data-testid="app-nav-bottom"] a'), ORDER, "mobile order");
  eq(await labels('[data-testid="app-nav-bottom"] a'), ["Recipes", "Week", "Groceries", "Ideas"], "mobile labels");
  ok(await ev(`getComputedStyle(${q("app-nav")}).display === "none"`), "desktop links hidden on mobile");
  ok(await ev(`Array.from(document.querySelectorAll('[data-testid="app-nav-bottom"] a, [data-testid="app-nav-header"] a, [data-testid="app-nav-header"] button')).filter(e => e.offsetParent).every(e => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })`), "touch targets ≥ 44px");
  const sel = `document.querySelector('[data-testid="app-nav-bottom"] [aria-current="page"]')`;
  ok(await ev(`(s => Number(s.fontWeight) >= 600)(getComputedStyle(${sel})) && getComputedStyle(${sel}, "::before").height === "3px"`), "selected state not color-only");
  await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(200);
  ok(await ev(`(() => { const cards = document.querySelectorAll('[data-testid^="card-recipe-"]'); return cards[cards.length - 1].getBoundingClientRect().bottom <= ${q("app-nav-bottom")}.getBoundingClientRect().top; })()`), "last recipe not covered");
  ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal scroll");
  await ev(`${q("app-nav-menu-trigger")}.click()`); await until(`Boolean(document.querySelector('[role="dialog"]'))`, "menu");
  eq(await hrefs('[role="dialog"] a'), ["/settings"], "Settings in header menu");
  await ev(`document.querySelector('[role="dialog"] a').click()`);
  await until(`location.pathname === "/settings" && !document.querySelector('[role="dialog"]')`, "settings from menu");
  eq(await current('[data-testid="app-nav-bottom"]'), null, "no bottom item current on Settings");

  // Week: plan's sticky action bar sits above the bottom nav.
  await ev(`${q("app-nav-bottom-link-meals")}.click()`);
  await until(`document.querySelectorAll('[data-testid^="button-add-"]').length > 0`, "meals");
  eq(await current('[data-testid="app-nav-bottom"]'), "/meals", "Week active during selection");
  await ev(`document.querySelector('[data-testid^="button-add-"]').click()`);
  await until(`!${q("button-generate-plan")}.disabled`, "selected");
  await ev(`${q("button-generate-plan")}.click()`); await until(`Boolean(${q("button-create-grocery-list")})`, "plan view");
  eq(await current('[data-testid="app-nav-bottom"]'), "/meals", "Week active during planning");
  const bar = `${q("button-create-grocery-list")}.parentElement`;
  ok(await ev(`${bar}.getBoundingClientRect().bottom <= ${q("app-nav-bottom")}.getBoundingClientRect().top + 0.5`), "sticky plan actions above bottom nav");

  // Cooking Mode hides navigation; leaving restores it.
  await go(cardHref, `Boolean(${q("button-start-cooking")})`);
  await ev(`${q("button-start-cooking")}.click()`); await until(`Boolean(${q("cooking-mode")})`, "cooking");
  ok(await ev(`getComputedStyle(${q("app-nav-bottom")}).display === "none" && getComputedStyle(${q("app-nav-header")}).display === "none"`), "nav hidden in Cooking Mode");
  await ev(`${q("cooking-exit")}.click()`); await until(`!${q("cooking-mode")}`, "exit cooking");
  ok(await ev(`getComputedStyle(${q("app-nav-bottom")}).display !== "none"`), "nav back after Cooking Mode");

  eq(errors, [], "no page errors");
  console.log(`PASS app navigation browser: ${checks} checks — order/labels desktop+mobile, destinations, active states (nested/planner/import/detail), Add recipe, /recipe-view, back/forward, keyboard + focus ring, 44px targets, non-color selected state, no overlap incl. sticky plan bar, Cooking Mode hides nav`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
