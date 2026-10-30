import assert from "node:assert/strict";
import WebSocket from "ws";
import { writeFile } from "node:fs/promises";
import { buildGroceries } from "../client/src/lib/grocery-engine";
import { planKey, checkKey, plannerRecipeURL, currentWeek, type WeekPlan } from "../client/src/lib/week-plan";
import type { Recipe } from "../client/src/lib/storage";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { pilotJournalKey } from "../client/src/lib/pilot-analytics";

// Existing Chromium + CDP + ws; no extra browser-test dependencies.
// Uses one NEW test tab, real read-only APIs and browser-only fault injection.
async function main() {
  const base = process.argv.slice(2).find(argument => /^https?:\/\//.test(argument));
  if (!base || !/^https?:\/\//.test(base)) throw new Error("Pass the isolated development preview origin.");
  const api = await fetch(`${base}/api/recipes`);
  assert.equal(api.status, 200);
  const recipes = await api.json() as Recipe[];
  assert.ok(recipes.length >= 4);
  const analyticsPool = process.argv.includes("--analytics") ? await openLocalTestDatabase(testSocketArgument()) : undefined;
  const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json() as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let sequence = 0;
  let loads = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
  const exceptions: string[] = [];
  ws.on("message", data => {
    const message = JSON.parse(data.toString());
    if (message.method === "Page.loadEventFired") loads++;
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timeout);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  });
  function call(method: string, params: object = {}): Promise<any> {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression: string) {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 100; i++) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* navigation changes execution context */ }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error(`Browser condition not met: ${expression}`);
  }
  const selector = (id: string) => `[data-testid=${JSON.stringify(id)}]`;
  const element = (id: string) => `document.querySelector(${JSON.stringify(selector(id))})`;
  async function click(id: string) {
    await wait(`${element(id)} && !${element(id)}.disabled`);
    await evaluate(`${element(id)}.click()`);
  }
  async function select(id: string, value: string) {
    await wait(`${element(id)} && !${element(id)}.disabled`);
    await evaluate(`{ const control=${element(id)}; control.value=${JSON.stringify(value)}; control.dispatchEvent(new Event('change',{bubbles:true})); }`);
  }
  const week = "2026-10-19";
  const planStorage = planKey(week), checkStorage = checkKey(week);
  const raw = (key: string) => evaluate(`localStorage.getItem(${JSON.stringify(key)})`) as Promise<string | null>;
  const plan = async () => JSON.parse((await raw(planStorage))!) as WeekPlan;
  async function waitLoad(previous: number) {
    for (let i = 0; i < 100 && loads <= previous; i++) await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(loads > previous, "Browser navigation must finish.");
  }
  async function reload() {
    const previous = loads;
    await call("Page.reload");
    await waitLoad(previous);
  }
  async function navigate(path: string) {
    const previous = loads;
    await call("Page.navigate", { url: `${base}${path}` });
    await waitLoad(previous);
    await wait(`location.pathname === ${JSON.stringify(path.split("?")[0])} && document.readyState==='complete'`);
  }
  async function readyGroceries() {
    await wait(`${element("mvp-grocery")} && document.querySelectorAll('[data-testid=\"mvp-grocery-item\"]').length > 0 && ${element("mvp-check-0")} && !${element("mvp-check-0")}.disabled`);
  }
  async function fault(status: number, body: unknown, path = "/api/recipes") {
    const source = `(() => { const original=window.fetch; window.__restoreCatalog=()=>{window.fetch=original;}; window.fetch=(input,init)=>{const url=typeof input==='string'?input:input.url;if(new URL(url,location.origin).pathname===${JSON.stringify(path)}) return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(body))},{status:${status},headers:{'Content-Type':'application/json'}}));return original(input,init);}; })();`;
    return (await call("Page.addScriptToEvaluateOnNewDocument", { source })).identifier as string;
  }
  async function removeFault(identifier: string) {
    await call("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    await evaluate(`window.__restoreCatalog?.()`);
  }
  try {
    await call("Page.enable"); await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    if (process.argv.includes("--planner-return-only")) {
      // Browser-only API mocks: this branch never sends mutations or analytics
      // to the application. Run Chromium with a disposable profile.
      const source = `(() => {
        const recipes=${JSON.stringify(recipes)};
        const original=window.fetch;
        window.fetch=(input,init)=>{
          const url=new URL(typeof input==='string'?input:input.url,location.origin);
          if (!url.pathname.startsWith('/api/')) return original(input,init);
          const method=init?.method || input?.method || 'GET';
          if (method!=='GET') return Promise.resolve(new Response('{}',{status:200}));
          const recipe=recipes.find(item=>item.id===decodeURIComponent(url.pathname.slice('/api/recipes/'.length)));
          const body=url.pathname==='/api/recipes'?recipes:recipe || {error:'Recipe not found'};
          return Promise.resolve(new Response(JSON.stringify(body),{status:url.pathname==='/api/recipes'||recipe?200:404,headers:{'Content-Type':'application/json'}}));
        };
      })();`;
      await call("Page.addScriptToEvaluateOnNewDocument", { source });
      const salmon = recipes.find(recipe => recipe.id === "tablewise:real:v1:salmon-egg-fried-rice");
      assert.ok(salmon, "The researched salmon egg-fried rice recipe must be exercised.");
      const chosen = [salmon, ...recipes.filter(recipe => recipe.id !== salmon.id)].slice(0, 3);
      await navigate(`/plan?week=${week}`);
      await evaluate(`localStorage.setItem('tablewise_language','en'); localStorage.removeItem(${JSON.stringify(planStorage)});`);
      await reload();
      for (let index = 0; index < chosen.length; index++) {
        await click(`mvp-choose-${chosen[index].id}`);
        await select(`mvp-day-${chosen[index].id}`, `2026-10-${19 + index}`);
      }
      await click("mvp-confirm");
      await wait(element("mvp-view-grocery"));
      const saved = await raw(planStorage);
      assert.equal((await plan()).confirmed, true);
      // Round-trip from available AND selected dishes, retaining confirmation,
      // all dates and selected IDs byte-for-byte, even after detail reload.
      for (const context of ["catalog", "selected"]) {
        const id: string = `mvp-show-${context}-${salmon.id}`;
        assert.equal(await evaluate(`${element(id)}.getAttribute('href')`), plannerRecipeURL(salmon.id, week));
        await click(id);
        await wait(element("text-recipe-title"));
        assert.equal(await evaluate(`${element("text-recipe-title")}.textContent.trim()`), salmon.title);
        await reload();
        await wait(element("link-back-to-planner"));
        assert.equal(await evaluate(`${element("link-back-to-planner")}.getAttribute('href')`), `/plan?week=${week}`);
        assert.equal(await evaluate(`${element("link-back")}.getAttribute('href')`), "/recipes");
        await click("link-back-to-planner");
        await wait(`${element("mvp-week")}?.getAttribute('datetime')===${JSON.stringify(week)} && ${element("mvp-view-grocery")}`);
        assert.equal(await raw(planStorage), saved);
      }
      const labels = {
        en: ["← Back to planner", "← Back to recipes"],
        ru: ["← Назад к плану", "← Назад к рецептам"],
        he: ["→ חזרה למתכנן", "← חזרה למתכונים"],
      };
      for (const lang of ["en", "ru", "he"] as const) {
        await evaluate(`localStorage.setItem('tablewise_language',${JSON.stringify(lang)})`);
        for (const width of [320, 390, 1280]) {
          await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
          for (const missing of [false, true]) {
            await navigate(plannerRecipeURL(missing ? "missing-recipe-for-test" : salmon.id, week));
            const legacyId = missing ? "link-back-to-recipes" : "link-back";
            await wait(element(legacyId));
            assert.equal(await evaluate("document.documentElement.dir"), lang === "he" ? "rtl" : "ltr");
            for (const [index, id] of ["link-back-to-planner", legacyId].entries()) {
              assert.equal(await evaluate(`${element(id)}.textContent.trim()`), labels[lang][index]);
              assert.ok(await evaluate(`{const r=${element(id)}.getBoundingClientRect(); r.width>0 && r.height>=44 && r.left>=0 && r.right<=innerWidth+1}`), `${lang} ${width}px ${id} visible and touch accessible`);
            }
            assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
            await click(legacyId);
            await wait(`location.pathname==='/recipes'`);
            await wait("document.querySelector('[data-testid=\"text-recipes-title\"]') || document.body.textContent.includes(" + JSON.stringify(salmon.title) + ")");
            assert.equal(await raw(planStorage), saved);
          }
        }
      }
      for (const query of ["", "?week=2026-10-20", "?week=2026-02-30", "?week=2026-10-19&week=2026-10-26", "?returnTo=https://evil.test"]) {
        for (const id of [salmon.id, "missing-recipe-for-test"]) {
          await navigate(`/recipe/${encodeURIComponent(id)}${query}`);
          await wait(element("link-back-to-planner"));
          assert.equal(await evaluate(`${element("link-back-to-planner")}.getAttribute('href')`), "/plan");
          await click("link-back-to-planner");
          await wait(`${element("mvp-week")}?.getAttribute('datetime')===${JSON.stringify(currentWeek())}`);
          assert.equal(await raw(planStorage), saved);
        }
      }
      assert.deepEqual(exceptions, []);
      console.log("PASS mocked browser: available/selected round trips preserve non-default week, three saved dinners, dates and confirmation through reload; direct and missing recipes safely return to /plan; legacy links open /recipes; English/Russian/Hebrew at 320/390/1280px; no runtime exceptions or application database writes.");
      return;
    }
    if (process.argv.includes("--rtl-only")) {
      await navigate(`/grocery-list?source=mvp&week=${week}`);
      await evaluate("localStorage.setItem('tablewise_language','he')");
      await reload(); await readyGroceries();
      assert.equal(await evaluate("document.documentElement.dir"), "rtl");
      assert.equal(await evaluate(`getComputedStyle(${element("mvp-quantity-0")}).direction`), "ltr");
      const expected = buildGroceries(await plan(), recipes);
      for (let index = 0; index < expected.items.length; index++) {
        assert.equal(await evaluate(`${element(`mvp-quantity-${index}`)}.textContent`), expected.items[index].text);
      }
      assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"));
      const image = await call("Page.captureScreenshot", { format: "png" });
      await writeFile("/tmp/tablewise-mvp-grocery-rtl.png", Buffer.from(image.data, "base64"));
      console.log("PASS targeted RTL: English ingredient quantities use isolated LTR direction in Hebrew layout; every displayed quantity matches the actual grocery result; no horizontal overflow.");
      return;
    }
    await navigate(`/plan?week=${week}`);
    // Only this brand-new tab's weeks are modified; no user contexts touched.
    await evaluate(`localStorage.setItem('tablewise_language','en'); localStorage.setItem('tablewise:time-display:v1','cooking'); localStorage.removeItem(${JSON.stringify(planStorage)}); localStorage.removeItem(${JSON.stringify(checkStorage)});`);
    if (analyticsPool) {
      await evaluate(`localStorage.removeItem(${JSON.stringify(pilotJournalKey)}); localStorage.removeItem(${JSON.stringify(planKey("2026-10-26"))}); localStorage.removeItem(${JSON.stringify(checkKey("2026-10-26"))});`);
    }
    await reload();
    await wait(`${element(`mvp-choose-${recipes[0].id}`)} && !${element(`mvp-choose-${recipes[0].id}`)}.disabled`);
    assert.equal(await evaluate(`${element("mvp-selected-heading")}.textContent`), "Choose when you want to eat each meal");
    const recipeLink = `mvp-show-catalog-${recipes[0].id}`;
    assert.equal(await evaluate(`${element(recipeLink)}.textContent.trim()`), "See full recipe");
    await click(recipeLink);
    await wait(`location.pathname === ${JSON.stringify(`/recipe/${recipes[0].id}`)} && document.body.textContent.includes(${JSON.stringify(recipes[0].title)})`);
    await click("link-back-to-planner");
    await wait(`${element("mvp-week")}?.getAttribute('datetime')===${JSON.stringify(week)}`);
    await wait(element(`mvp-choose-${recipes[0].id}`));
    for (const recipe of recipes) {
      const facts = await evaluate(`${element(`mvp-catalog-facts-${recipe.id}`)}.textContent`) as string;
      assert.ok(facts.includes(recipe.servings ? `Portions: ${recipe.servings}` : "Portions not specified"));
      assert.ok(facts.includes(recipe.prepTime == null || recipe.cookTime == null ? "Total time not specified" : `Total Time: ${recipe.prepTime + recipe.cookTime} min`));
    }
    for (let i = 0; i < 3; i++) await click(`mvp-choose-${recipes[i].id}`);
    for (const recipe of recipes.slice(0, 3)) {
      const facts = await evaluate(`${element(`mvp-selected-facts-${recipe.id}`)}.textContent`) as string;
      assert.ok(facts.includes(recipe.servings ? `Portions: ${recipe.servings}` : "Portions not specified"));
      assert.ok(facts.includes(recipe.prepTime == null || recipe.cookTime == null ? "Total time not specified" : `Total Time: ${recipe.prepTime + recipe.cookTime} min`));
      assert.equal(await evaluate(`${element(`mvp-show-selected-${recipe.id}`)}.getAttribute('href')`), plannerRecipeURL(recipe.id, week));
    }
    const beforeDetail = await raw(planStorage);
    await click(`mvp-show-selected-${recipes[0].id}`);
    await wait(`location.pathname === ${JSON.stringify(`/recipe/${recipes[0].id}`)} && document.body.textContent.includes(${JSON.stringify(recipes[0].title)})`);
    await click("link-back-to-planner");
    await wait(`${element("mvp-week")}?.getAttribute('datetime')===${JSON.stringify(week)}`);
    await wait(element(`mvp-show-selected-${recipes[0].id}`));
    assert.equal(await raw(planStorage), beforeDetail);
    console.log("PASS real API/browser: See full recipe opens the matching detail from catalog and selected dishes; navigation preserves saved selections.");
    console.log("PASS real API/browser: scheduling heading, actual portions and known/unknown total times appear beneath available and selected recipes.");
    const beforeTimeToggle = await raw(planStorage);
    await click("mvp-time-preparation");
    assert.equal(await evaluate(`${element("mvp-time-preparation")}.getAttribute('aria-pressed')`), "true");
    for (const recipe of recipes) {
      const facts = await evaluate(`${element(`mvp-catalog-facts-${recipe.id}`)}.textContent`) as string;
      assert.ok(facts.includes(recipe.prepTime == null ? "Preparation time not specified" : `Preparation: ${recipe.prepTime} min`));
    }
    for (const recipe of recipes.slice(0, 3)) {
      const facts = await evaluate(`${element(`mvp-selected-facts-${recipe.id}`)}.textContent`) as string;
      assert.ok(facts.includes(recipe.prepTime == null ? "Preparation time not specified" : `Preparation: ${recipe.prepTime} min`));
    }
    const chicken = (recipes.find(recipe => recipe.id === "tablewise:dinner:v1:oven-baked-chicken")
      ?? recipes.find(recipe => recipe.id === "tablewise:real:v1:garlic-butter-chicken"))!;
    assert.ok(chicken, "Use either the original isolated fixtures or the researched dinner catalog.");
    const expectedPrep = chicken.id.startsWith("tablewise:real:") ? 5 : 10;
    const expectedCook = chicken.id.startsWith("tablewise:real:") ? 35 : 50;
    assert.equal(chicken.prepTime, expectedPrep);
    assert.equal(chicken.cookTime, expectedCook);
    assert.ok((await evaluate(`${element(`mvp-catalog-facts-${chicken.id}`)}.textContent`) as string).includes(`Preparation: ${expectedPrep} min`));
    assert.equal(await raw(planStorage), beforeTimeToggle);
    await reload();
    await wait(`${element(`mvp-catalog-facts-${chicken.id}`)}`);
    assert.equal(await evaluate(`${element("mvp-time-preparation")}.getAttribute('aria-pressed')`), "true");
    assert.equal(await raw(planStorage), beforeTimeToggle);
    await click("mvp-time-total");
    assert.ok((await evaluate(`${element(`mvp-catalog-facts-${chicken.id}`)}.textContent`) as string).includes(`Total Time: ${expectedPrep + expectedCook} min`));
    console.log("PASS real API/browser: preparation/total toggle displays the catalog's verified stage/total values, persists its preference and leaves plans unchanged.");
    assert.equal(await evaluate(`${element(`mvp-choose-${recipes[3].id}`)}.disabled`), true);
    for (let i = 0; i < 3; i++) await select(`mvp-day-${recipes[i].id}`, `2026-10-${19 + i}`);
    await click("mvp-confirm");
    await wait(`${element("mvp-view-grocery")}`);
    assert.equal((await plan()).confirmed, true);
    await click("mvp-view-grocery");
    await readyGroceries();
    const expected = buildGroceries(await plan(), recipes);
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid="mvp-grocery-item"]').length`), expected.items.length);
    for (let index = 0; index < expected.items.length; index++) {
      assert.equal(await evaluate(`${element(`mvp-quantity-${index}`)}.textContent`), expected.items[index].text);
    }
    assert.ok(expected.items.every(item => item.sources.every(source => recipes.slice(0, 3).some(recipe => recipe.id === source.recipeId))));
    await click("mvp-check-0");
    const savedChecks = await raw(checkStorage);
    assert.ok(savedChecks);
    await reload(); await readyGroceries();
    assert.equal(await evaluate(`${element("mvp-check-0")}.checked`), true);
    assert.equal(await raw(checkStorage), savedChecks);
    console.log("PASS real API/browser: choose only 3, assign unique dates, confirm, generate correct count and persist checkmarks through reload.");

    // Keep an ingredient contributed only by an unchanged recipe checked.
    const keepIndex = expected.items.findIndex(item => item.sources.every(source => source.recipeId !== recipes[0].id));
    assert.ok(keepIndex >= 0);
    const keepId = expected.items[keepIndex].id;
    if (!await evaluate(`${element(`mvp-check-${keepIndex}`)}.checked`)) await click(`mvp-check-${keepIndex}`);
    await click("mvp-back-plan");
    await click(`mvp-replace-${recipes[0].id}`);
    await select(`mvp-replacement-select-${recipes[0].id}`, recipes[3].id);
    assert.equal((await plan()).confirmed, false);
    assert.equal((await plan()).assignments[recipes[3].id], "2026-10-19");
    await click("mvp-confirm");
    await click("mvp-view-grocery"); await readyGroceries();
    const replacementList = buildGroceries(await plan(), recipes);
    assert.ok(!replacementList.items.some(item => item.sources.some(source => source.recipeId === recipes[0].id)));
    const keptIndex = replacementList.items.findIndex(item => item.id === keepId);
    assert.ok(keptIndex >= 0);
    assert.equal(await evaluate(`${element(`mvp-check-${keptIndex}`)}.checked`), true);
    console.log("PASS real API/browser: replacing a dinner preserves its date, requires reconfirmation and updates groceries while preserving unchanged checked contributions.");

    const storedPlan = await raw(planStorage), storedChecks = await raw(checkStorage);
    await click("mvp-back-plan");
    await click("mvp-next-week");
    await wait(`${element("mvp-week")}?.getAttribute('datetime')==='2026-10-26'`);
    assert.equal(await raw(planKey("2026-10-26")), null);
    await click("mvp-prev-week");
    await wait(`${element("mvp-week")}?.getAttribute('datetime')===${JSON.stringify(week)}`);
    assert.equal(await raw(planStorage), storedPlan);
    assert.equal(await raw(checkStorage), storedChecks);
    console.log("PASS browser-local persistence: week switching neither leaks nor erases saved plans/checks.");

    const outage = await fault(500, { error: "Simulated outage" });
    await navigate(`/grocery-list?source=mvp&week=${week}`);
    await wait(`${element("mvp-retry")}`);
    assert.equal(await evaluate(`!!${element("mvp-missing-recipes")}`), false);
    assert.equal(await raw(planStorage), storedPlan); assert.equal(await raw(checkStorage), storedChecks);
    await removeFault(outage);
    await click("mvp-retry"); await readyGroceries();
    assert.equal(await raw(planStorage), storedPlan); assert.equal(await raw(checkStorage), storedChecks);
    console.log("PASS browser fault injection: API 500 shows retry, not false deletion; recovery retains every saved plan/check byte.");

    const removedId = (await plan()).selectedRecipeIds[0];
    const missing = await fault(200, recipes.filter(recipe => recipe.id !== removedId));
    await reload();
    await wait(`${element("mvp-missing-recipes")}`);
    assert.equal(await raw(planStorage), storedPlan);
    assert.ok(await evaluate(`document.querySelectorAll('[data-testid="mvp-grocery-item"]').length > 0`));
    await removeFault(missing); await click("mvp-retry"); await readyGroceries();
    await wait(`!${element("mvp-missing-recipes")}`);
    console.log("PASS simulated deletion: incomplete list is explicit; remaining ingredients and saved confirmed plan survive; normal API restores the list.");

    for (const width of [320, 390]) {
      await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), `No horizontal overflow at ${width}px`);
    }
    await evaluate("localStorage.setItem('tablewise_language','he')");
    await reload(); await readyGroceries();
    assert.equal(await evaluate("document.documentElement.dir"), "rtl");
    assert.equal(await evaluate(`getComputedStyle(${element("mvp-quantity-0")}).direction`), "ltr");
    assert.equal(await raw(planStorage), storedPlan); assert.equal(await raw(checkStorage), storedChecks);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"));
    const screenshot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile("/tmp/tablewise-mvp-grocery-rtl.png", Buffer.from(screenshot.data, "base64"));
    await evaluate("localStorage.setItem('tablewise_language','ru')");
    await reload(); await readyGroceries();
    assert.equal(await evaluate("document.documentElement.lang"), "ru");
    assert.equal(await raw(planStorage), storedPlan);
    await evaluate("localStorage.setItem('tablewise_language','en')");
    await navigate("/meals");
    await wait("document.body.innerText.includes('Tablewise') || document.body.innerText.includes('TableWise')");
    await wait("!!localStorage.getItem('weeklyMealsState')");
    const legacy = await raw("weeklyMealsState");
    await navigate("/grocery-list");
    assert.equal(await evaluate(`!!${element("mvp-grocery")}`), false);
    await navigate(`/plan?week=${week}`);
    await wait(`${element("mvp-planner")}`);
    assert.equal(await raw("weeklyMealsState"), legacy);
    assert.equal(await raw(planStorage), storedPlan);
    console.log("PASS browser: 320/390px mobile, Hebrew RTL and Russian rendering; advanced planner/legacy grocery remain separate and saved states unchanged.");

    const corruptWeek = "2026-11-02", corruptKey = planKey(corruptWeek);
    await evaluate(`localStorage.setItem(${JSON.stringify(corruptKey)},'{invalid')`);
    await navigate(`/plan?week=${corruptWeek}`);
    await wait("document.querySelector('[role=alert]')?.textContent.includes('could not be read')");
    assert.equal(await raw(corruptKey), "{invalid");
    // Quota failure is tab-only: preserve previous raw and show explicit failure.
    await navigate(`/plan?week=${week}`);
    await wait(`${element(`mvp-remove-${recipes[1].id}`)}`);
    await evaluate(`window.__originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};`);
    await click(`mvp-remove-${recipes[1].id}`);
    await wait("document.querySelector('[role=alert]')?.textContent.includes('could not be saved')");
    await evaluate("Storage.prototype.setItem=window.__originalSetItem");
    assert.equal(await raw(planStorage), storedPlan);
    assert.deepEqual(exceptions, []);
    console.log("PASS browser: corrupt saved JSON is not overwritten; quota failure preserves prior plan and shows an actionable error; no runtime exceptions.");
    if (analyticsPool) {
      await navigate(`/plan?week=${week}`);
      await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(pilotJournalKey)})||'null')?.pending.length === 0`);
      const journal = JSON.parse((await raw(pilotJournalKey))!);
      const pilotId = journal.pilotId;
      const counts = async () => (await analyticsPool.query<{ name: string; week: string; count: number }>(
        "SELECT event_name AS name,week_start::text AS week,count(*)::int AS count FROM pilot_events WHERE pilot_id=$1 GROUP BY event_name,week_start", [pilotId])).rows;
      let rows = await counts();
      assert.equal(rows.find(row => row.name === "plan_completed" && row.week === week)?.count, 1);
      assert.equal(rows.find(row => row.name === "meal_selected" && row.week === week)?.count, 4);
      assert.equal(rows.find(row => row.name === "grocery_list_opened" && row.week === week)?.count, 1);
      assert.equal(rows.filter(row => row.name === "next_week_plan_created").length, 0);
      const baseline = JSON.stringify(rows.sort((a, b) => `${a.week}${a.name}`.localeCompare(`${b.week}${b.name}`)));
      await reload(); await wait(`${element("mvp-view-grocery")}`);
      await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(pilotJournalKey)})).pending.length === 0`);
      rows = await counts();
      assert.equal(JSON.stringify(rows.sort((a, b) => `${a.week}${a.name}`.localeCompare(`${b.week}${b.name}`))), baseline);
      assert.equal(JSON.parse((await raw(pilotJournalKey))!).pilotId, pilotId);

      const telemetryOutage = await fault(503, { error: "Simulated delivery failure" }, "/api/analytics/events");
      await navigate("/plan?week=2026-10-26");
      for (let index = 0; index < 3; index++) await click(`mvp-choose-${recipes[index].id}`);
      for (let index = 0; index < 3; index++) await select(`mvp-day-${recipes[index].id}`, `2026-10-${26 + index}`);
      await click("mvp-confirm"); await wait(`${element("mvp-view-grocery")}`);
      assert.equal(JSON.parse((await raw(planKey("2026-10-26")))! ).confirmed, true);
      await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(pilotJournalKey)})).pending.some(event=>event.name==='plan_completed' && event.week==='2026-10-26')`);
      const failedIds = JSON.parse((await raw(pilotJournalKey))!).pending.map((value: { eventId: string }) => value.eventId).sort();
      await reload(); await wait(`${element("mvp-view-grocery")}`);
      const refreshed = JSON.parse((await raw(pilotJournalKey))!);
      assert.deepEqual(refreshed.pending.map((value: { eventId: string }) => value.eventId).sort(), failedIds);
      assert.equal(refreshed.pilotId, pilotId);
      assert.equal(await raw(planStorage), storedPlan);
      await removeFault(telemetryOutage);
      await evaluate("window.dispatchEvent(new Event('online'))");
      await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(pilotJournalKey)})).pending.length === 0`);
      rows = await counts();
      assert.equal(rows.find(row => row.name === "plan_completed" && row.week === "2026-10-26")?.count, 1);
      assert.equal(rows.filter(row => row.name === "next_week_plan_created").length, 1);
      await select(`mvp-day-${recipes[0].id}`, "2026-10-29");
      await click("mvp-confirm"); await wait(`${element("mvp-view-grocery")}`);
      await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(pilotJournalKey)})).pending.length === 0`);
      assert.equal((await counts()).filter(row => row.name === "next_week_plan_created").length, 1);
      assert.equal(await evaluate(`fetch('/api/analytics/summary').then(response=>response.status)`), 403);
      console.log("PASS real browser/PostgreSQL/API telemetry: stable anonymous ID; exact event counts through refresh/replacement, opening later week is not return, failed delivery does not block saved plans, identical queued IDs survive refresh, recovery stores one later-week conversion, repeat-week edit adds none; aggregates private.");
    }
  } catch (error) {
    console.error("Browser failure diagnostics:", await evaluate(`({path:location.pathname,plan:localStorage.getItem(${JSON.stringify(planStorage)}),alerts:[...document.querySelectorAll('[role=alert]')].map(node=>node.textContent),buttons:[...document.querySelectorAll('button,a')].map(node=>({text:node.textContent,test:node.getAttribute('data-testid'),disabled:node.disabled})).filter(node=>node.test?.startsWith('mvp-'))})`).catch(() => "Page unavailable"));
    throw error;
  } finally {
    for (const item of pending.values()) clearTimeout(item.timeout);
    ws.close();
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`).catch(() => {});
    await analyticsPool?.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
