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
  await call("Page.enable"); await call("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('tablewise_guest_v1','1'); localStorage.getItem('tablewise_basic_settings') || localStorage.setItem('tablewise_basic_settings', JSON.stringify({ version: 2, rev: 1, setup: { status: 'skipped' } }))" }); // skip the first-visit sign-in screen
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
      sessionStorage.shopping = JSON.stringify([{ key: JSON.stringify([null, "chicken thighs"]), skipped: false, priceCents: 1249, priceText: "10 chicken thighs" }]);
      localStorage.setItem("tablewise_language", "en");
      // This week's approved dishes, one per day from Monday, each at the recipe's own yield.
      const day = offset => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + offset);
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
      const batches = recipes.map((recipe, index) => ({ id: "b" + index, recipeId: recipe.id, cookDate: day(index), serves: [{ date: day(index) }] }));
      localStorage.setItem("weeklyMealsState", JSON.stringify({ weekStart: day(0), selectedIds: recipes.map(recipe => recipe.id), batches, approved: batches }));
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
  const hasItem = value => `!!document.querySelector(${JSON.stringify(`main [aria-label="${value}"]`)})`; // rows show the name, then quantity
  const measureOf = name => ev(`[...document.querySelectorAll(".grocery-item")].find(li => li.querySelector(".grocery-ingredient")?.textContent === ${JSON.stringify(name)})?.querySelector('[data-testid="grocery-item-measure"]')?.textContent`);
  await until(hasItem("10 chicken thighs"), "shared protein quantity");
  assert.equal(await measureOf("chicken thighs"), "10", "prices are hidden by default");
  await clickText("From recipes");
  assert.equal(await ev(hasItem("10 chicken thighs")), true);
  assert.equal(await ev(hasItem("2 L milk")), false, "From recipes hides products added by hand");
  await clickText("Added by me");
  assert.equal(await ev(hasItem("10 chicken thighs")), false);
  await ev(`document.querySelector('[aria-label="2 L milk"]').click()`);
  await until(hasText("Add groceries or household products"), "manual purchase hides item");
  await clickText("All");
  assert.equal(await ev(`document.querySelector("main").innerText.includes("2 L milk")`), false, "bought item leaves the list (the Undo notice outside main may still name it)");
  await ev(`document.querySelector('[aria-label="100 g Greek yogurt"]').click()`);
  const priceToggle = `document.querySelector('[data-testid="category-prices-meat-poultry"]')`;
  const meat = `document.querySelector('[data-grocery-category="Meat & Poultry"]')`;
  await ev(`${meat}.querySelector('[data-testid="category-toggle-meat-poultry"]').click()`);
  await until(`!${meat}.querySelector("ul")`, "category collapses");
  await ev(`${priceToggle}.click()`);
  await until(`${priceToggle}.getAttribute("aria-pressed") === "true"`, "$ is pressed");
  assert.equal(await ev(`${priceToggle}.textContent.trim()`), "$");
  assert.equal(await ev(`!${meat}.querySelector("ul")`), true, "toggling prices keeps the category collapsed");
  await ev(`${meat}.querySelector('[data-testid="category-toggle-meat-poultry"]').click()`);
  await until(`!!${meat}.querySelector("ul")`, "category expands");
  const priceOf = name => ev(`[...document.querySelectorAll(".grocery-item")].find(li => li.querySelector(".grocery-ingredient")?.textContent === ${JSON.stringify(name)})?.querySelector('[data-testid="grocery-item-price"]')?.textContent`);
  assert.equal(await measureOf("chicken thighs"), "10", "quantity stays on its own");
  assert.equal(await priceOf("chicken thighs"), "$12.49", "price in the $ column");
  const [priceCenter, toggleCenter] = await ev(`[[...document.querySelectorAll(".grocery-item")].find(li => li.querySelector(".grocery-ingredient")?.textContent === "chicken thighs").querySelector('[data-testid="grocery-item-price"]'), ${priceToggle}].map(el => { const r = el.getBoundingClientRect(); return Math.round(r.x + r.width / 2); })`);
  assert.ok(Math.abs(priceCenter - toggleCenter) <= 1, "price is centred under $");
  assert.equal(await measureOf("onions"), "1500 g", "other categories stay unpriced");
  await ev(`document.querySelector('[data-testid="category-prices-produce"]').click()`);
  assert.equal(await measureOf("onions"), "1500 g", "missing price shows quantity only");
  assert.equal(await ev(hasText("Unpriced")), false);
  await ev(`${priceToggle}.click()`);
  await until(`${priceToggle}.getAttribute("aria-pressed") === "false"`, "second click turns prices off");
  assert.equal(await measureOf("chicken thighs"), "10");
  const [x, y] = await ev(`(r => [r.x + r.width / 2, r.y + r.height / 2])(document.querySelector('[aria-label="Item actions · 10 chicken thighs"]').getBoundingClientRect())`);
  const openMenu = async () => {
    for (const type of ["mousePressed", "mouseReleased"]) await call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await until(`!!document.querySelector('[data-testid="button-remove-item"]')`, "item menu");
  };
  // The note is a row menu action; its field keeps focus after the menu closes.
  await openMenu();
  await ev(`document.querySelector('[data-testid="button-item-note"]').click()`);
  await until(`document.activeElement?.dataset.testid === "input-item-note" && !document.querySelector('[role="menu"]')`, "note field keeps focus");
  await call("Input.insertText", { text: "organic" });
  await ev(`document.activeElement.blur()`);
  await until(hasText("organic"), "note saved under the item");
  await openMenu();
  assert.equal(await ev(`document.querySelector('[data-testid="button-item-note"]').textContent.trim()`), "Edit note");
  await ev(`document.querySelector('[data-testid="button-remove-item"]').click()`);
  await until(hasText("Remove 10 chicken thighs?"), "protein removal prompt");
  await ev(`[...document.querySelectorAll('[role="dialog"] label')].find(el => el.textContent.includes("Easy chicken curry")).querySelector("input").click()`);
  await until(hasText("Purchased items kept · 1"), "purchase preservation preview");
  await clickText("Remove item and selected meals");
  await until(hasItem("4 chicken thighs"), "shared ingredient remains");
  assert.equal(await ev(hasItem("2 tbsp curry paste")), false);
  assert.equal(await ev(hasItem("1 kg onions")), true);
  await ev('document.querySelector(".grocery-category summary").click()');
  assert.equal(await ev(hasText("100 g greek yogurt")), true);
  await until(hasText("Meals removed"), "removal feedback");
  await clickText("Undo");
  await until(hasItem("10 chicken thighs"), "meal undo restores demand");
  assert.equal(await ev(hasItem("2 tbsp curry paste")), true);
  assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true);
  ws.close();
  console.log("Mobile grocery list, per-category prices, meal removal, purchased history, and Undo passed.");
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
