// Every main screen in English, Russian and Hebrew (throwaway Chrome profile, guest, answered household).
// Checks: <html lang/dir>, no crash screen, no page exceptions, no raw i18n keys, no sideways scroll on a phone,
// and in ru/he no interface text left in English (recipe content, brand and store names are allowed).
// Usage: node script/test-i18n-browser.mjs   (BASE_URL, CHROME_PATH optional; I18N_REPORT_ONLY=1 lists English text without failing; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-i18n-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const crashed = [...readFileSync("client/src/lib/i18n.tsx", "utf8").matchAll(/"app\.crashed": "([^"]+)"/g)].map(m => m[1]);
assert.equal(crashed.length, 3, "crash text in three languages");

// Visible text with Latin words and no Cyrillic/Hebrew, outside recipe content and names.
const SCAN = `(() => {
  const skip = el => el.closest('[translate="no"], [data-testid*="recipe-title"], a[href^="/recipe/"], [data-testid^="card-recipe-"] h3, [data-testid*="ingredient"], [data-testid*="step"], [data-testid*="store"], [data-testid*="task-name"], code, pre, script, style, svg');
  const native = /[\\u0400-\\u04FF\\u0590-\\u05FF]/;
  const english = /[A-Za-z]{3,}/;
  const out = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode, el = n.parentElement, s = n.textContent.trim();
    if (!s || !el || skip(el) || !el.getClientRects().length) continue;
    if (english.test(s) && !native.test(s)) out.add(s.slice(0, 80));
  }
  for (const el of document.querySelectorAll("[aria-label], [placeholder], [title]")) {
    if (skip(el)) continue;
    for (const a of ["aria-label", "placeholder", "title"]) { const s = el.getAttribute(a)?.trim(); if (s && english.test(s) && !native.test(s)) out.add(a + "=" + s.slice(0, 80)); }
  }
  return [...out];
})()`;
const KEYS = `[...document.body.innerText.matchAll(/\\b[a-z]+\\.[a-z][A-Za-z]+\\b/g)].map(m => m[0]).filter(k => !/^(www|tablewise)\\./.test(k) && !/\\.(com|ca|org|jpg|png)$/.test(k))`;

const ROUTES = [
  ["/", "home-meals"], ["/recipes", "text-page-title"], ["/meals?plan", "week-status"], ["/meals?browse", null],
  ["/grocery-list", null], ["/my-ideas", "text-page-title"], ["/home-tasks", "button-add-task"], ["/settings", "text-page-title"],
  ["/household", null], ["/personalize?from=/", null], ["/import", null], ["RECIPE", "text-recipe-title"],
];
// Allowed Latin text in ru/he: brand, units, sample currency, store names. Anything else is reported.
const ALLOWED = /^(TableWise|Tablewise|CA\$[\d.,–\s-]*|\$+|[\d\s.,:–·/%+()-]*(kcal|g|mg|ml|kg|min|CAD)?|Walmart|Real Canadian Superstore|No Frills|Safeway|FreshCo|OK|AI|https?:\/\/\S+)$/;

let checks = 0; const found = {};
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Page.enable"); await call("Runtime.enable");
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}\n${await ev("location.href + ' ' + document.body.innerText.slice(0, 400)").catch(() => "")}`); };
  const recipes = await fetch(`${BASE}/api/recipes`).then(r => r.json());
  assert.ok(Array.isArray(recipes) && recipes.length, `catalog readable (${JSON.stringify(recipes).slice(0, 80)})`);

  for (const lang of (process.env.I18N_LANGS ?? "en,ru,he").split(",")) { // I18N_LANGS=he runs one
    await call("Page.navigate", { url: BASE + "/" }); await until("document.readyState === 'complete'", "blank load");
    await ev(`localStorage.clear(); localStorage.setItem('tablewise_guest_v1','1'); localStorage.setItem('tablewise_language','${lang}');
      localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped', noRestrictions: true, scheduled: true }, household: { servingsMode: 'fixed', fixedServings: 4 }, kitchen: { devices: ['Oven', 'Air fryer', 'Stovetop', 'Microwave'] } }))`);
    for (const [route, ready] of ROUTES) {
      const path = route === "RECIPE" ? `/recipe/${encodeURIComponent(recipes[0].id)}` : route;
      errors.length = 0;
      await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await call("Page.navigate", { url: BASE + path });
      await until(`document.readyState === 'complete' && Boolean(document.querySelector('${ready ? `[data-testid="${ready}"]` : "main, [data-testid=app-nav-header]"}'))`, `${lang} ${route}`);
      for (const width of [390, 1280]) { // one load per screen (the API rate limit is shared by all visitors), then resized
        const where = `${lang} ${width}px ${route}`;
        if (width > 390) await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: false });
        await sleep(600); // queries settle, layout follows the resize
        assert.equal(await ev("document.documentElement.lang"), lang, `${where}: html lang`); checks++;
        assert.equal(await ev("document.documentElement.dir"), lang === "he" ? "rtl" : "ltr", `${where}: html dir`); checks++;
        const text = await ev("document.body.innerText");
        assert.ok(!crashed.some(c => text.includes(c)), `${where}: crash screen`); checks++;
        assert.deepEqual(errors, [], `${where}: page exceptions`); checks++;
        assert.deepEqual(await ev(KEYS), [], `${where}: raw i18n keys`); checks++;
        if (width < 768) { assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), `${where}: sideways scroll (${await ev("document.documentElement.scrollWidth")}px)`); checks++; }
        if (lang !== "en") for (const s of (await ev(SCAN)).filter(s => !ALLOWED.test(s.replace(/^(aria-label|placeholder|title)=/, "")))) (found[s] ??= new Set()).add(`${lang} ${route}`);
      }
    }
  }
  const english = Object.entries(found).map(([s, w]) => `  "${s}"  ← ${[...w].join(", ")}`);
  if (english.length) console.log(`English text in ru/he:\n${english.join("\n")}`);
  if (!process.env.I18N_REPORT_ONLY) assert.equal(english.length, 0, `${english.length} English strings in ru/he`);
  console.log(`i18n browser: ${checks} checks passed (${ROUTES.length} screens × ${(process.env.I18N_LANGS ?? "en,ru,he")} × 2 widths)`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
