// Guided setup → Cook now / Plan my week → Groceries, Home "Suggest a recipe" and a missing answer, at phone width in a real browser.
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

  // ---- First visit lands on the guided setup: one question at a time, "Step N of 4".
  await go("/", `location.pathname === "/household" && ${step("style")}`);
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
  await go("/", `location.pathname === "/household" && ${step("people")}`);
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

  // ---- My kitchen: required; No cooking appliances is an answer, an empty selection is not.
  await click("button-next");
  await until(`Boolean(${q("step-required")})`, "kitchen required");
  await click("device-none");
  ok(await pressed("device-none") && (await settings()).kitchen.devices?.length === 0, "No cooking appliances saved as []");
  await click("device-Stovetop");
  ok(!(await pressed("device-none")), "a device clears No cooking appliances");
  await click("device-Stovetop");
  eq((await settings()).kitchen.devices, null, "unselecting the last device is unanswered, not none");
  await click("device-Stovetop"); await click("device-Oven");
  await click("button-next");
  await until(step("done"), "What would you like to do?");
  eq((await settings()).setup.status, "done", "setup saved as finished without any week");
  eq((await plan())?.batches?.length ?? 0, 0, "finishing setup writes no week");

  // ---- Personalize my recipes → Settings → back to screen 5.
  await click("link-personalize");
  await until(`location.pathname === "/settings" && Boolean(${q("link-back-to-setup")})`, "Settings from setup");
  await click("link-back-to-setup");
  await until(step("done"), "back to screen 5");

  // ---- Cook now: one eligible recipe on its own page; Show another; Start cooking opens Zen; the Week is untouched.
  await until(`!${q("button-cook-now")}.disabled`, "catalog loaded");
  await click("button-cook-now");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("suggestion-bar")})`, "suggested recipe");
  const firstId = decodeURIComponent(await ev("location.pathname.slice(8)"));
  ok(await ev(`!${q("button-recipe-menu")} && Boolean(${q("button-show-another")})`), "Show another replaces the More actions menu");
  await click("button-show-another");
  await until(`decodeURIComponent(location.pathname.slice(8)) !== ${JSON.stringify(firstId)} && Boolean(${q("button-start-cooking")})`, "another recipe");
  await click("button-start-cooking");
  await until(`Boolean(${q("cooking-mode")})`, "Zen mode");
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
  await until(`Boolean(${q("week-status")}) && !${q("schedule-panel")}`, "drafted week");
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

  // ---- Home → Suggest a recipe is the same action as Cook now.
  const planBefore = await plan();
  await go("/", `Boolean(${q("home-suggest-recipe")}) && !${q("home-suggest-recipe")}.disabled`);
  ok(await noScroll(), "Home fits a phone");
  await click("home-suggest-recipe");
  await until(`location.pathname.startsWith("/recipe/") && Boolean(${q("suggestion-bar")})`, "Home suggestion opens the recipe");
  eq(await plan(), planBefore, "Home suggestion leaves the Week unchanged");

  // ---- A household whose kitchen was never answered (devices: null) is asked only that, then resumes where it was going.
  await ev(`fetch("/api/household-settings", { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...JSON.parse(localStorage.getItem('tablewise_basic_settings')), kitchen: { devices: null } }) }).then(r => r.ok)`);
  await go("/meals?plan", `location.pathname === "/household" && ${step("kitchen")}`);
  ok((await ev(`${q("step-of")}.textContent`)).endsWith("Step 1 of 1"), "only the missing question");
  await click("device-Microwave"); await click("button-next");
  await until(`location.pathname === "/meals" && Boolean(${q("week-status")})`, "back on the Week");
  // Microwave only: the local catalog has no microwave or reviewed no-cook recipe, so Cook now says so and relaxes nothing.
  await go("/household?step=5", `${step("done")} && !${q("button-cook-now")}.disabled`);
  await click("button-cook-now");
  await until(`Boolean(${q("cook-now-none")})`, "empty state");
  ok(await ev(`location.pathname === "/household"`), "no recipe opened");

  // ---- Hebrew, right to left.
  await ev("localStorage.setItem('tablewise_language','he')");
  await go("/household", `${step("style")}`);
  eq(await ev("document.documentElement.dir"), "rtl", "rtl");
  ok((await ev(`${q("step-of")}.textContent`)).includes("שלב 1 מתוך 4"), "Hebrew step label");
  ok(await noScroll(), "Hebrew fits a phone");
  eq(errors, [], "no page errors");
  console.log(`PASS household browser: ${checks} checks`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
