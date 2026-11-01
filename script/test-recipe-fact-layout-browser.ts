import assert from "node:assert/strict";
import { openTestTab } from "./cdp-test-tab";
import { defaultFactOrder, recipeFactOrderKey } from "../client/src/lib/recipe-fact-layout";

async function main() {
  const base = process.argv.find(arg => /^https?:\/\//.test(arg));
  if (!base || !process.argv.includes("--disposable-browser")) throw new Error("Supply development origin and --disposable-browser.");
  const response = await fetch(`${base}/api/recipes`);
  assert.equal(response.status, 200);
  const recipes = await response.json() as { id: string }[];
  const browser = await openTestTab();
  const { call, evaluate, wait, navigate } = browser;
  const el = (id: string) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
  const rowContext = `catalog-${recipes[0].id}`;
  const order = () => evaluate(`Array.from(${el(`nutrition-${rowContext}`)}.querySelectorAll('[data-fact-id]')).map(e=>e.dataset.factId)`) as Promise<string[]>;
  const savedOrder = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(recipeFactOrderKey)}))`) as Promise<string[]>;
  const otherStorage = () => evaluate(`JSON.stringify(Object.entries(localStorage).filter(([key])=>key!==${JSON.stringify(recipeFactOrderKey)}).sort())`);
  const frame = () => evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  try {
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1800, deviceScaleFactor: 1, mobile: false });
    await navigate(`${base}/meals`);
    await evaluate("localStorage.clear();localStorage.setItem('tablewise_lang','en');localStorage.setItem('tablewise:nutrition-details:v1','true')");
    await navigate(`${base}/meals`);
    await wait(el(`fact-drag-${rowContext}-caloriesKcal`));
    const selectedId = recipes[recipes.length - 1].id;
    const add = el(`button-add-${selectedId}`);
    assert.equal(await evaluate(`${add}.textContent.trim()`), "Add");
    await evaluate(`${add}.click()`);
    await wait(`Object.values(localStorage).some(v=>v.includes(${JSON.stringify(selectedId)}))`);
    const preserved = await otherStorage();
    await wait(el(`fact-drag-${rowContext}-caloriesKcal`));
    await evaluate(`${el(`nutrition-${rowContext}`)}.scrollIntoView({block:'start'})`);
    await frame();
    // Actual pointer input, not a synthetic drop event or a mocked sortable.
    const box = async (key: string) => evaluate(`(()=>{const r=${el(`fact-drag-${rowContext}-${key}`)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const from = await box("caloriesKcal"), to = await box("time");
    assert.ok(Math.abs(from.x - to.x) > 80 && Math.abs(from.y - to.y) > 80, "Exercise diagonal movement in a two-dimensional grid.");
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await call("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + (to.x - from.x) * i / 12,
        y: from.y + (to.y - from.y) * i / 12, buttons: 1 });
      await frame();
    }
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...to, button: "left", buttons: 0, clickCount: 1 });
    await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(recipeFactOrderKey)}))?.[1]==='caloriesKcal'`);
    assert.equal((await order())[1], "caloriesKcal");
    assert.equal(await evaluate(`${el(`nutrition-catalog-${recipes[1].id}`)}.querySelectorAll('[data-fact-id]')[1].dataset.factId`), "caloriesKcal");
    assert.equal(await otherStorage(), preserved, "Dragging must not change a selected recipe or any other saved planning preference.");
    await navigate(`${base}/meals`);
    await wait(el(`fact-drag-${rowContext}-caloriesKcal`));
    assert.equal((await order())[1], "caloriesKcal", "Order survives reload.");
    await evaluate(`${el(`fact-up-${rowContext}-caloriesKcal`)}.click()`);
    await wait(`${el(`nutrition-${rowContext}`)}.querySelector('[data-fact-id]').dataset.factId==='caloriesKcal'`);
    assert.equal((await savedOrder())[0], "caloriesKcal");
    await evaluate(`${el(`fact-reset-${rowContext}`)}.click()`);
    assert.deepEqual(await savedOrder(), [...defaultFactOrder]);
    // Native keyboard drag must move both horizontally and vertically.
    for (const [arrow, virtualKey, target, position] of [
      ["ArrowDown", 40, "tools", 2], ["ArrowRight", 39, "time", 1],
    ] as const) {
    await evaluate(`${el(`fact-reset-${rowContext}`)}.click()`);
    await evaluate(`${el(`fact-drag-${rowContext}-portions`)}.focus()`);
    for (const [index, key] of [" ", arrow, " "].entries()) {
      const code = key === " " ? "Space" : key;
      const windowsVirtualKeyCode = key === " " ? 32 : virtualKey;
      await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
      await frame();
      await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
      if (index === 0) await wait(`${el(`fact-drag-${rowContext}-portions`)}.getAttribute('aria-pressed')==='true'`);
      if (index === 1) await wait(`Array.from(document.querySelectorAll('[aria-live]')).some(e=>e.textContent.includes('moved over droppable area ${target}'))`);
    }
    await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(recipeFactOrderKey)}))?.[${position}]==='portions'`);
    assert.equal((await order())[position], "portions");
    }
    await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(recipeFactOrderKey)}))?.[0]==='time'`);
    assert.equal((await order())[0], "time");
    await evaluate(`${el("nutrition-details-toggle")}.click()`);
    assert.equal(await evaluate(`Boolean(${el(`nutrition-${rowContext}`)})`), false);
    await evaluate(`${el("nutrition-details-toggle")}.click()`);
    assert.equal((await order())[0], "time", "Toggling nutrition preserves order.");
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 874, deviceScaleFactor: 1, mobile: true });
    await evaluate(`${el(`fact-up-${rowContext}-portions`)}.click()`);
    assert.equal((await savedOrder())[0], "portions");
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
    await call("Emulation.setDeviceMetricsOverride", { width: 320, height: 874, deviceScaleFactor: 1, mobile: true });
    await frame();
    assert.equal(await evaluate("innerWidth"), 320);
    assert.equal(await evaluate(`getComputedStyle(${el(`nutrition-${rowContext}`)}.querySelector('.recipe-fact-grid')).gridTemplateColumns.split(' ').length`), 1,
      "Narrow cards should stack without clipped values.");
    assert.equal(await otherStorage(), preserved);
    assert.deepEqual(browser.exceptions, []);
    console.log("PASS real browser: diagonal two-dimensional pointer drag, horizontal/vertical keyboard drag, global synchronization, reload persistence, mobile stacking/move controls, reset, nutrition toggle and saved selections preserved.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
