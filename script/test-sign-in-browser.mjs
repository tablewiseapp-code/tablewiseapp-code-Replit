// Sign-in screen in a real browser (throwaway Chrome profile; creates one account with a random email).
// Usage: node script/test-sign-in-browser.mjs   (BASE_URL, CHROME_PATH optional; needs Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-sign-in-"));
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
  const until = async (expr, what) => { for (let i = 0; i < 80; i++) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timeout: ${what}`); };
  const go = async (path, ready) => { await call("Page.navigate", { url: BASE + path }); await sleep(100); await until(ready, path); };
  const onSignIn = `Boolean(${q("input-email")}) && !${q("app-nav-header")}`;
  const onApp = `Boolean(${q("app-nav-header")}) && !${q("input-email")}`;
  const fill = (email, password) => ev(`(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(${q("input-email")}, ${JSON.stringify(email)}); set(${q("input-password")}, ${JSON.stringify(password)});
    ${q("button-sign-in")}.click();
  })()`);
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // ---- First visit: sign-in screen, no nav. Share links skip it.
  await go("/", "document.readyState === 'complete'");
  await ev("localStorage.clear(); localStorage.setItem('tablewise_language','en')");
  await go("/", onSignIn);
  eq(await ev(`${q("text-page-title")}.textContent`), "Sign in", "title");
  ok(await ev(`[...document.querySelectorAll("input, button")].every(el => el.getBoundingClientRect().height >= 44)`), "44px targets");
  ok(await ev("document.documentElement.scrollWidth <= innerWidth"), "no horizontal scroll");
  await go("/shared/" + "x".repeat(32), `!${q("input-email")} && document.body.innerText.length > 0`);
  ok(await ev(`!${q("input-email")}`), "share link opens without sign-in");

  // ---- Continue as guest is remembered.
  await go("/", onSignIn);
  await ev(`${q("button-guest")}.click()`);
  await until(`${onApp} && location.pathname === "/household"`, "first visit: Your household");
  await ev(`${q("button-skip-household")}.click()`);
  await until(`location.pathname === "/" && ${onApp}`, "Skip for now goes Home");
  await go("/", onApp);
  ok(await ev(`location.pathname === "/"`), "guest choice and skip remembered after reload");

  // ---- Settings → Sign in → new email creates the account and opens Home.
  await go("/settings", `Boolean(${q("button-sign-in")})`);
  ok((await ev(`${q("account-status")}.textContent`)).includes("guest"), "guest note");
  await ev(`${q("button-sign-in")}.click()`);
  await until(onSignIn, "sign-in screen again");
  const email = `browser-${randomBytes(6).toString("hex")}@example.com`;
  await fill(email, "browser-pass-1");
  await until(`location.pathname === "/" && ${onApp}`, "signed in lands on Home");
  await go("/settings", `Boolean(${q("button-sign-out")})`);
  eq(await ev(`${q("account-status")}.textContent`), `Signed in as ${email}`, "signed-in status");

  // ---- Profile: a name and a photo, shown on the card and in the nav (first letter until a photo is set).
  eq(await ev(`${q("account-avatar")}.textContent`), email[0].toUpperCase(), "avatar falls back to the first letter");
  await ev(`(() => { const el = ${q("input-account-name")};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Robin");
    el.dispatchEvent(new Event("input", { bubbles: true })); ${q("button-account-name-save")}.click(); })()`);
  await until(`${q("account-message")}.textContent === "Saved" && document.querySelector("#account-title").textContent === "Robin"`, "name saved");
  await ev(`new Promise(done => { const c = document.createElement("canvas"); c.width = c.height = 32;
    c.getContext("2d").fillRect(0, 0, 32, 32);
    c.toBlob(blob => { const t = new DataTransfer(); t.items.add(new File([blob], "me.png", { type: "image/png" }));
      const input = ${q("input-account-photo")}; input.files = t.files; input.dispatchEvent(new Event("change", { bubbles: true })); done(); }, "image/png"); })`);
  await until(`Boolean(${q("button-account-photo-remove")}) && [...document.querySelectorAll('[data-testid="app-nav-header"] img')].some(i => i.complete && i.naturalWidth > 0)`, "photo in the nav");
  await go("/settings", `Boolean(${q("button-account-photo-remove")})`);
  eq(await ev(`document.querySelector("#account-title").textContent`), "Robin", "name kept after reload");
  await ev(`${q("button-account-photo-remove")}.click()`);
  await until(`!${q("button-account-photo-remove")} && Boolean(${q("button-account-photo")})`, "photo removed");
  ok(await ev("document.documentElement.scrollWidth <= innerWidth"), "account card fits a phone");

  // ---- Sign out → sign-in screen; wrong password shows an error; right one signs in.
  await ev(`${q("button-sign-out")}.click()`);
  await until(onSignIn, "signed out shows sign-in");
  await fill(email, "not-the-password");
  await until(`${q("sign-in-error")}?.textContent === "Wrong password for this email."`, "wrong password error");
  await fill(email.toUpperCase(), "browser-pass-1");
  await until(onApp, "email is case-insensitive");

  // ---- Hebrew, right to left.
  await ev(`fetch("/api/auth/sign-out", { method: "POST" })`);
  await ev("localStorage.removeItem('tablewise_guest_v1'); localStorage.setItem('tablewise_language','he')");
  await go("/", onSignIn);
  eq(await ev("document.documentElement.dir"), "rtl", "rtl");
  eq(await ev(`${q("text-page-title")}.textContent`), "כניסה", "Hebrew title");
  eq(errors, [], "no page errors");
  console.log(`PASS sign-in browser: ${checks} checks`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
