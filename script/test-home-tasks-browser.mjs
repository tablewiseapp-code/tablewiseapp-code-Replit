// Home Tasks acceptance checks in a real browser, on desktop and phone widths (throwaway Chrome profile).
// Usage: node script/test-home-tasks-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+). Writes tasks for that profile's owner only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-tasks-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.getItem('tablewise_basic_settings') || localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped' } }))" }); // skip the first-visit sign-in screen
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${e}`); return r.result.value; };
  const q = id => `document.querySelector('[data-testid="${id}"]')`;
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await until(ready, path); };
  const row = name => `document.querySelector('[data-testid="home-task"][data-task-name="${name}"]')`;
  const inSection = (section, name) => `Boolean(document.querySelector('[data-testid="home-tasks-${section}"] [data-task-name="${name}"]'))`;
  const preview = name => `Boolean(document.querySelector('[data-testid="home-task-preview"] [data-task-name="${name}"]'))`;
  const set = (id, value) => ev(`(() => { const el = ${q(id)}; const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); })()`);
  const photo = id => ev(`(async () => { const c = document.createElement("canvas"); c.width = 800; c.height = 600; const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 800, 600);
    const blob = await new Promise(r => c.toBlob(r, "image/png")); const dt = new DataTransfer(); dt.items.add(new File([blob], "bill.png", { type: "image/png" }));
    const input = ${q(id)}; input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  const menu = async (name, action) => {
    await ev(`${row(name)}.querySelector('[data-testid="home-task-menu"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }))`);
    await until(`Boolean(${q(action)})`, `${action} menu item`);
    await ev(`${q(action)}.click()`);
  };
  const undo = async () => { await until(`Boolean(${q("button-undo-task")})`, "undo"); await ev(`${q("button-undo-task")}.click()`); };
  const tasks = () => ev(`fetch("/api/home-tasks").then(r => r.json())`);
  const day = offset => ev(`(d => { d.setDate(d.getDate() + ${offset}); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })(new Date())`);
  await call("Runtime.enable");

  for (const [width, mobile] of [[1280, false], [390, true]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile });
    await go("/home-tasks", `Boolean(${q("button-add-task")})`);
    await ev(`localStorage.setItem("tablewise_language", "en")`);
    await ev(`fetch("/api/home-tasks").then(r => r.json()).then(list => Promise.all(list.map(t => fetch("/api/home-tasks/" + t.id, { method: "DELETE" }))))`);
    await go("/home-tasks", `Boolean(${q("home-tasks-empty")})`);
    const today = await day(0), yesterday = await day(-1), tomorrow = await day(1);

    // Blank names are rejected; a name alone saves with Enter into Anytime with Normal priority.
    await ev(`${q("button-add-task")}.click()`); await until(`Boolean(${q("home-task-name")})`, "dialog");
    await until(`Boolean(document.querySelector('#household-task-suggestions option[value="Fold laundry"]'))`, "catalog suggestions"); checks++;
    await set("home-task-name", "   ");
    await ev(`${q("home-task-save")}.click()`); await until(`Boolean(${q("home-task-error")})`, "blank error");
    await set("home-task-name", "Fold laundry");
    await ev(`${q("home-task-name")}.form.requestSubmit()`); // what Enter in the name field does
    await until(inSection("anytime", "Fold laundry"), "Fold laundry in Anytime");
    ok((await tasks()).find(t => t.name === "Fold laundry").priority === "normal", `${width}: Normal by default`);
    ok(await ev(`!${row("Fold laundry")}.querySelector('[data-testid="home-task-high"]')`), `${width}: no High label`);

    // High priority, today and a photo: in Today and on Home.
    await ev(`${q("button-add-task")}.click()`); await until(`Boolean(${q("home-task-name")})`, "dialog 2");
    await set("home-task-name", "Pay electricity bill");
    await set("home-task-due-input", today);
    await set("home-task-priority", "high");
    await photo("home-task-photo-input"); await until(`Boolean(${q("home-task-photo")})`, "photo thumbnail");
    await ev(`${q("home-task-photo-view")}.click()`); await until(`Boolean(${q("home-task-photo-full")})`, "full photo");
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await until(`!${q("home-task-photo-full")} && Boolean(${q("home-task-save")})`, "full photo closed, form stays");
    await ev(`${q("home-task-save")}.click()`);
    await until(inSection("today", "Pay electricity bill"), "bill in Today");
    ok(await ev(`Boolean(${row("Pay electricity bill")}.querySelector('[data-testid="home-task-high"]')) && Boolean(${row("Pay electricity bill")}.querySelector('[data-testid="home-task-thumbnail"]'))`), `${width}: High label and thumbnail`);
    await ev(`document.querySelector('a[href="/"]').click()`);
    await until(preview("Pay electricity bill"), "bill on Home");
    ok(await ev(preview("Fold laundry")), `${width}: Anytime task on Home too`);

    // Complete from Home → leaves both open lists, appears in Completed with its photo. Undo restores it.
    await ev(`${row("Pay electricity bill")}.querySelector('[data-testid="home-task-check"]').click()`);
    await until(`!${preview("Pay electricity bill")}`, "bill leaves Home");
    await ev(`${q("link-view-all-tasks")}.click()`);
    await until(`Boolean(${q("home-tasks-completed")})`, "Completed section");
    ok(await ev(`!${inSection("today", "Pay electricity bill")} && /Completed \\(1\\)/.test(${q("home-tasks-completed")}.innerText) && !${q("home-tasks-completed")}.open`), `${width}: collapsed Completed with count`);
    ok(await ev(`Boolean(${q("home-tasks-completed")}.querySelector('[data-task-name="Pay electricity bill"] [data-testid="home-task-thumbnail"]'))`), `${width}: photo kept after completion`);
    await undo();
    await until(inSection("today", "Pay electricity bill"), "undo restores to Today");
    ok(await ev(`!${q("home-tasks-completed")}`), `${width}: Completed hidden when empty`);

    // Yesterday → Overdue; Move to tomorrow → Upcoming.
    await ev(`${row("Fold laundry")}.querySelector('[data-testid="home-task-open"]').click()`);
    await until(`Boolean(${q("home-task-created")})`, "details");
    ok(/Created on/.test(await ev(`${q("home-task-created")}.innerText`)), `${width}: Created on`);
    await set("home-task-due-input", yesterday);
    await ev(`${q("home-task-save")}.click()`);
    await until(inSection("overdue", "Fold laundry"), "Overdue");
    await menu("Fold laundry", "home-task-tomorrow");
    await until(inSection("upcoming", "Fold laundry"), "Upcoming");
    ok((await tasks()).find(t => t.name === "Fold laundry").dueDate === tomorrow, `${width}: due tomorrow`);

    // Delete a task with a photo, undo, reload: task and photo are back.
    const before = (await tasks()).find(t => t.name === "Pay electricity bill");
    await menu("Pay electricity bill", "home-task-delete");
    await until(`!${row("Pay electricity bill")}`, "deleted");
    await undo();
    await until(`Boolean(${row("Pay electricity bill")})`, "undo delete");
    await go("/home-tasks", inSection("today", "Pay electricity bill"));
    const after = (await tasks()).find(t => t.name === "Pay electricity bill");
    assert.deepEqual(after, before); checks++;
    ok(await ev(`Boolean(${row("Pay electricity bill")}.querySelector('[data-testid="home-task-thumbnail"]'))`), `${width}: photo after reload`);

    // A failed save keeps the dialog and what was typed.
    await ev(`${q("button-add-task")}.click()`); await until(`Boolean(${q("home-task-name")})`, "dialog 3");
    await set("home-task-name", "Water the plants");
    await ev(`window.__fetch = window.fetch; window.fetch = (u, o) => o?.method === "PUT" ? Promise.resolve(new Response("x", { status: 500 })) : window.__fetch(u, o)`);
    await ev(`${q("home-task-save")}.click()`); await until(`Boolean(${q("home-task-error")})`, "save error");
    ok(await ev(`${q("home-task-name")}.value === "Water the plants"`), `${width}: input kept after failure`);
    await ev(`window.fetch = window.__fetch`);
    await ev(`${q("home-task-save")}.click()`);
    await until(inSection("anytime", "Water the plants"), "retry saves");

    ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), `${width}: no horizontal scroll`);
    if (mobile) ok(await ev(`Boolean(document.querySelector('[data-testid="app-nav-bottom-link-home-tasks"][aria-current="page"]'))`), "bottom tab active");
  }
  ok(errors.length === 0, `no page errors: ${errors.join("; ")}`);
  console.log(`home tasks browser: ${checks} checks ok`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
