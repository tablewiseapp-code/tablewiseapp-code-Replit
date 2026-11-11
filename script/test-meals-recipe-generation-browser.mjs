// Browser test: AI recipe generation on the real /meals page.
// OpenAI is never called and nothing is written: Chrome's Fetch interception answers
// POST /api/recipes/generate, POST /api/recipes and the event endpoint; GET /api/recipes is the real list plus accepted recipes.
// Usage: node script/test-meals-recipe-generation-browser.mjs   (BASE_URL, CHROME_PATH optional; Node 22+)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5001";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "tw-generate-"));
const port = 9950 + Math.floor(Math.random() * 40);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const generated = (title) => ({
  description: "Crisp chicken with lemon.",
  recipe: {
    title, servings: "4", prepTime: 15, cookTime: 18, tags: ["ai-generated", "meal:dinner", "glutenFree"],
    ingredients: ["600 g chicken thighs", "2 tbsp tamari", "1 lemon"],
    steps: ["Toss the chicken with tamari.", "Cook in the air fryer at 200°C for 18 minutes.", "Squeeze lemon over to serve."],
  },
});

try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let n = 0; const waiting = {};
  const generateBodies = [], saves = [], events = [], saved = [];
  let generateReplies = [];
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
      generateBodies.push(JSON.parse(request.postData));
      const [status, body] = generateReplies.shift() ?? [200, generated("Air fryer lemon chicken")];
      return fulfill(requestId, status, body);
    }
    if (path === "/api/recipes/generate/events") { events.push(JSON.parse(request.postData).name); return fulfill(requestId, 204); }
    if (path === "/api/recipes" && request.method === "POST") {
      const body = JSON.parse(request.postData); saves.push(body);
      const row = { ...body, id: `ai-test-${saves.length}`, image: null, sourceUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      saved.push(row); return fulfill(requestId, 201, row);
    }
    if (path === "/api/recipes" && request.method === "GET") {
      const real = await (await fetch(`${BASE}/api/recipes`)).json();
      return fulfill(requestId, 200, [...real, ...saved]);
    }
    return call("Fetch.continueRequest", { requestId });
  };
  const ev = async e => { const r = (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result; if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, what) => { for (let i = 0; i < 120; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(120); } throw new Error(`timeout: ${what}; page: ${String(await ev("document.body.innerText")).slice(0, 300).replace(/\n/g, " | ")}`); };
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const click = id => ev(`${el(id)}.click()`);
  const text = id => ev(`${el(id)}?.textContent ?? null`);
  const dialogOpen = () => ev(`Boolean(${el("generate-recipe-dialog")})`);

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: BASE }); await sleep(1500);
  const state = { filters: { maxMinutes: 30, dietary: ["Gluten-free"], mealType: ["Dinner"], cookingMethod: ["Air fryer"], source: [], proteinType: [],
    withNotes: false, modifiedByMe: false, myPicks: true, minRating: null, servings: null, mustInclude: [], mustExclude: [] },
    selectedIds: [], expandedSections: ["time", "dietary"], showMoreFilters: false, planAssignments: [] };
  await ev(`localStorage.clear(); localStorage.setItem('tablewise_language','en'); localStorage.setItem('tablewise:time-display:v1','preparation');
    localStorage.setItem('weeklyMealsState', ${JSON.stringify(JSON.stringify(state))})`);
  await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/recipes*", requestStage: "Request" }] });
  await call("Page.navigate", { url: `${BASE}/meals` });

  // Empty state replaces the old message; active filters shown as chips; personal filter reported, not sent.
  await until(el("generate-recipe-empty"), "empty state");
  assert.match(await text("mvp-no-matches"), /Can't find the right meal\?.*Generate a recipe based on your selected filters\./);
  const chips = await text("generate-recipe-chips");
  for (const label of ["Gluten-free", "Dinner", "Air fryer", "≤ 30"]) assert.ok(chips.includes(label), `chip ${label}: ${chips}`);
  assert.match(await text("generate-recipe-not-applied"), /Not used for AI recipes: .*My Picks/i);

  // Repeated clicks send one request; a failure shows a friendly retry and keeps the filters.
  generateReplies = [[504, { error: "Recipe generation took too long. Please try again.", retryable: true }]];
  await ev(`${el("generate-recipe-empty")}.click(); ${el("generate-recipe-empty")}.click();`);
  await until(el("generate-recipe-error"), "error state");
  assert.equal(generateBodies.length, 1, "double click sends one request");
  assert.deepEqual(generateBodies[0], { filterSet: "meals", timeMode: "preparation", filters: {
    maxMinutes: 30, dietary: ["Gluten-free"], mealType: ["Dinner"], cookingMethod: ["Air fryer"], proteinType: [], servings: null, mustInclude: [], mustExclude: [] } });
  assert.match(await text("generate-recipe-error"), /took too long/);
  await click("generate-recipe-retry");
  await until(el("generate-recipe-preview"), "preview after retry");
  const preview = await text("generate-recipe-preview");
  for (const part of ["Air fryer lemon chicken", "600 g chicken thighs", "Cook in the air fryer", "AI-generated recipe"]) assert.ok(preview.includes(part), part);

  // Cancel saves nothing.
  await click("generate-recipe-cancel");
  await until(`!${el("generate-recipe-dialog")}`, "dialog closes");
  assert.equal(saves.length, 0); assert.deepEqual(events, ["generated_recipe_rejected"]);
  assert.ok((await text("generate-recipe-chips")).includes("Air fryer"), "filters kept after cancelling");

  // A recipe that misses filters is still shown, with each miss named, and can be added anyway.
  generateReplies = [[200, { ...generated("Pan lemon chicken"), violations: [{ filter: "cookingMethod", value: "Air fryer" }, { filter: "maxMinutes", value: "30" }] }]];
  await click("generate-recipe-empty"); await until(el("generate-recipe-violations"), "violations shown");
  const missText = await text("generate-recipe-violations");
  assert.match(missText, /doesn't meet all your filters/); assert.ok(missText.includes("Air fryer") && missText.includes("≤ 30"), missText);
  assert.ok((await text("generate-recipe-preview")).includes("Pan lemon chicken"), "the generated recipe is shown");
  assert.equal((await text("generate-recipe-accept")).trim(), "Add anyway");
  await click("generate-recipe-cancel"); await until(`!${el("generate-recipe-dialog")}`, "closed");
  events.length = 0; generateBodies.length = 0;

  // Generate another, then accept: saved through POST /api/recipes and added to the selection.
  generateReplies = [[200, generated("First idea")], [200, generated("Air fryer lemon chicken")]];
  await click("generate-recipe-empty"); await until(el("generate-recipe-preview"), "first preview");
  assert.ok((await text("generate-recipe-preview")).includes("First idea"));
  await click("generate-recipe-another"); await sleep(300); await until(`${el("generate-recipe-preview")}?.textContent.includes("Air fryer lemon chicken")`, "second preview");
  assert.equal(generateBodies.length, 2);
  await click("generate-recipe-accept");
  await until(`!${el("generate-recipe-dialog")}`, "accepted");
  assert.equal(saves.length, 1); assert.equal(saves[0].title, "Air fryer lemon chicken");
  assert.deepEqual(saves[0].ingredients, generated("x").recipe.ingredients);
  assert.ok(saves[0].tags.includes("ai-generated") && !("sourceUrl" in saves[0]), "provenance kept, no source URL");
  assert.deepEqual(events, ["generated_recipe_rejected", "generated_recipe_accepted"]);
  await until(el("selected-recipe-ai-test-1"), "added to the selection");
  assert.deepEqual(JSON.parse(await ev("localStorage.getItem('weeklyMealsState')")).selectedIds, ["ai-test-1"]);

  // Existing recipes keep working: clearing filters shows the catalog again and the secondary action.
  await click("button-clear-filters");
  await until(`document.querySelectorAll('[data-testid^="recipe-card-"]').length >= 10`, "catalog back");
  assert.equal(await ev(`Boolean(${el("generate-recipe")})`), true, "secondary action is available when recipes match");
  assert.ok(await ev("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll");

  // Plan it: the planner's normal flow; the added-to-plan signal fires (not 'cooked').
  await click("button-generate-plan");
  await until(el("plan-recipe-ai-test-1"), "planner board");
  await click("plan-recipe-ai-test-1"); await until(el("button-confirm-plan"), "plan dialog");
  await click("plan-day-2"); await click("plan-meal-Dinner"); await click("button-confirm-plan");
  await until(`JSON.parse(localStorage.getItem('weeklyMealsState')).planAssignments.some(a => a.recipeId === 'ai-test-1')`, "assignment saved");
  for (let i = 0; i < 20 && !events.includes("generated_recipe_added_to_plan"); i++) await sleep(100);
  assert.ok(events.includes("generated_recipe_added_to_plan"));
  assert.ok(!events.some(name => /cook/.test(name)));

  // Grocery list: the accepted recipe's ingredients appear.
  await call("Page.navigate", { url: `${BASE}/grocery-list` });
  await until(`document.body.innerText.includes("600 g chicken thighs")`, "grocery list shows generated ingredients");
  assert.ok(await ev(`document.body.innerText.includes("2 tbsp tamari")`));
  assert.ok(await ev(`document.body.innerText.includes("Air fryer lemon chicken")`), "grocery item credits the recipe");
  console.log("PASS meals AI generation browser: empty state + chips + not-applied note, one request on double click, retry after failure with filters kept, preview, cancel saves nothing, filter misses shown with Add anyway, generate another, accept saves via the recipe API and joins the selection, catalog still works, planner assignment + added-to-plan signal, grocery list shows the ingredients, no horizontal scroll at 390px. OpenAI mocked; no writes.");
} finally {
  chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
