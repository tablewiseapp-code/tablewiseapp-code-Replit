// Browser regression for the active grocery list with an isolated catalog and shopping API.
// Usage: node script/test-grocery-completion-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-grocery-"));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  assert.ok(tabs, "Chromium did not open a debugging port");
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); waiting[d.id]?.(d); };
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (!r) return undefined; /* page navigating */ if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout: ${what}; page says: ${String(await ev('document.body.innerText')).slice(0, 200).replace(/\n/g, ' | ')}`); };
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const recipes = [
      { id: "curry", title: "Easy chicken curry", servings: "4", ingredients: ["6 chicken thighs", "500 g onions", "2 tbsp curry paste", "100 g Greek yogurt"], steps: [] },
      { id: "roast", title: "Roast chicken", servings: "4", ingredients: ["4 chicken thighs", "1 kg onions"], steps: [] },
    ];
    if (!sessionStorage.testSeed) {
      sessionStorage.testSeed = "1";
      localStorage.setItem("tablewise_language", "en");
      localStorage.setItem("weeklyMealsState", JSON.stringify({
        selectedIds: recipes.map(recipe => recipe.id),
        planAssignments: recipes.map((recipe, index) => ({
          recipeId: recipe.id, mealType: "Dinner", startDay: index, spanDays: 1,
        })),
      }));
    }
    const fetchActual = window.fetch.bind(window);
    window.fetch = async (resource, init) => {
      const path = new URL(typeof resource === "string" ? resource : resource.url, location.href).pathname;
      if (!path.startsWith("/api/")) return fetchActual(resource, init);
      if (path === "/api/recipes") return Response.json(recipes);
      if (path === "/api/week-plan") return Response.json(null); // new owner: no server copy, so the seeded browser plan is used
      if (path === "/api/grocery-extras") return Response.json([{ id: "milk", text: "2 L milk" }]);
      if (path === "/api/grocery-shopping") {
        const data = JSON.parse(sessionStorage.shopping ?? "[]");
        if (init?.method === "PATCH") {
          const input = JSON.parse(init.body);
          const target = data.find(row => row.key === input.key);
          const saved = { key: input.key, skipped: false, priceCents: null, priceText: null, ...target };
          if (input.skipped !== undefined) saved.skipped = input.skipped;
          if (input.price) {
            saved.priceCents = input.price.cents;
            saved.priceText = input.price.text;
          }
          sessionStorage.shopping = JSON.stringify([...data.filter(row => row.key !== input.key), saved]);
          return Response.json(saved);
        }
        return Response.json(data);
      }
      return Response.json(path === "/api/household-products" ? [] : {});
    };
  })()` });
  await call("Page.navigate", { url: `${BASE}/grocery-list` });
  const clickText = (label, selector = "button") => ev(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const hasText = value => `document.body.innerText.includes(${JSON.stringify(value)})`;
  await until(hasText("10 chicken thighs"), "shared protein quantity");
  await clickText("My Items");
  assert.equal(await ev(hasText("10 chicken thighs")), false);
  await ev(`document.querySelector('[aria-label="2 L milk"]').click()`);
  await until(hasText("Add groceries or household products"), "manual purchase hides item");
  await clickText("All Items");
  assert.equal(await ev(`document.querySelector("main").innerText.includes("2 L milk")`), false, "bought item leaves the list (the Undo notice outside main may still name it)");
  await ev(`document.querySelector('[aria-label="100 g Greek yogurt"]').click()`);
  const priceToggle = `document.querySelector('[data-testid="category-prices-meat-poultry"]')`;
  await ev(`${priceToggle}.click()`);
  await until(`${priceToggle}.textContent.trim() === "Unpriced"`, "subtotal replaces $");
  await ev(`${priceToggle}.click()`);
  await until(`${priceToggle}.textContent.trim() === "$"`, "second click restores $");
  const [x, y] = await ev(`(r => [r.x + r.width / 2, r.y + r.height / 2])(document.querySelector('[aria-label="Item actions · 10 chicken thighs"]').getBoundingClientRect())`);
  for (const type of ["mousePressed", "mouseReleased"]) await call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  await until(`!!document.querySelector('[data-testid="button-remove-item"]')`, "item menu");
  await ev(`document.querySelector('[data-testid="button-remove-item"]').click()`);
  await until(hasText("Remove 10 chicken thighs?"), "protein removal prompt");
  await ev(`[...document.querySelectorAll('[role="dialog"] label')].find(el => el.textContent.includes("Easy chicken curry")).querySelector("input").click()`);
  await until(hasText("Purchased items kept · 1"), "purchase preservation preview");
  await clickText("Remove item and selected meals");
  await until(hasText("4 chicken thighs"), "shared ingredient remains");
  assert.equal(await ev(hasText("2 tbsp curry paste")), false);
  assert.equal(await ev(hasText("1 kg onions")), true);
  await ev('document.querySelector(".grocery-category summary").click()');
  assert.equal(await ev(hasText("100 g greek yogurt")), true);
  await until(hasText("Meals removed"), "removal feedback");
  await clickText("Undo");
  await until(hasText("10 chicken thighs"), "meal undo restores demand");
  assert.equal(await ev(hasText("2 tbsp curry paste")), true);
  assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true);
  ws.close();
  console.log("Mobile grocery list, inline category prices, meal removal, purchased history, and Undo passed.");
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
