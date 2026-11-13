// Browser test: My Ideas (/my-ideas) end to end. OpenAI is never called and nothing is written server-side:
// Chrome's Fetch interception answers POST /api/recipes/generate and POST /api/recipes.
// Usage: node script/test-my-ideas-browser.mjs   (BASE_URL, CHROME_PATH, SHOTS_DIR optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS_DIR;
const profile = mkdtempSync(join(tmpdir(), "tw-ideas-"));
const port = 9900 + Math.floor(Math.random() * 40);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const generated = (title, style = "quick_easy") => ({
  description: "Crisp chicken and potatoes from one pan.", tip: "Dry the chicken well for a crisp skin.",
  meta: { generationRequestId: `req-${title}`, model: "test-model", promptVersion: "recipe-generation/3", style, budget: "everyday" },
  recipe: {
    title, servings: "5", prepTime: 10, cookTime: 30, tags: ["ai-generated", "meal:dinner", "glutenFree"],
    ingredients: ["900 g boneless chicken thighs", "800 g potatoes", "3 tbsp olive oil", "4 garlic cloves"],
    steps: ["Preheat the oven to 220°C.", "Roast the potatoes in the oven for 10 minutes.", "Add the chicken and roast until it reaches 75°C inside."],
  },
});

try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {};
  const bodies = [], saves = [];
  let replies = [];
  const call = (method, params = {}) => new Promise(r => { const i = ++n; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const fulfill = (requestId, status, body) => call("Fetch.fulfillRequest", {
    requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(body === undefined ? "" : JSON.stringify(body)).toString("base64"),
  });
  ws.onmessage = async m => {
    const d = JSON.parse(m.data);
    if (d.id) return waiting[d.id]?.(d);
    if (d.method !== "Fetch.requestPaused") return;
    const { requestId, request } = d.params;
    const path = new URL(request.url).pathname;
    if (path === "/api/recipes/generate" && request.method === "POST") {
      bodies.push(JSON.parse(request.postData));
      await sleep(300); // long enough for a double click to land during loading
      const [status, body] = replies.shift() ?? [200, generated("One-Pan Garlic Chicken & Potatoes")];
      return fulfill(requestId, status, body);
    }
    if (path === "/api/recipes" && request.method === "POST") {
      const body = JSON.parse(request.postData); saves.push(body);
      return fulfill(requestId, 201, { ...body, id: `ai-test-${saves.length}`, image: null, sourceUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    return call("Fetch.continueRequest", { requestId });
  };
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 120; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(120); } throw new Error(`timeout: ${what}; page: ${String(await ev("document.body.innerText")).slice(0, 300).replace(/\n/g, " | ")}`); };
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const click = id => ev(`${el(id)}.click()`);
  const text = id => ev(`${el(id)}?.textContent ?? null`);
  const ideas = () => ev(`JSON.parse(localStorage.getItem('tablewise:my-ideas:v1') ?? '[]')`);
  const shot = async name => {
    if (!SHOTS) return;
    await sleep(400);
    const { result } = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, "base64"));
  };
  const setInput = (id, value) => ev(`(() => { const i = ${el(id)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','en')`);
  await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/recipes*", requestStage: "Request" }] });
  await call("Page.navigate", { url: `${BASE}/my-ideas` });

  // 1. Route, navigation and empty state.
  await until(el("my-ideas-empty"), "empty state");
  assert.match(await text("my-ideas-empty"), /Your next favorite recipe starts here.*Create a recipe that fits your taste, time, and cooking style\./);
  assert.ok(await ev(`[...document.querySelectorAll('a[href="/my-ideas"]')].some(a => a.textContent.includes('My Ideas'))`), "nav link");
  await shot("1-empty");

  // 2. Panel: Meals filters + one style, Surprise me by default; no free text.
  await click("button-create-first-idea");
  await until(el("new-idea-panel"), "panel");
  assert.equal(await ev(`${el("style-surprise_me")}.getAttribute('aria-checked')`), "true");
  assert.equal(await ev(`document.querySelectorAll('[data-testid="new-idea-panel"] textarea, [data-testid="new-idea-panel"] input[type=text]').length`), 0);
  await click("style-quick_easy");
  assert.equal(await ev(`[...document.querySelectorAll('[role=radio][aria-checked=true]')].length`), 1, "single style");
  await click("new-idea-filters-time-30"); await click("new-idea-filters-cookingMethod-oven"); await click("new-idea-filters-dietary-gluten-free"); await click("new-idea-filters-mealType-dinner");
  await shot("2-panel");

  // 3. Failure keeps choices; double click sends one request; body = canonical filters + style + default budget.
  replies = [[504, { error: "Recipe generation took too long. Please try again.", retryable: true }]];
  await ev(`${el("button-create-recipe")}.click(); setTimeout(() => ${el("button-create-recipe")}?.click(), 0)`);
  await until(el("new-idea-loading"), "loading");
  assert.match(await text("new-idea-loading"), /Creating something delicious/);
  await until(el("new-idea-error"), "error");
  assert.equal(bodies.length, 1, "one request");
  assert.deepEqual(bodies[0], { filterSet: "meals", timeMode: "preparation", style: "quick_easy", budget: "everyday",
    filters: { maxMinutes: 30, dietary: ["Gluten-free"], mealType: ["Dinner"], cookingMethod: ["Oven"], proteinType: [], servings: null, mustInclude: [], mustExclude: [] } });
  assert.match(await text("new-idea-error"), /We couldn't create your recipe\. Please try again\./);
  await click("button-new-idea-retry");
  await until(el("new-idea-preview"), "preview");
  assert.deepEqual(bodies[1].filters, bodies[0].filters, "retry keeps filters"); assert.equal(bodies[1].style, "quick_easy");
  const preview = await text("new-idea-preview");
  for (const part of ["One-Pan Garlic Chicken & Potatoes", "900 g boneless chicken thighs", "220°C", "Total: 40", "Dry the chicken well"]) assert.ok(preview.includes(part), part);
  await shot("3-preview");

  // 4. Saved immediately; Try another adds a second record; Favorite persists.
  assert.equal((await ideas()).length, 1);
  replies = [[200, generated("Herby Sheet-Pan Salmon")]];
  await click("button-new-idea-another");
  await until(`${el("new-idea-preview")}?.textContent.includes("Herby Sheet-Pan Salmon")`, "second preview");
  let stored = await ideas();
  assert.deepEqual(stored.map(i => i.recipe.title), ["Herby Sheet-Pan Salmon", "One-Pan Garlic Chicken & Potatoes"], "regeneration never overwrites");
  assert.equal(stored[0].style, "quick_easy"); assert.equal(stored[0].promptVersion, "recipe-generation/3");
  await click("button-new-idea-favorite");
  assert.equal((await ideas())[0].isFavorite, true);
  await click("button-new-idea-close");
  await until(`!${el("new-idea-panel")}`, "panel closed");
  assert.equal(saves.length, 0, "nothing in My Recipes until planned");

  // 5. Collection: persists after refresh; tabs, search, no-match state.
  await call("Page.reload"); await until(el("button-new-idea"), "reloaded");
  assert.equal(await ev(`document.querySelectorAll('[data-testid^="card-idea-"]').length`), 2);
  assert.ok((await ev(`document.body.innerText`)).includes("Prep 10 min · Total 40 min · Oven"));
  await click("my-ideas-filter-favorites");
  assert.equal(await ev(`document.querySelectorAll('[data-testid^="card-idea-"]').length`), 1);
  await click("my-ideas-filter-all");
  await setInput("input-idea-search", "salmon");
  await until(`document.querySelectorAll('[data-testid^="card-idea-"]').length === 1`, "search by title");
  await setInput("input-idea-search", "pizza");
  await until(el("my-ideas-no-matches"), "no matches");
  assert.match(await text("my-ideas-no-matches"), /No ideas match these filters\..*Clear filters.*Create new idea/);
  await shot("4-no-matches");
  await click("button-clear-idea-filters");
  await until(`document.querySelectorAll('[data-testid^="card-idea-"]').length === 2`, "cleared");
  await shot("5-collection");

  // 6. Add to week: saved once as a regular recipe (planner + grocery list), then the existing planner dialog.
  await ev(`document.querySelector('[data-testid^="card-idea-"] [data-testid="button-idea-add-to-plan"]').click()`);
  await until(el("add-to-plan-dialog"), "planner dialog");
  assert.equal(saves.length, 1); assert.deepEqual(saves[0].ingredients, generated("x").recipe.ingredients);
  assert.ok(saves[0].tags.includes("ai-generated"));
  await click("button-confirm-add-to-plan");
  await until(el("add-to-plan-success"), "added");
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await until(el("badge-idea-planned"), "planned badge");
  await click("my-ideas-filter-inPlan");
  assert.equal(await ev(`document.querySelectorAll('[data-testid^="card-idea-"]').length`), 1);

  // 7. Mobile: the panel is a full-screen sheet.
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await click("button-new-idea"); await until(el("new-idea-panel"), "mobile panel");
  assert.equal(await ev(`Math.round(${el("new-idea-panel")}.getBoundingClientRect().width)`), 390);
  await shot("6-mobile-panel");

  console.log("PASS my ideas browser: empty state, panel filters + single style, loading/error/retry, one request, canonical body with default budget, preview with tip, saved on generation, regenerate without overwrite, favorite, refresh persistence, tabs, search, no-match reset, add to week via existing planner, mobile full-screen sheet.");
} finally {
  chrome.kill();
  await sleep(300); try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chrome still closing */ }
}
