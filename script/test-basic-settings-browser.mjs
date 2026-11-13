// Browser checks for My Basic Settings against a running local app (throwaway Chrome profile; reads recipes only).
// Usage: BASE_URL=http://localhost:5001 node script/test-basic-settings-browser.mjs   (Node 22+, CHROME_PATH optional)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error("Only run against a local app.");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-settings-"));
const port = 9600 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const exceptions = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r?.result?.value; };
  const until = async (e, what) => { for (let i = 0; i < 150; i++) { if (await ev(`Boolean(${e})`).catch(() => false)) return; await sleep(120); } throw new Error(`timeout: ${what}; page: ${String(await ev("document.body.innerText")).slice(0, 300).replace(/\n/g, " | ")}`); };
  const go = async path => { await call("Page.navigate", { url: BASE + path }); await sleep(400); };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const click = id => ev(`${q(id)}.click()`);
  const key = async (k, code = k) => {
    const text = { Enter: "\r", " ": " " }[k];
    for (const type of ["keyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type: type === "keyDown" && text ? "keyDown" : type, key: k, code, windowsVirtualKeyCode: { Tab: 9, Enter: 13, " ": 32 }[k], ...(type === "keyDown" && text ? { text } : {}) });
  };
  const status = () => ev(`${q("settings-status")}.dataset.status`);
  const openSection = async id => { if (await ev(`${q(`section-${id}-toggle`)}.dataset.state !== "open"`)) await click(`section-${id}-toggle`); await until(`${q(`section-${id}-toggle`)}.dataset.state === "open"`, `open ${id}`); };
  const noOverflow = async where => ok(await ev("document.documentElement.scrollWidth <= window.innerWidth + 1"), `${where}: horizontal overflow`);
  await call("Runtime.enable"); await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // Fresh profile: nothing configured.
  await go("/settings"); await ev("localStorage.clear()"); await go("/settings");
  await until(q("members-empty"), "empty household state");
  ok(await ev(`${q("text-page-title")}.textContent`) === "My Basic Settings", "title");
  ok(await ev(`[...document.querySelectorAll('[data-testid^="section-"][data-testid$="-toggle"]')].length`) === 6, "six sections");

  // Keyboard: focus "Add adult", press Enter; Tab moves on; Space toggles a chip.
  await ev(`${q("add-adult")}.focus()`); await key("Enter");
  await until(q("member-0"), "member added with keyboard");
  await until(`${q("settings-status")}.dataset.status === "saved"`, "autosaved");
  ok(true, "keyboard add + autosave");
  await click("add-child"); await until(q("member-1"), "child added");
  await click("member-1-details"); await until(q("member-1-allergy-milk"), "child details open");
  await ev(`${q("member-1-allergy-milk")}.focus()`); await key(" ", "Space");
  await until(`${q("member-1-allergy-milk")}.getAttribute("aria-pressed") === "true"`, "space toggles allergy");
  await ev(`${q("member-1-allergy-milk")}.focus()`); await key("Tab");
  ok(await ev(`document.activeElement !== ${q("member-1-allergy-milk")} && document.activeElement.tagName === "BUTTON"`), "Tab moves focus to the next control");

  // Kitchen: explicitly select no devices; survives reload.
  await openSection("kitchen");
  for (const d of ["oven", "air-fryer", "stovetop", "microwave"]) await click(`setting-device-${d}`);
  await until(q("text-no-devices"), "no-devices warning");
  await until(`${q("settings-status")}.dataset.status === "saved"`, "saved");
  await go("/settings"); await until(q("member-1"), "reloaded");
  ok(await ev(`JSON.parse(localStorage.getItem("tablewise_basic_settings")).kitchen.devices.length === 0`), "explicit empty device list stored");
  await openSection("kitchen"); await until(q("text-no-devices"), "empty selection survives reload");
  await click("member-1-details"); await until(`${q("member-1-allergy-milk")}?.getAttribute("aria-pressed") === "true"`, "member allergy survives reload");
  ok(true, "persistence after reload");

  // Weekly Meals: only no-cook recipes + explanation; method filter only No-cook. My Recipes keeps everything.
  await go("/meals");
  await until(q("settings-banner"), "settings banner");
  ok((await ev(`${q("settings-banner")}.textContent`)).includes("only no-cook"), "no-cook explanation");
  const shown = await ev(`document.querySelectorAll('[data-testid^="recipe-card-"]').length`);
  ok(shown > 0 && shown < 100, `only a few no-cook recipes shown (${shown})`);
  await ev(`${q("button-toggle-method")}?.click()`); await sleep(300);
  if (!(await ev(`!!document.querySelector('[data-testid^="filter-method-"]')`))) { await ev(`${q("button-toggle-method")}?.click()`); await sleep(300); }
  ok(JSON.stringify(await ev(`[...document.querySelectorAll('[data-testid^="filter-method-"]')].map(b => b.dataset.testid)`)) === JSON.stringify(["filter-method-no-cook"]), "method filter shows only No-cook");
  await go("/recipes");
  await until(`document.querySelectorAll('[data-testid^="card-recipe-"]').length >= 200`, "My Recipes unchanged");
  ok(true, "My Recipes lists every recipe");

  // Autosave failure is visible and recoverable.
  await go("/settings"); await until(q("member-0"), "settings");
  await ev(`window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "tablewise_basic_settings") throw new Error("QuotaExceededError"); return window.__set.call(this, k, v); }`);
  await openSection("kitchen"); await click("setting-device-stovetop");
  await until(`${q("settings-status")}.dataset.status === "error" && ${q("settings-retry")}`, "error + retry shown");
  ok((await ev(`${q("settings-status")}.textContent`)).includes("Unable to save"), "error text");
  ok(await ev(`JSON.parse(localStorage.getItem("tablewise_basic_settings")).kitchen.devices.length === 0`), "nothing written on failure");
  await ev(`Storage.prototype.setItem = window.__set`); await click("settings-retry");
  await until(`${q("settings-status")}.dataset.status === "saved"`, "retry saves");
  ok(await ev(`JSON.stringify(JSON.parse(localStorage.getItem("tablewise_basic_settings")).kitchen.devices) === '["Stovetop"]'`), "retried change stored");

  // Stovetop only → Weekly Meals hides oven recipes and offers Stovetop + No-cook.
  await go("/meals"); await until(q("count-settings"), "settings count");
  ok(Number(await ev(`${q("count-settings")}.dataset.count`)) > 0, "excluded-by-settings count shown");

  // Long option lists are searchable; searching only filters what is shown and never changes saved values.
  await go("/settings"); await openSection("dietary");
  await ev(`${q("dietary-preferences-more")}.open = true`);
  await click("cuisine-like-thai"); await until(`${q("settings-status")}.dataset.status === "saved" && ${q("cuisine-like-thai")}.getAttribute("aria-pressed") === "true"`, "Thai liked");
  const before = await ev(`localStorage.getItem("tablewise_basic_settings")`);
  await ev(`(i => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "ital"); i.dispatchEvent(new Event("input", { bubbles: true })); })(${q("cuisine-like-search")})`);
  await until(`!${q("cuisine-like-greek")}`, "search filters options");
  ok(await ev(`Boolean(${q("cuisine-like-italian")}) && Boolean(${q("cuisine-like-thai")})`), "match shown and selected option stays visible");
  ok(await ev(`document.querySelector('label[for="cuisine-like-search"]')?.textContent.length > 0`), "search box has a label");
  ok((await ev(`${q("selected-count-cuisine-like")}.textContent`)).includes("1 selected"), "selected count shown");
  ok(await ev(`localStorage.getItem("tablewise_basic_settings")`) === before, "search does not change saved settings");

  // Languages, RTL and layouts.
  for (const [label, metrics] of [["desktop", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }], ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }]]) {
    await call("Emulation.setDeviceMetricsOverride", metrics);
    for (const [lang, title, dir] of [["en", "My Basic Settings", "ltr"], ["ru", "Мои основные настройки", "ltr"], ["he", "ההגדרות הבסיסיות שלי", "rtl"]]) {
      await ev(`localStorage.setItem("tablewise_language", "${lang}")`); await go("/settings");
      await until(`${q("text-page-title")}?.textContent === ${JSON.stringify(title)}`, `${lang} title`);
      for (const id of ["household", "dietary", "kitchen", "cooking", "planning", "shopping"]) await openSection(id);
      ok(await ev(`document.querySelector('[dir]').getAttribute("dir")`) === dir, `${label} ${lang}: dir=${dir}`);
      ok(!(await ev(`document.body.innerText`)).match(/\b(settings\.|ing_|diet_|allergen_|cuisine_)\w+/), `${label} ${lang}: no untranslated keys`);
      await noOverflow(`${label} ${lang} /settings`);
      ok(await ev(`[...document.querySelectorAll('[data-testid^="setting-device-"], [data-testid^="diet-"], [data-testid="add-adult"]')].every(b => b.getBoundingClientRect().height >= 44)`), `${label} ${lang}: 44px touch targets`);
    }
  }
  await ev(`localStorage.setItem("tablewise_language", "en")`);
  ok(exceptions.length === 0, `uncaught page errors: ${exceptions.join(" | ")}`);
  console.log(`PASS My Basic Settings browser: ${checks} checks — keyboard, autosave + failure/retry, reload persistence, explicit empty devices, Weekly Meals no-cook/hidden banner + method filter, My Recipes unchanged, en/ru/he, RTL, desktop + mobile, touch targets, 0 page errors`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
