import assert from "node:assert/strict";
import { openTestTab } from "./cdp-test-tab";

// This changes only a disposable browser's local meal plan, never API data.
const origin = process.argv[2];
if (!origin || !process.argv.includes("--disposable-browser")) {
  throw new Error("Supply a development origin and --disposable-browser.");
}
if (!new URL(origin).hostname.endsWith(".replit.dev")) {
  throw new Error("This test is restricted to development previews.");
}
const tab = await openTestTab(9337);
let seededPlan = false;
const categories = `Array.from(document.querySelectorAll("[data-grocery-category]")).map(e=>e.dataset.groceryCategory)`;
const checkedCount = `document.querySelectorAll('input[type="checkbox"]:checked').length`;
const key = async (name: string, code: number) => {
  await tab.call("Input.dispatchKeyEvent", {type:"keyDown", key:name, code:name === " " ? "Space" : name, windowsVirtualKeyCode:code});
  await tab.call("Input.dispatchKeyEvent", {type:"keyUp", key:name, code:name === " " ? "Space" : name, windowsVirtualKeyCode:code});
};

try {
  await tab.call("Emulation.setDeviceMetricsOverride",{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await tab.navigate(`${origin}/grocery-list`);
  await tab.wait(`Boolean(document.querySelector(".grocery-page"))`);
  const originalPlan = await tab.evaluate(`localStorage.getItem("weeklyMealsState")`);
  assert.equal(originalPlan, null, "Use a fresh disposable browser profile.");
  await tab.wait(`!document.querySelector('[aria-busy="true"]')`);
  assert.ok(await tab.evaluate(`document.body.innerText.includes("No meals planned yet")`));
  await tab.evaluate(`(async()=>{
    const recipes=await (await fetch("/api/recipes")).json();
    const chosen=recipes.slice(0,3);
    window.__groceryExpected=[...new Set(chosen.flatMap(r=>r.ingredients).map(x=>x.toLowerCase()))].sort();
    localStorage.setItem("weeklyMealsState",JSON.stringify({
      filters:{maxMinutes:null,dietary:[],mealType:[],cookingMethod:[],source:[],
        proteinType:[],withNotes:false,modifiedByMe:false,myPicks:false,minRating:null,
        servings:null,mustInclude:[],mustExclude:[]},
      selectedIds:chosen.map(r=>r.id),expandedSections:[],showMoreFilters:false,
      planAssignments:chosen.map((r,i)=>({recipeId:r.id,mealType:"Dinner",startDay:i,spanDays:1}))
    }));
  })()`);
  seededPlan = true;
  const expected = await tab.evaluate(`window.__groceryExpected`);
  await tab.navigate(`${origin}/grocery-list`);
  await tab.wait(`document.querySelectorAll('input[type="checkbox"]').length===${expected.length}`);
  assert.deepEqual(await tab.evaluate(`Array.from(document.querySelectorAll("[data-testid^=grocery-item-]")).map(e=>e.dataset.testid.slice("grocery-item-".length)).sort()`), expected);
  assert.ok(await tab.evaluate(`!document.body.innerText.includes("Design preview") && Boolean(document.querySelector('[data-testid="dev-nav"]'))`));
  assert.ok(await tab.evaluate(`document.querySelectorAll(".grocery-recipes").length===${expected.length} && Array.from(document.querySelectorAll(".grocery-recipes")).every(e=>e.innerText.replace("Used in:","").trim().length>0)`));

  await tab.evaluate(`document.querySelector('input[type="checkbox"]').focus()`);
  await key(" ",32);
  await tab.wait(`${checkedCount}===1`);
  await tab.wait(`document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow")==="1"`);
  await tab.evaluate(`document.querySelector(".grocery-category-toggle").click()`);
  await tab.wait(`document.querySelector(".grocery-category-toggle").getAttribute("aria-expanded")==="false"`);
  assert.ok(await tab.evaluate(`document.querySelector(".grocery-category > ul").hidden`));
  assert.equal(await tab.evaluate(checkedCount), 1);
  await tab.evaluate(`document.querySelector(".grocery-category-toggle").click()`);
  assert.ok(await tab.evaluate(`document.querySelector(".grocery-item.is-checked .grocery-recipes").offsetParent!==null`)); // attribution stays visible when checked

  const initialOrder = await tab.evaluate(categories);
  await tab.evaluate(`document.querySelector(".grocery-drag-handle").focus()`);
  await key("ArrowRight",39);
  await tab.wait(`${categories}[1]===${JSON.stringify(initialOrder[0])}`);
  await key("ArrowLeft",37);
  await tab.wait(`${categories}[0]===${JSON.stringify(initialOrder[0])}`);
  const rects = await tab.evaluate(`Array.from(document.querySelectorAll("[data-grocery-category]")).slice(0,2).map(e=>{const r=e.getBoundingClientRect(); const h=e.querySelector(".grocery-drag-handle").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,hx:h.x+h.width/2,hy:h.y+h.height/2}})`);
  const start = rects[0], target = rects[1];
  const dropX = target.x + target.w * .85;
  const dropY = target.y + target.h * .55;
  await tab.call("Input.dispatchMouseEvent",{type:"mousePressed",x:start.hx,y:start.hy,button:"left",buttons:1,clickCount:1});
  await tab.call("Input.dispatchMouseEvent",{type:"mouseMoved",x:dropX,y:dropY,button:"left",buttons:1});
  await tab.wait(`Boolean(document.querySelector(".is-drop-after"))`);
  await tab.call("Input.dispatchMouseEvent",{type:"mouseReleased",x:dropX,y:dropY,button:"left",buttons:0,clickCount:1});
  await tab.wait(`${categories}[1]===${JSON.stringify(initialOrder[0])}`);
  assert.equal(await tab.evaluate(checkedCount),1);
  await tab.evaluate(`document.querySelector('[data-testid="button-uncheck-all"]').click()`);
  await tab.wait(`${checkedCount}===0`);

  for (const width of [320,390,768]) {
    await tab.call("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<500});
    assert.ok(await tab.evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),`Overflow at ${width}`);
  }
  await tab.evaluate(`document.querySelector(".grocery-navigation-menu").click()`);
  await tab.wait(`Boolean(document.querySelector('[role="dialog"]'))`);
  assert.equal(await tab.evaluate(`document.querySelectorAll('[role="dialog"] a').length`),5);
  assert.equal(await tab.evaluate(`document.querySelectorAll('[data-testid^="button-grocery-lang-"]').length`),3);
  await key("Escape",27);
  await tab.wait(`!document.querySelector('[role="dialog"]')`);
  await tab.evaluate(`document.querySelector('[data-testid="button-back-to-plan"]').click()`);
  await tab.wait(`location.pathname==="/meals" && Boolean(document.querySelector('[data-testid="dev-nav-mobile"]'))`);
  await tab.navigate(`${origin}/grocery-list?source=mvp`);
  await tab.wait(`!document.querySelector(".grocery-page") && Boolean(document.querySelector('[data-testid="dev-nav-mobile"]'))`);

  // Simulate a catalog read failure entirely in this browser, not on the server.
  await tab.call("Page.addScriptToEvaluateOnNewDocument",{source:`const realFetch=window.fetch; window.fetch=(input,...rest)=>String(input).includes("/api/recipes")?Promise.reject(new Error("Simulated catalog failure")):realFetch(input,...rest);`});
  await tab.navigate(`${origin}/grocery-list`);
  await tab.wait(`Boolean(document.querySelector('[role="alert"]'))`);
  assert.ok(await tab.evaluate(`document.querySelector('[role="alert"]').innerText.includes("Try again")`));
  assert.deepEqual(tab.exceptions,[]);
  console.log("PASS grocery design browser: real catalog ingredients; empty/error states; progress/check/reset; collapse; pointer and keyboard category reordering; ingredient details; responsive 320/390/768; all navigation and languages; MVP route preserved. No API writes.");
} finally {
  if (seededPlan) await tab.evaluate(`localStorage.removeItem("weeklyMealsState")`).catch(() => {});
  await tab.close();
}
