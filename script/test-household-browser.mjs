// Guided setup → Cook now / Plan my week → Groceries, launch on Home, My kitchen's default and a missing answer, at phone width in a real browser.
// Throwaway Chrome profile = a new guest. Usage: node script/test-household-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-household-"));
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
  await call("Page.enable"); await call("Runtime.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1')" }); // past the sign-in screen, as a guest
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}; at ${await ev("location.href").catch(() => "?")}; page: ${(await ev("document.body.innerText.slice(0, 400)").catch(() => "?"))}`); };
  const click = id => ev(`${q(id)}.click()`);
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const noScroll = () => ev("document.documentElement.scrollWidth <= innerWidth");
  const plan = () => ev("JSON.parse(localStorage.getItem('weeklyMealsState'))");
  const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
  const dishes = async () => (await plan()).batches.slice().sort((a, b) => a.cookDate.localeCompare(b.cookDate));
  const recipe = id => ev(`fetch("/api/recipes/${id}").then(r => r.json())`);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  const settings = () => ev("JSON.parse(localStorage.getItem('tablewise_basic_settings'))");
  const pressed = id => ev(`${q(id)}.getAttribute("aria-pressed") === "true"`);
  const step = name => `${q("text-page-title")}?.dataset.step === ${JSON.stringify(name)}`;

  // ---- First visit lands on Home (2026-11-22); the guided setup is one question at a time, "Step N of 4".
  await go("/", `location.pathname === "/" && Boolean(${q("home-find-my-dish")})`);
  await go("/household", step("style"));
  ok((await ev(`${q("step-of")}.textContent`)).endsWith("Step 1 of 4"), "Step 1 of 4");
  ok(await noScroll(), "setup fits a phone");
  ok(await ev(`[...document.querySelectorAll("button")].every(b => b.offsetParent === null || b.getBoundingClientRect().height >= 44)`), "44px targets");
  await click("style-quick");
  await until(step("people"), "people");
  eq(await ev("document.activeElement.id"), "step-title", "focus moves to the new question");
  await click("button-back");
  await until(step("style"), "back to style");
  ok(await ev(`${q("style-quick")}.getAttribute("aria-checked") === "true"`), "Back keeps the answer");
  await click("style-quick");
  await until(step("people"), "people again");

  // ---- Who are you cooking for: at least one person; 2 adults and 3 children make 3½ servings.
  await click("button-next");
  await until(`Boolean(${q("step-required")})`, "people required");
  ok(await ev(step("people")), "an unanswered step cannot advance");
  await click("count-adults-increase"); await click("count-adults-increase");
  ok(await ev(`!${q("switch-kid-friendly")}`), "no Kid-friendly switch with zero children");
  await click("count-kids-increase");
  ok(await ev(`${q("switch-kid-friendly")}?.getAttribute("aria-checked") === "false"`), "switch appears under Children, off by default");
  await click("switch-kid-friendly");
  ok((await settings()).household.kidFriendly === true, "switch saved");
  await click("count-kids-decrease");
  ok(await ev(`!${q("switch-kid-friendly")}`) && (await settings()).household.kidFriendly === true, "hidden at zero children, preference kept");
  for (let i = 0; i < 3; i++) await click("count-kids-increase");
  ok(await ev(`${q("switch-kid-friendly")}.getAttribute("aria-checked") === "true"`), "shown again, still on");
  ok((await ev(`${q("servings-preview")}.textContent`)).startsWith("3½ servings"), "3½ servings by default");
  // Refresh resumes at the same question with the same answers.
  await go("/household", step("people"));
  eq(await ev(`[${q("count-adults-value")}.textContent, ${q("count-kids-value")}.textContent]`), ["2", "3"], "refresh keeps the counts");
  ok(await ev(`${q("switch-kid-friendly")}.getAttribute("aria-checked") === "true"`), "refresh keeps Kid-friendly meals");
  await click("button-next");
  await until(step("restrictions"), "requirements");

  // ---- Family food requirements: an explicit answer; None clears the others and a requirement clears None.
  await click("button-next");
  await until(`Boolean(${q("step-required")})`, "requirements required");
  await click("restriction-diet"); await click("diet-glutenFree");
  ok(await pressed("diet-glutenFree"), "diet chosen");
  await click("restriction-none");
  ok(await pressed("restriction-none") && !(await settings()).dietary.diets.length, "None clears the diet");
  await click("restriction-exclusions"); await click("allergy-sesame");
  ok(!(await pressed("restriction-none")) && (await settings()).dietary.allergies.includes("sesame"), "an allergy clears None");
  await click("allergy-sesame"); await click("restriction-none");
  await click("button-next");
  await until(step("kitchen"), "kitchen");

  // ---- My kitchen (2026-11-22): Microwave, Air fryer, Stovetop, Oven, No cooking appliances. A new setup shows Microwave
  // selected without saving it; unselecting the last device is unanswered; No cooking appliances is an answer.
  eq(await ev(`[...document.querySelectorAll('[data-testid^="device-"]')].map(b => b.dataset.testid)`),
    ["device-Microwave", "device-Air fryer", "device-Stovetop", "device-Oven", "device-none"], "kitchen order");
  ok(await pressed("device-Microwave") && (await settings()).kitchen.devices === null, "Microwave shown selected, not saved");
  await click("device-Microwave");
  eq((await settings()).kitchen.devices, null, "unselecting the last device is unanswered, not none");
  await click("button-next");
  await until(`Boolean(${q("step-required")})`, "kitchen required");
  await click("button-back"); await until(step("restrictions"), "back");
  await click("button-next"); await until(step("kitchen"), "kitchen again");
  ok(!(await pressed("device-Microwave")), "Back keeps Microwave deselected");
  await click("device-none");
  ok(await pressed("device-none") && (await settings()).kitchen.devices?.length === 0, "No cooking appliances saved as []");
  await go("/household", step("kitchen"));
  ok(await pressed("device-none") && !(await pressed("device-Microwave")), "No cooking appliances survives reopening");
  await click("device-Air fryer");
  ok(!(await pressed("device-none")), "a device clears No cooking appliances");
  await go("/household", step("kitchen"));
  eq((await settings()).kitchen.devices, ["Air fryer"], "Air fryer only kept");
  ok(await pressed("device-Air fryer") && !(await pressed("device-Microwave")), "the default never replaces a saved answer");
  await click("device-Air fryer"); await click("device-Stovetop"); await click("device-Oven");
  await click("button-next");
  await until(step("done"), "What would you like to do?");
  eq((await settings()).setup.status, "done", "setup saved as finished without any week");
  eq((await plan())?.batches?.length ?? 0, 0, "finishing setup writes no week");

  // ---- Personalize my recipes opens the editor; Cancel returns to screen 5 (full checks further down).
  await click("link-personalize");
  await until(`location.pathname === "/personalize" && Boolean(${q("button-cancel-preferences")})`, "editor from setup");
  await click("button-cancel-preferences");
  await until(step("done"), "back to screen 5");

  // ---- Cook now opens the Find my dish sheet (2026-11-22): one protein → one dish; Start cooking opens Zen; the Week is untouched.
  await until(`!${q("button-cook-now")}.disabled`, "catalog loaded");
  await click("button-cook-now");
  await until(`Boolean(${q("find-my-dish-result")}) || Boolean(${q("find-protein")})`, "Find my dish sheet");
  await ev(`${q("find-my-dish-edit")}?.click()`);
  await until(`Boolean(${q("find-protein")})`, "the search controls");
  await ev(`(() => { const i = ${q("find-protein")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Chicken"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await click("find-my-dish-submit");
  await until(`Boolean(${q("find-my-dish-result")})`, "a dish");
  ok(/chicken/i.test(await ev(`${q("find-my-dish-result")}.textContent`)), "a chicken dish");
  await click("find-my-dish-start");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("cooking-mode")})`, "Zen mode");
  eq((await plan())?.batches?.length ?? 0, 0, "Cook now writes no week");

  // ---- Plan my week: the Week asks only for cooking days; fixed days beyond the count must be resolved.
  await go("/meals?plan", `Boolean(${q("schedule-panel")})`);
  ok(await noScroll(), "cooking days fit a phone");
  await click("fixed-3"); await click("fixed-0"); await click("evenings-1");
  await until(`Boolean(${q("over-count")})`, "too many fixed days");
  ok(await ev(`${q("button-save-schedule")}.disabled`), "can't plan until resolved");
  await click("raise-count");
  ok(await ev(`!${q("over-count")} && !${q("button-save-schedule")}.disabled`), "raising the count resolves it");
  await click("evenings-3");
  await click("button-save-schedule");
  // Cook with what I have asks for proteins on hand before an empty week's draft; Skip plans as usual.
  await until(`Boolean(${q("on-hand-step")})`, "proteins on hand");
  await click("button-skip-on-hand");
  await until(`Boolean(${q("week-status")}) && !${q("schedule-panel")}`, "drafted week");
  // The current week folds days other than today: open them all.
  await ev(`document.querySelectorAll('[data-testid^="day-toggle-"][aria-expanded="false"]').forEach(b => b.click())`);
  await until(`!document.querySelector('[data-testid^="day-toggle-"][aria-expanded="false"]')`, "days unfolded");
  let week = await dishes();
  eq(week.map(b => weekday(b.cookDate)).sort(), [0, 3, 5], "Wednesday and Sunday, plus one more day");
  ok(week.every(b => b.serves[0].adults === 2 && b.serves[0].kids === 3), "2 adults and 3 children on each dish");
  ok(await noScroll(), "the Week fits a phone");

  // ---- Swap one dish; refresh keeps the draft and never asks for cooking days again.
  const friday = week.find(b => weekday(b.cookDate) === 5);
  await click(`swap-${friday.id}`);
  await until(`Boolean(document.querySelector('[data-testid="pick-list"] button'))`, "picker");
  await ev(`document.querySelector('[data-testid="pick-list"] button').click()`);
  await until(`${q(`dish-${friday.id}`)}.dataset.recipe !== ${JSON.stringify(friday.recipeId)}`, "Friday swapped");
  week = await dishes();
  await go("/meals?plan", `Boolean(${q("week-status")})`);
  ok(await ev(`!${q("schedule-panel")}`), "the saved schedule is reused");
  eq(await dishes(), week, "draft survives a refresh");
  await click("button-cooking-days");
  await until(`Boolean(${q("button-cancel-schedule")})`, "cooking days editor");
  await click("button-cancel-schedule");
  eq(await dishes(), week, "Cancel changes nothing");

  // ---- Approve → Groceries offers the store picker once; Maybe later ends it; shopping works with no store.
  await click("button-approve-week");
  await until(`Boolean(${q("button-view-groceries")})`, "approved");
  await go("/grocery-list", `Boolean(${q("stores-offer")})`);
  await click("stores-offer-later");
  ok(await ev(`!${q("stores-offer")} && document.querySelectorAll('[data-testid="grocery-item-recipes"]').length > 0`), "list works with no store");
  await go("/grocery-list", `document.querySelectorAll('[data-testid="grocery-item-recipes"]').length > 0`);
  ok(await ev(`!${q("stores-offer")}`), "offered once");

  // ---- Home and screen 5 open the same sheet.
  await go("/", `Boolean(${q("home-find-my-dish")})`);
  ok(await noScroll(), "Home fits a phone");

  // ---- Personalize my recipes: Cancel keeps everything; Save returns to where it was opened.
  const before = JSON.stringify(await settings());
  await go("/household?step=5", step("done"));
  await click("link-personalize");
  await until(`location.pathname === "/personalize" && Boolean(${q("preference-summary")})`, "editor from screen 5");
  ok(await noScroll(), "editor fits a phone");
  await click("cuisine-Asian"); await click("switch-kid-friendly");
  ok((await ev(`${q("preference-summary")}.textContent`)).includes("Asian dishes first."), "summary follows the draft");
  await click("button-cancel-preferences");
  await until(step("done"), "Cancel returns to screen 5");
  eq(JSON.stringify(await settings()), before, "Cancel changes nothing");
  await click("link-personalize");
  await until(`Boolean(${q("cuisine-Asian")})`, "editor again");
  await click("cuisine-Asian"); await click("button-save-preferences");
  await until(step("done"), "Save returns to screen 5");
  eq((await settings()).dietary.preferredCuisines, ["Asian"], "Asian saved as one broad choice");
  // From the Week: a new requirement never replaces the approved week; the Week asks, and flags dishes that no longer fit.
  await go("/meals?plan", `Boolean(${q("link-personalize-week")})`);
  await click("link-personalize-week");
  await until(`Boolean(${q("restriction-diet")})`, "editor from the Week");
  await click("restriction-diet"); await click("diet-glutenFree"); await click("button-save-preferences");
  await until(`location.pathname === "/meals" && Boolean(${q("prefs-changed")})`, "the Week asks before replacing");
  eq(await ev(`${q("week-status")}.dataset.state`), "approved", "approved week untouched");
  await click("button-keep-week");
  await until(`!${q("prefs-changed")}`, "kept");
  ok(await ev(`document.querySelectorAll('[data-testid^="dish-warning-"]').length > 0`), "dishes that no longer fit are flagged");
  // From the old Cook now page (a link; no button opens it since 2026-11-22): Save picks a fresh suggestion under the new rules.
  const anyId = await ev(`fetch("/api/recipes").then(r => r.json()).then(list => list[0].id)`);
  await go(`/recipe/${encodeURIComponent(anyId)}?suggest`, `Boolean(${q("link-personalize-cook")})`);
  await click("link-personalize-cook");
  await until(`Boolean(${q("button-save-preferences")}) && !${q("button-save-preferences")}.disabled`, "editor from Cook now");
  await click("button-save-preferences");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("suggestion-bar")})`, "back on a suggestion");
  ok((await recipe(decodeURIComponent(await ev("location.pathname.slice(8)")))).tags.includes("Gluten-free"), "the new pick follows the saved requirement");
  // A temporary time limit narrows this Cook now only.
  const saved = JSON.stringify(await settings());
  await click("suggest-time-15");
  await until(`location.search.includes("max=15") || Boolean(${q("suggest-time-none")})`, "time limit applied");
  eq(JSON.stringify(await settings()), saved, "a temporary limit never changes saved preferences");
  // From Settings: Cancel goes back to Settings.
  await go("/settings", `Boolean(${q("link-personalize-settings")})`);
  await click("link-personalize-settings");
  await until(`Boolean(${q("button-cancel-preferences")})`, "editor from Settings");
  await click("button-cancel-preferences");
  await until(`location.pathname === "/settings"`, "Cancel returns to Settings");

  // ---- A household whose kitchen was never answered (devices: null) is asked only that, then resumes where it was going.
  await ev(`fetch("/api/household-settings", { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...JSON.parse(localStorage.getItem('tablewise_basic_settings')), kitchen: { devices: null } }) }).then(r => r.ok)`);
  await go("/meals?plan", `location.pathname === "/household" && ${step("kitchen")}`);
  ok((await ev(`${q("step-of")}.textContent`)).endsWith("Step 1 of 1"), "only the missing question");
  await click("device-Microwave"); await click("button-next");
  await until(`location.pathname === "/meals" && Boolean(${q("week-status")})`, "back on the Week");
  // Microwave only: the local catalog has no microwave or reviewed no-cook recipe, so Find my dish says so, offers Edit kitchen and relaxes nothing.
  await go("/household?step=5", `${step("done")} && !${q("button-cook-now")}.disabled`);
  await click("button-cook-now");
  await until(`Boolean(${q("find-my-dish-result")}) || Boolean(${q("find-protein")})`, "Find my dish sheet");
  await ev(`${q("find-my-dish-edit")}?.click()`);
  await until(`Boolean(${q("find-protein")})`, "the search controls");
  await ev(`(() => { const i = ${q("find-protein")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Chicken"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await click("find-my-dish-submit");
  await until(`Boolean(${q("find-my-dish-none")}) && Boolean(${q("find-edit-kitchen")})`, "no match, Edit kitchen");
  ok(await ev(`location.pathname === "/household"`), "no recipe opened");

  // ---- A new setup's Continue saves the Microwave default.
  await ev(`fetch("/api/household-settings", { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify((s => ({ ...s, kitchen: { devices: null }, setup: { ...s.setup, status: "new", step: 4 } }))(JSON.parse(localStorage.getItem('tablewise_basic_settings')))) }).then(r => r.ok)`);
  await go("/household", step("kitchen"));
  ok(await pressed("device-Microwave"), "Microwave preselected in a new setup");
  await click("button-next");
  await until(step("done"), "setup finished");
  eq((await settings()).kitchen.devices, ["Microwave"], "Continue saves Microwave");

  // ---- Hebrew, right to left.
  await ev("localStorage.setItem('tablewise_language','he')");
  await go("/household", `${step("style")}`);
  eq(await ev("document.documentElement.dir"), "rtl", "rtl");
  ok((await ev(`${q("step-of")}.textContent`)).includes("שלב 1 מתוך 4"), "Hebrew step label");
  ok(await noScroll(), "Hebrew fits a phone");
  await go("/personalize", `Boolean(${q("preference-summary")})`);
  ok(await ev(`document.documentElement.dir === "rtl" && !/[A-Za-z]{5,}/.test(${q("text-page-title")}.textContent)`), "editor in Hebrew, right to left");
  ok(await noScroll(), "Hebrew editor fits a phone");
  eq(errors, [], "no page errors");
  console.log(`PASS household browser: ${checks} checks`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
