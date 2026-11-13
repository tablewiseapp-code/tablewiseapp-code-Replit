// Browser checks for built-in catalog v1 against an ISOLATED app (started by script/recipe-catalog-db.sh).
// Throwaway Chrome profile; desktop + mobile; one representative recipe per category. Never point at production.
// Usage: BASE_URL=http://127.0.0.1:5077 node script/test-recipe-catalog-browser.mjs   (Node 22+, CHROME_PATH optional)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5077";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error("Browser checks only run against a local isolated app.");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const catalog = JSON.parse(readFileSync("data/catalog/tablewise-recipes-v1.json", "utf8")).recipes;
const samples = ["Dinner", "Lunch", "Breakfast", "Dessert", "Snack", "Soup"].map(c => catalog.find(r => r.category === c));
const profile = mkdtempSync(join(tmpdir(), "tw-catalog-"));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const exceptions = []; const failedRequests = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === "Network.loadingFailed" && !d.params.canceled) failedRequests.push(d.params.errorText);
    if (d.method === "Network.responseReceived" && d.params.response.status >= 400) failedRequests.push(`${d.params.response.status} ${d.params.response.url}`);
    waiting[d.id]?.(d);
  };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 150; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}; page: ${String(await ev("document.body.innerText")).slice(0, 300).replace(/\n/g, " | ")}`); };
  const go = async path => { await call("Page.navigate", { url: BASE + path }); await sleep(300); };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  await call("Runtime.enable"); await call("Page.enable"); await call("Network.enable");

  for (const [label, metrics] of [["desktop", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }], ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }]]) {
    await call("Emulation.setDeviceMetricsOverride", metrics);
    const noOverflow = async where => ok(await ev("document.documentElement.scrollWidth <= window.innerWidth + 1"), `${label} ${where}: horizontal overflow`);
    const noBrokenImages = async where => ok(await ev("[...document.images].every(i => !i.complete || i.naturalWidth > 0)"), `${label} ${where}: broken image`);

    await go("/recipes");
    await until(`document.querySelectorAll('[data-testid^="card-recipe-tablewise:catalog:v1:"]').length === ${catalog.length}`, `${label} recipe list shows all catalog cards`);
    checks++;
    for (const r of samples) ok(await ev(`${q(`card-recipe-${r.id}`)}?.textContent.includes(${JSON.stringify(r.title)})`), `${label} card for ${r.title}`);
    await noOverflow("/recipes"); await noBrokenImages("/recipes");

    for (const r of samples) {
      await go(`/recipe/${r.id}`);
      await until(`${q("text-recipe-title")}?.textContent === ${JSON.stringify(r.title)}`, `${label} detail ${r.title}`);
      ok(await ev(`document.querySelectorAll('[data-testid^="text-ingredient-"]').length`) === r.ingredients.length, `${label} ${r.slug}: ingredient count`);
      ok(await ev(`${q("text-ingredient-0")}.textContent.includes(${JSON.stringify(r.ingredients[0].split(",")[0].replace(/^[\d.]+\s/, ""))})`), `${label} ${r.slug}: first ingredient text`);
      ok(await ev(`document.querySelectorAll('[data-testid^="text-step-"]').length`) === r.steps.length, `${label} ${r.slug}: step count`);
      ok(await ev(`${q("text-step-0")}.textContent.includes(${JSON.stringify(r.steps[0].slice(0, 40))})`), `${label} ${r.slug}: first step text`);
      ok(await ev(`${q("text-prep-time")}?.textContent.includes("${r.prepTime}") && ${q("text-cook-time")}?.textContent.includes("${r.cookTime}")`), `${label} ${r.slug}: prep/cook time`);
      ok(await ev(`!!${q("img-recipe-placeholder")}`), `${label} ${r.slug}: no-image fallback`);
      ok(await ev(`!!${q(`tag-${r.category}`)}`), `${label} ${r.slug}: category tag`);
      if (await ev(`!!${q("button-servings-increase")}`)) {
        const before = await ev(`${q("text-ingredient-0")}.textContent`);
        await ev(`${q("button-servings-increase")}.click()`);
        await until(`${q("text-ingredient-0")}.textContent !== ${JSON.stringify(before)}`, `${label} ${r.slug}: servings scale ingredients`);
        ok(await ev(`[...document.querySelectorAll('[data-testid="text-servings"]')].some(e => e.textContent.includes("${Number(r.servings) + 1}"))`), `${label} ${r.slug}: servings value`);
      } else ok(false, `${label} ${r.slug}: servings control missing`);
      await noOverflow(r.slug); await noBrokenImages(r.slug);
    }

    // Meals planner: catalog recipes appear and the existing meal-type filter places them by category.
    await go("/meals");
    // Weekly Meals is paginated (12 per page): the catalog shows up in the match count, not necessarily on page 1.
    await until(`Number(document.querySelector('[data-testid="count-matching"]')?.dataset.count) >= ${catalog.length}`, `${label} planner counts the catalog recipes`);
    ok(await ev(`document.querySelectorAll('[data-testid^="recipe-card-"]').length`) <= 12, `${label} planner shows one page of results`);
    await noOverflow("/meals");
  }
  ok(exceptions.length === 0, `uncaught page errors: ${exceptions.join(" | ")}`);
  ok(failedRequests.length === 0, `failed requests: ${failedRequests.join(" | ")}`);
  console.log(`PASS browser: ${checks} checks; desktop+mobile; /recipes (200 cards), 6 detail pages (one per category), servings scaling, /meals; 0 page errors, 0 failed requests, 0 broken images`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
