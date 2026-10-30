import assert from "node:assert/strict";
import WebSocket from "ws";
import { readFileSync } from "node:fs";
import type { Recipe } from "../client/src/lib/storage";
import { mealFilterPreferenceKey } from "../client/src/lib/meal-filters";
import { planKey } from "../client/src/lib/week-plan";

// CDP uses a fresh test tab. API fixtures live only in this tab; no database writes.
async function main() {
  const base = process.argv[2];
  assert.ok(base?.startsWith("http"), "Pass the development preview origin.");
  const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json() as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let sequence = 0, loads = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const exceptions: string[] = [];
  ws.on("message", data => {
    const message = JSON.parse(data.toString());
    if (message.method === "Page.loadEventFired") loads++;
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  function call(method: string, params: object = {}): Promise<any> {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression: string) {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 120; i++) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* new document */ }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error(`Condition not met: ${expression}`);
  }
  const el = (id: string) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
  const click = async (id: string) => { await wait(`${el(id)} && !${el(id)}.disabled`); await evaluate(`${el(id)}.click()`); };
  async function select(id: string, value: string) {
    await wait(`${el(id)} && !${el(id)}.disabled`);
    await evaluate(`{const n=${el(id)};n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));}`);
  }
  async function input(id: string, value: string) {
    await evaluate(`{const n=${el(id)};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));}`);
  }
  async function load(path = `/plan?week=${week}`) {
    const previous = loads;
    await call("Page.navigate", { url: `${base}${path}` });
    for (let i = 0; i < 180 && loads <= previous; i++) await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(loads > previous, "new document loaded");
    await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(path.split("?")[0])}`);
  }
  const week = "2026-10-19";
  const storageKey = planKey(week);
  const rawPlan = () => evaluate(`localStorage.getItem(${JSON.stringify(storageKey)})`);
  const recipes = JSON.parse(readFileSync("imports/researched-dinners.json", "utf8")) as Recipe[];
  const fixtures: Recipe[] = [
    { ...recipes[0], id: "filter-breakfast", title: "Browser fixture: breakfast", tags: ["meal:breakfast", "meal:lunch", "suitability:school-lunchbox"], ingredients: ["2 eggs", "1 cup coconut milk"], prepTime: 0, cookTime: 20 },
    { ...recipes[1], id: "filter-lunch", title: "Browser fixture: lunch", tags: ["Lunch", "lunchbox"], ingredients: ["1 red pepper"], prepTime: 10, cookTime: 10 },
    { ...recipes[2], id: "filter-unknown", title: "Browser fixture: unclassified", tags: [], ingredients: ["1 onion"], prepTime: null, cookTime: null },
    { ...recipes[3], id: "filter-dinner", title: "Browser fixture: dinner", tags: ["Dinner"], prepTime: 10, cookTime: 50 },
  ];
  let fixtureScript = "";
  try {
    await call("Page.enable"); await call("Runtime.enable");
    await call("Page.bringToFront");
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    fixtureScript = (await call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const recipes=${JSON.stringify(fixtures)}, original=window.fetch;
      window.__catalogMode='ok';
      window.fetch=async (input,init)=>{
        const path=new URL(typeof input==='string'?input:input.url,location.origin).pathname;
        if(!path.startsWith('/api/'))return original(input,init);
        if(path==='/api/recipes'){
          if(window.__catalogMode==='slow')await new Promise(resolve=>window.__releaseCatalog=resolve);
          if(window.__catalogMode==='error')return new Response('{}',{status:503});
          return new Response(JSON.stringify(window.__catalogMode==='empty'?[]:recipes),{headers:{'Content-Type':'application/json'}});
        }
        if(path.startsWith('/api/recipes/'))return new Response(JSON.stringify(recipes.find(r=>r.id===decodeURIComponent(path.split('/').pop()))),{headers:{'Content-Type':'application/json'}});
        return new Response('{}',{status:403});
      };
    })();` })).identifier;
    await load();
    await evaluate(`localStorage.clear();localStorage.setItem('tablewise_language','en');localStorage.setItem('tablewise:time-display:v1','total')`);
    await load();
    await wait(`${el("mvp-choose-filter-breakfast")} && !${el("mvp-choose-filter-breakfast")}.disabled`);
    assert.equal(await evaluate(`${el("mvp-filters-toggle")}.getAttribute('aria-expanded')`), "false");
    assert.match(await evaluate(`${el("mvp-filter-result-count")}.textContent`), /4/);
    await evaluate(`${el("mvp-filters-toggle")}.focus()`);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await wait(`${el("mvp-filters-toggle")}.getAttribute('aria-expanded')==='true'`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid="mvp-meal-filters"] fieldset').length`), 4);
    await select("mvp-filter-time-cap", "15");
    await wait(`${el("mvp-no-matches")}`);
    await click("mvp-time-preparation");
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('3')`);
    await select("mvp-filter-time-cap", "");
    await input("mvp-ingredient-input-mustInclude", "EGGS");
    await click("mvp-ingredient-add-mustInclude");
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('1')`);
    await input("mvp-ingredient-input-mustExclude", "nut");
    await click("mvp-ingredient-add-mustExclude");
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('1')`);
    await click("mvp-choose-filter-breakfast");
    await wait(`${el("mvp-remove-filter-breakfast")}`);
    const saved = await rawPlan();
    await input("mvp-ingredient-input-mustExclude", "eggs");
    await click("mvp-ingredient-add-mustExclude");
    await wait(`${el("mvp-no-matches")}`);
    assert.equal(await rawPlan(), saved);
    assert.ok(await evaluate(`Boolean(${el("mvp-remove-filter-breakfast")})`));
    await click("mvp-replace-filter-breakfast");
    await wait(`${el("mvp-no-replacements-filter-breakfast")}`);
    assert.equal(await rawPlan(), saved);
    // Chips and reset survive panel collapse.
    await click("mvp-filters-toggle");
    await wait(`${el("mvp-filters-toggle")}.getAttribute('aria-expanded')==='false'`);
    assert.ok(await evaluate(`Boolean(${el("mvp-filters-clear")})`));
    await load();
    await wait(`${el("mvp-no-matches")}`);
    await click("mvp-filters-clear");
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('4')`);
    assert.equal(await evaluate(`localStorage.getItem('tablewise:time-display:v1')`), "preparation");
    await click("mvp-show-selected-filter-breakfast");
    await wait(`location.pathname==='/recipe/filter-breakfast'`);
    await evaluate(`document.querySelector('a[href="/plan?week=${week}"]').click()`);
    await wait(`${el("mvp-choose-filter-lunch")}`);
    assert.equal(await rawPlan(), saved);
    await click("mvp-choose-filter-lunch"); await click("mvp-choose-filter-unknown");
    for (const [index, id] of ["filter-breakfast", "filter-lunch", "filter-unknown"].entries()) {
      await select(`mvp-day-${id}`, `2026-10-${19 + index}`);
    }
    await wait(`!${el("mvp-confirm")}.disabled`);
    await click("mvp-filters-toggle");
    // Click the Breakfast category button, not any title/recipe text.
    await evaluate(`[...document.querySelectorAll('fieldset button')].find(n=>n.textContent.trim()==='Breakfast').click()`);
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('1')`);
    assert.equal(await evaluate(`${el("mvp-confirm")}.disabled`), false);
    const beforeConfirm = await rawPlan();
    await select("mvp-filter-lunchbox", "school-lunchbox");
    assert.equal(await rawPlan(), beforeConfirm);
    await click("mvp-show-selected-filter-breakfast");
    await wait(`location.pathname==='/recipe/filter-breakfast'`);
    await evaluate(`document.querySelector('a[href="/plan?week=${week}"]').click()`);
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('1') && ${el("mvp-confirm")}`);
    assert.equal(await rawPlan(), beforeConfirm);
    await click("mvp-confirm"); await click("mvp-view-grocery");
    await wait(`${el("mvp-grocery")} && document.querySelectorAll('[data-testid="mvp-grocery-item"]').length>0`);
    assert.match(await evaluate(`document.body.textContent`), /3 meals/);
    await click("mvp-back-plan");
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('1')`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})).confirmed`), true);
    // Malformed optional preferences recover without touching the plan.
    const confirmed = await rawPlan();
    await evaluate(`localStorage.setItem(${JSON.stringify(mealFilterPreferenceKey)},'{bad')`);
    await load();
    await wait(`${el("mvp-filter-result-count")}.textContent.includes('4')`);
    assert.equal(await rawPlan(), confirmed);
    // Localized controls, very narrow screens, long terms, and Hebrew RTL.
    for (const [lang, text] of [["en", "Filters"], ["ru", "Фильтры"], ["he", "מסננים"]]) {
      await evaluate(`localStorage.setItem('tablewise_language',${JSON.stringify(lang)})`);
      await load();
      await wait(`${el("mvp-filters-toggle")}`);
      await click("mvp-filters-toggle");
      await wait(`document.querySelectorAll('fieldset').length===4`);
      assert.match(await evaluate(`${el("mvp-filters-toggle")}.textContent`), new RegExp(text));
      await call("Emulation.setDeviceMetricsOverride", { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await input("mvp-ingredient-input-mustInclude", "x".repeat(180));
      await click("mvp-ingredient-add-mustInclude");
      await wait(`${el("mvp-no-matches")}`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true, `${lang} mobile overflow`);
      assert.equal(await evaluate(`document.documentElement.dir`), lang === "he" ? "rtl" : "ltr");
      assert.equal(await evaluate(`document.querySelectorAll('[data-testid="mvp-time-preparation"]').length`), 1);
      await evaluate(`${el("mvp-ingredient-input-mustInclude")}.focus()`);
      await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await wait(`${el("mvp-filters-toggle")}.getAttribute('aria-expanded')==='false'`);
      assert.equal(await evaluate(`document.activeElement===${el("mvp-filters-toggle")}`), true);
      await click("mvp-filters-clear");
    }
    // Existing stale/loading/error safeguards still control confirmation.
    await evaluate(`localStorage.removeItem(${JSON.stringify(storageKey)});localStorage.setItem('tablewise_language','en')`);
    await load();
    await wait(`${el("mvp-choose-filter-breakfast")}`);
    await evaluate(`window.__catalogMode='error'`);
    await click("mvp-show-catalog-filter-breakfast");
    await wait(`location.pathname==='/recipe/filter-breakfast'`);
    await evaluate(`document.querySelector('a[href="/plan?week=${week}"]').click()`);
    await wait(`${el("mvp-retry")}`);
    assert.equal(await evaluate(`${el("mvp-choose-filter-breakfast")}.disabled`), true);
    await evaluate(`window.__catalogMode='slow'`);
    await click("mvp-retry");
    await wait(`typeof window.__releaseCatalog==='function'`);
    assert.equal(await evaluate(`${el("mvp-confirm")}.disabled`), true);
    await evaluate(`window.__catalogMode='ok';window.__releaseCatalog()`);
    await wait(`!${el("mvp-choose-filter-breakfast")}.disabled`);
    await evaluate(`window.__catalogMode='empty'`);
    await click("mvp-show-catalog-filter-breakfast");
    await wait(`location.pathname==='/recipe/filter-breakfast'`);
    await evaluate(`document.querySelector('a[href="/plan?week=${week}"]').click()`);
    await wait(`document.body.textContent.includes('No recipes to choose from yet.')`);
    assert.deepEqual(exceptions, []);
    console.log("PASS browser-only mocks: keyboard panel/Escape, combined filters, explicit categories, zero/unknown times, persistent chips/reset, selected-plan invariance, no replacements, recipe return, non-dinner three-meal confirmation/groceries, malformed preferences, EN/RU/HE RTL at 320px, loading/stale/error/empty. No database writes.");
  } catch (error) {
    console.error(await evaluate(`({path:location.pathname,text:document.body.textContent?.slice(-5000)})`).catch(() => "Page unavailable"));
    throw error;
  } finally {
    if (fixtureScript) await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: fixtureScript }).catch(() => {});
    for (const item of pending.values()) clearTimeout(item.timer);
    ws.close();
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`, { signal: AbortSignal.timeout(2000) }).catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
