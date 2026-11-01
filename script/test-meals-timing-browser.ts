import assert from "node:assert/strict";
import WebSocket from "ws";
import type { Recipe } from "../client/src/lib/storage";

async function main() {
  const base = process.argv.find(value => /^https?:\/\//.test(value));
  if (!base) throw new Error("Pass the isolated development preview origin.");
  const response = await fetch(`${base}/api/recipes`);
  assert.equal(response.status, 200);
  const recipes = await response.json() as Recipe[];
  const chicken = (recipes.find(recipe => recipe.id === "tablewise:dinner:v1:oven-baked-chicken")
    ?? recipes.find(recipe => recipe.id === "tablewise:real:v1:garlic-butter-chicken"))!;
  assert.ok(chicken, "Expected the original fixture or researched catalog.");
  const expectedPrep = chicken.id.startsWith("tablewise:real:") ? 5 : 10;
  const expectedCook = chicken.id.startsWith("tablewise:real:") ? 35 : 50;
  assert.equal(chicken.prepTime, expectedPrep);
  assert.equal(chicken.cookTime, expectedCook);
  const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let sequence = 0;
  let loads = 0;
  const errors: unknown[] = [];
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  ws.on("message", raw => {
    const message = JSON.parse(String(raw));
    if (message.method === "Page.loadEventFired") loads++;
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params);
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const call = (method: string, params = {}): Promise<any> => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async <T = any>(expression: string): Promise<T> => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error("Browser evaluation failed.");
    return result.result.value;
  };
  const element = (id: string) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
  const wait = async (expression: string) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  const click = async (id: string) => {
    await wait(`${element(id)} && !${element(id)}.disabled`);
    await evaluate(`${element(id)}.click()`);
  };
  const waitLoad = async (previous: number) => {
    for (let i = 0; i < 150 && loads <= previous; i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(loads > previous, "Page navigation must finish before testing its new document.");
  };
  const reload = async () => {
    const previous = loads;
    await call("Page.reload");
    await waitLoad(previous);
  };
  const navigate = async (path: string) => {
    const previous = loads;
    await call("Page.navigate", { url: `${base}${path}` });
    await waitLoad(previous);
    const requested = path.split("?")[0];
    const destination = requested === "/" || requested === "/plan" ? "/meals" : requested;
    await wait(`location.pathname === ${JSON.stringify(destination)} && document.readyState === 'complete'`);
  };
  const text = (id: string) => evaluate<string>(`${element(id)}?.textContent ?? ''`);
  try {
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate("/meals");
    await wait(element("meals-time-total"));
    await evaluate("localStorage.removeItem('weeklyMealsState'); localStorage.setItem('tablewise_language','en'); localStorage.setItem('tablewise:time-display:v1','cooking'); localStorage.setItem('week_locked_v1','false')");
    await reload();
    await wait(element(`recipe-card-${chicken.id}`));
    assert.equal(await evaluate("document.querySelectorAll('[data-testid^=\"recipe-card-\"]').length"), recipes.length);
    assert.ok((await text(`meals-catalog-facts-${chicken.id}`)).includes(`Total Time: ${expectedPrep + expectedCook} min`));
    assert.ok((await text(`meals-catalog-facts-${chicken.id}`)).includes(`Portions: ${chicken.servings}`));
    assert.ok((await text(`meals-catalog-tools-${chicken.id}`)).includes("Oven"));
    assert.equal((await text(`button-open-${chicken.id}`)).trim(), "See full recipe");
    await click(`button-open-${chicken.id}`);
    await wait(`location.pathname === ${JSON.stringify(`/recipe/${chicken.id}`)} && document.body.textContent.includes(${JSON.stringify(chicken.title)})`);
    await navigate("/meals");
    await wait(element(`recipe-card-${chicken.id}`));
    await click("meals-time-preparation");
    assert.ok((await text(`meals-catalog-facts-${chicken.id}`)).includes(`Preparation: ${expectedPrep} min`));
    await click("filter-time-20");
    assert.ok(await evaluate(`Boolean(${element(`recipe-card-${chicken.id}`)})`));
    assert.equal(await evaluate("document.querySelectorAll('[data-testid^=\"recipe-card-\"]').length"),
      recipes.filter(recipe => typeof recipe.prepTime === "number" && recipe.prepTime <= 20).length);
    await click("meals-time-total");
    assert.equal(await evaluate(`Boolean(${element(`recipe-card-${chicken.id}`)})`), false);
    await click("filter-time-any");
    await click(`button-add-${chicken.id}`);
    assert.equal((await text(`meals-selected-title-preparation-${chicken.id}`)).trim(), `Preparation: ${expectedPrep} min`);
    const saved = await evaluate<string>("localStorage.getItem('weeklyMealsState')");
    await click("meals-time-preparation");
    assert.equal((await text(`meals-selected-title-preparation-${chicken.id}`)).trim(), `Preparation: ${expectedPrep} min`);
    assert.ok((await text(`meals-selected-facts-${chicken.id}`)).includes(`Preparation: ${expectedPrep} min`));
    assert.equal(await evaluate("localStorage.getItem('weeklyMealsState')"), saved);
    await reload();
    await wait(element(`meals-selected-facts-${chicken.id}`));
    assert.equal(await evaluate(`${element("meals-time-preparation")}.getAttribute('aria-pressed')`), "true");
    assert.equal(await evaluate(`${element(`meals-show-selected-${chicken.id}`)}.getAttribute('href')`), `/recipe/${chicken.id}`);
    console.log("PASS real API/browser: verified preparation/total values, portions, explicit tools, recipe navigation, stage-aware filters, preference persistence and saved-state preservation.");

    const other = recipes.find(recipe => recipe.id !== chicken.id)!;
    await click(`button-add-${other.id}`);
    // Fixture only: load a saved calendar assignment. This does not verify mouse drag behavior.
    await evaluate(`{const state=JSON.parse(localStorage.getItem('weeklyMealsState'));state.planAssignments=[{recipeId:${JSON.stringify(chicken.id)},mealType:'Dinner',startDay:0,spanDays:1}];localStorage.setItem('weeklyMealsState',JSON.stringify(state));}`);
    await reload();
    await wait(element(`meals-selected-facts-${chicken.id}`));
    await click("button-generate-plan");
    await wait(element(`meals-plan-Dinner-0-facts-${chicken.id}`));
    assert.ok((await text(`meals-plan-Dinner-0-facts-${chicken.id}`)).includes(`Preparation: ${expectedPrep} min`));
    assert.ok((await text(`meals-tray-facts-${chicken.id}`)).includes(`Preparation: ${expectedPrep} min`));
    assert.ok((await text(`meals-suggestion-facts-${other.id}`)).includes(`Portions: ${other.servings}`));
    const assigned = await evaluate<string>("localStorage.getItem('weeklyMealsState')");
    await click("meals-time-total");
    assert.ok((await text(`meals-plan-Dinner-0-facts-${chicken.id}`)).includes(`Total Time: ${expectedPrep + expectedCook} min`));
    assert.equal(await evaluate(`${element(`meals-show-plan-Dinner-0-${chicken.id}`)}.getAttribute('href')`), `/recipe/${chicken.id}`);
    assert.ok((await text(`meals-plan-Dinner-0-tools-${chicken.id}`)).includes("Oven"));
    assert.equal(await evaluate("localStorage.getItem('weeklyMealsState')"), assigned);
    console.log("PASS browser/saved-plan fixture: sidebar, tray and assigned calendar cells show matching portions/times; switching time does not alter assignments. Mouse dragging is not verified.");

    for (const width of [320, 390]) {
      await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Calendar must not overflow the page.");
    }
    await navigate("/");
    await wait("location.pathname === '/meals'");
    const beforeNutritionToggle = await evaluate("JSON.stringify(Object.entries(localStorage).filter(([key]) => key !== 'tablewise:nutrition-details:v1').sort())");
    await click("nutrition-details-toggle");
    await click("nutrition-details-toggle");
    assert.equal(await evaluate("JSON.stringify(Object.entries(localStorage).filter(([key]) => key !== 'tablewise:nutrition-details:v1').sort())"), beforeNutritionToggle,
      "Changing display preference must preserve saved plans, dates, filters and recipe metadata.");
    await click("meals-time-preparation");
    await navigate("/meals");
    await wait(element("meals-time-preparation"));
    assert.equal(await evaluate(`${element("meals-time-preparation")}.getAttribute('aria-pressed')`), "true");
    for (const [language, label, direction] of [["ru", "Подготовка", "ltr"], ["he", "הכנה", "rtl"]]) {
      await evaluate(`localStorage.setItem('tablewise_language',${JSON.stringify(language)})`);
      await reload();
      await wait(`${element("meals-time-preparation")}?.textContent.trim() === ${JSON.stringify(label)}`);
      assert.equal(await evaluate("document.documentElement.dir"), direction);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Selection must not overflow the page.");
    }
    console.log("PASS real browser: home redirects to meals with persistent time preference, 320/390px calendar, Russian/Hebrew selection rendering.");

    assert.equal(errors.length, 0);
    console.log("PASS real browser: no runtime exceptions. Missing/zero normalization is covered separately by the meals timing unit tests, not by browser API fixtures.");
  } finally {
    ws.close();
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.stack : "Meals timing browser verification failed.");
  process.exitCode = 1;
});
