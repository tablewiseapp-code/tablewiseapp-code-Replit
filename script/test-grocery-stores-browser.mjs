// Store picker: Your household → Groceries → My stores, three languages, custom store, at phone width in a real browser.
// Throwaway Chrome profile = a new guest. Usage: node script/test-grocery-stores-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-stores-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const canada = ["walmart", "real-canadian-superstore", "no-frills", "safeway", "freshco"];
const israel = ["shufersal", "rami-levy", "yochananof", "victory", "osher-ad"];
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Page.enable"); await call("Runtime.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1')" });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what} at ${await ev("location.href")}`); };
  const click = id => ev(`${q(id)}.click()`);
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const rows = () => ev(`[...document.querySelectorAll('[data-testid="store-picker"] li')].map(li => li.dataset.testid.slice(6))`);
  const pressed = id => ev(`${q(id)}.getAttribute("aria-pressed") === "true"`);
  const saved = () => ev(`JSON.parse(localStorage.getItem("tablewise_basic_settings")).shopping.stores`);
  const openStores = async () => { await sleep(400); /* let the settings PUT land: on load the server copy wins */ return go("/grocery-list?stores", `Boolean(${q("my-stores-dialog")}) && Boolean(${q("store-picker")})`); };
  const fits = () => ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('[data-testid="store-picker"] li')].every(li => li.scrollWidth <= li.clientWidth + 1)`);
  const big = () => ev(`[...document.querySelectorAll('[data-testid="store-picker"] button')].every(b => b.getBoundingClientRect().height >= 44)`);
  await call("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });

  // ---- Every catalog logo is bundled and loads.
  for (const id of [...canada, ...israel]) {
    const src = { walmart: "svg", safeway: "svg", freshco: "svg", shufersal: "svg", yochananof: "svg", victory: "svg" }[id] ?? "png";
    const res = await fetch(`${BASE}/store-logos/${id}.${src}`);
    ok(res.ok && (res.headers.get("content-type") ?? "").startsWith("image/"), `logo ${id}`);
  }

  // ---- 1. English onboarding: Walmart walk-in, Safeway both, then Continue.
  await go("/", `location.pathname === "/household" && Boolean(${q("store-picker")})`);
  eq(await rows(), canada, "five English suggestions");
  await until(`[...document.querySelectorAll('[data-testid="store-picker"] img')].every(i => i.complete && i.naturalWidth > 0)`, "logos load");
  ok(await ev(`[...document.querySelectorAll('[data-testid="store-picker"] img')].every(i => i.alt === "" && getComputedStyle(i).objectFit === "contain" && i.offsetWidth === 48 && i.offsetHeight === 36)`), "48×36, contain, alt=\"\"");
  ok(await fits(), "long names and controls fit at 360px");
  ok(await big(), "44px targets");
  await click("store-walmart-walkIn");
  ok(await pressed("store-walmart-walkIn") && !(await pressed("store-walmart-delivery")), "Walmart walk-in on alone");
  eq(await ev(`${q("store-walmart-walkIn")}.getAttribute("aria-label")`), "Walmart: Walk-in", "toggle names store and method");
  await click("store-safeway-delivery"); await click("store-safeway-walkIn");
  eq(await saved(), [{ id: "walmart", methods: ["walkIn"] }, { id: "safeway", methods: ["delivery", "walkIn"] }], "saved at once");
  await click("restriction-none");
  await ev(`document.querySelector('[data-testid^="device-"]').click()`);
  await until(`!${q("button-suggest-week")}.disabled`, "catalog loaded");
  await click("button-suggest-week");
  await sleep(300); { const why = await ev(`location.pathname + " " + (${q("household-error")}?.textContent ?? "")`); if (!why.startsWith("/meals")) console.log("still:", why); }
  await until(`location.pathname === "/meals"`, "Continue opens the Week");
  eq(await saved(), [{ id: "walmart", methods: ["walkIn"] }, { id: "safeway", methods: ["delivery", "walkIn"] }], "Continue keeps the stores");
  await sleep(500);
  eq(await ev(`fetch("/api/household-settings").then(r => r.json()).then(s => s.shopping.stores)`), await saved(), "server copy");
  await openStores(); // a fresh page load = refresh
  ok(await pressed("store-walmart-walkIn") && !(await pressed("store-walmart-delivery")) && await pressed("store-safeway-delivery") && await pressed("store-safeway-walkIn"), "My stores shows the three methods after refresh");

  // ---- 2. Russian: same choices, localized, no duplicates. Hebrew: own five, RTL, earlier stores still there.
  await ev(`localStorage.setItem("tablewise_language", "ru")`);
  await openStores();
  eq(await rows(), canada, "Russian: the same five, no duplicates");
  ok(await pressed("store-walmart-walkIn") && await pressed("store-safeway-delivery"), "Russian keeps the choices");
  eq(await ev(`${q("store-walmart-walkIn")}.textContent`), "В магазине", "Russian controls");
  await ev(`localStorage.setItem("tablewise_language", "he")`);
  await openStores();
  eq(await rows(), [...israel, "walmart", "safeway"], "Hebrew: five suggestions, then the saved stores");
  await until(`[...document.querySelectorAll('[data-testid="store-picker"] img')].every(i => i.complete && i.naturalWidth > 0)`, "Hebrew logos load");
  eq(await ev(`document.documentElement.dir`), "rtl", "RTL");
  ok(await ev(`${q("store-logo-shufersal")}.getBoundingClientRect().left > ${q("store-name-shufersal")}.getBoundingClientRect().left`), "row mirrored: logo on the right");
  eq(await ev(`${q("store-safeway-delivery")}.textContent`), "משלוח", "Hebrew controls");
  ok(await fits(), "Hebrew fits at 360px");
  await click("store-safeway-delivery");
  eq(await saved(), [{ id: "walmart", methods: ["walkIn"] }, { id: "safeway", methods: ["walkIn"] }], "earlier stores stay editable");
  await ev(`localStorage.setItem("tablewise_language", "en")`);

  // ---- 3. A custom butcher, walk-in; reopen; turn its last method off.
  await openStores();
  await click("store-add-open");
  ok(await ev(`${q("store-add-save")}.disabled`), "Add needs a name and a method");
  await ev(`(() => { const el = ${q("store-add-name")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "  Butcher "); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  ok(await ev(`${q("store-add-save")}.disabled`), "still needs a method");
  await click("store-add-walkIn");
  await click("store-add-save");
  await openStores();
  eq(await ev(`${q("store-name-custom:butcher")}.textContent`), "Butcher", "custom name kept");
  ok(await ev(`Boolean(${q("store-logo-custom:butcher")}.querySelector("svg")) && !${q("store-logo-custom:butcher")}.querySelector("img")`), "storefront icon");
  ok(await pressed("store-custom:butcher-walkIn") && !(await pressed("store-custom:butcher-delivery")), "walk-in selected");
  // Same name, other case: reuses the entry.
  await click("store-add-open");
  await ev(`(() => { const el = ${q("store-add-name")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "BUTCHER"); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await click("store-add-delivery"); await click("store-add-save");
  eq((await saved()).filter(s => s.id === "custom:butcher"), [{ id: "custom:butcher", name: "Butcher", methods: ["delivery", "walkIn"] }], "same name reuses the entry");
  await click("store-custom:butcher-delivery"); await click("store-custom:butcher-walkIn");
  ok(!(await rows()).includes("custom:butcher"), "last method off removes it");
  await sleep(500);
  await openStores();
  ok(!(await rows()).includes("custom:butcher"), "removal persists");

  // ---- 4. A new person continues with no store.
  await call("Network.enable"); await call("Network.clearBrowserCookies");
  await ev(`localStorage.clear(); localStorage.setItem("tablewise_guest_v1", "1")`);
  await go("/", `location.pathname === "/household" && Boolean(${q("store-picker")})`);
  await click("restriction-none");
  await ev(`document.querySelector('[data-testid^="device-"]').click()`);
  await until(`!${q("button-suggest-week")}.disabled`, "catalog loaded");
  await click("button-suggest-week");
  await sleep(300); { const why = await ev(`location.pathname + " " + (${q("household-error")}?.textContent ?? "")`); if (!why.startsWith("/meals")) console.log("still:", why); }
  await until(`location.pathname === "/meals"`, "Continue with no store");
  eq(await saved(), [], "no stores saved");

  eq(errors, [], "no page errors");
  console.log(`All ${checks} store picker browser checks passed.`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
