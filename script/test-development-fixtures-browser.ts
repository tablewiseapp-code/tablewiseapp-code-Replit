import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { developmentFixtures } from "../server/seeds/development-fixtures";
import { researchedDinners } from "../server/seeds/researched-import";
import { verifyPreviewCatalog } from "../server/seeds/preview-catalog";
import { planKey, plannerRecipeURL } from "../client/src/lib/week-plan";
import { openTestTab } from "./cdp-test-tab";
import type { Recipe } from "../shared/schema";

async function main() {
  const base = process.argv.slice(2).find(value => /^https?:\/\//.test(value));
  if (!base || !process.argv.includes("--disposable-browser")) {
    throw new Error("Supply a verified development origin and --disposable-browser; use a fresh Chromium profile.");
  }
  const response = await fetch(`${base}/api/recipes`);
  assert.equal(response.status, 200);
  const recipes = await response.json() as Recipe[];
  const counts = verifyPreviewCatalog(recipes);
  assert.equal(counts.synthetic, 100, "Browser test requires the actual full imported batch, not mocks.");
  // All content checked through the live enumeration API; representative
  // detail endpoints are checked separately below. No API mocks or mutations.
  const browser = await openTestTab();
  const { call, evaluate, wait, exceptions } = browser;
  const el = (id: string) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
  const click = async (id: string) => {
    await wait(`${el(id)} && !${el(id)}.disabled`);
    await evaluate(`${el(id)}.click()`);
  };
  const select = async (id: string, value: string) => {
    await wait(el(id));
    await evaluate(`{const n=${el(id)};n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));}`);
  };
  const week = "2026-10-19", key = planKey(week);
  const planRaw = () => evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
  const loadPlan = async () => {
    await browser.navigate(`${base}/plan?week=${week}`);
    await wait(el(`mvp-show-catalog-${developmentFixtures[0].id}`));
  };
  try {
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.navigate(`${base}/plan?week=${week}`);
    // Only in a new, disposable browser profile (mandatory flag above).
    await evaluate("localStorage.clear();localStorage.setItem('tablewise_language','en');localStorage.setItem('tablewise:time-display:v1','total')");
    await loadPlan();
    assert.equal(await evaluate("document.querySelectorAll('[data-testid^=\"mvp-choose-\"]').length"), recipes.length);
    assert.match(await evaluate(`${el("mvp-filter-result-count")}.textContent`), new RegExp(`\\b${recipes.length}\\b`));
    for (const fixture of developmentFixtures) {
      const facts = await evaluate(`${el(`mvp-catalog-facts-${fixture.id}`)}.textContent`);
      assert.match(facts, /Portions not specified/);
      assert.match(facts, /Total time not specified/);
    }
    const representatives = [researchedDinners[0], developmentFixtures[0], developmentFixtures[49], developmentFixtures[99]];
    for (const recipe of representatives) {
      const detail: Response = await fetch(`${base}/api/recipes/${encodeURIComponent(recipe.id)}`);
      assert.equal(detail.status, 200);
      const json = await detail.json();
      for (const [field, value] of Object.entries(recipe)) assert.deepEqual(json[field], value);
      await click(`mvp-show-catalog-${recipe.id}`);
      await wait(`${el("text-recipe-title")}?.textContent.trim()===${JSON.stringify(recipe.title)}`);
      assert.equal(await evaluate(`${el("link-source")}.getAttribute('href')`), recipe.sourceUrl);
      if (recipe.id.startsWith("tablewise:synthetic:")) {
        await wait(el("synthetic-provenance"));
        assert.match(await evaluate(`${el("link-source")}.textContent`), /unverified/);
        assert.equal(await evaluate(`${el("input-prep-time")}.value`), "");
        assert.equal(await evaluate(`${el("input-cooking-time")}.value`), "");
      } else assert.equal(await evaluate(`!!${el("synthetic-provenance")}`), false);
      await click("link-back-to-planner");
      await wait(el(`mvp-choose-${developmentFixtures[0].id}`));
    }
    const chosen = [researchedDinners[0], developmentFixtures[0], developmentFixtures[99]];
    for (let i = 0; i < chosen.length; i++) {
      await click(`mvp-choose-${chosen[i].id}`);
      await select(`mvp-day-${chosen[i].id}`, `2026-10-${19 + i}`);
    }
    assert.equal(await evaluate(`${el(`mvp-choose-${developmentFixtures[1].id}`)}.disabled`), true);
    await click("mvp-confirm");
    await wait(el("mvp-view-grocery"));
    const saved = await planRaw();
    assert.equal(JSON.parse(saved).confirmed, true);
    for (const recipe of chosen) {
      assert.equal(await evaluate(`${el(`mvp-show-selected-${recipe.id}`)}.getAttribute('href')`),
        plannerRecipeURL(recipe.id, week));
      await click(`mvp-show-selected-${recipe.id}`);
      await wait(`${el("text-recipe-title")}?.textContent.trim()===${JSON.stringify(recipe.title)}`);
      await click("link-back-to-planner"); await wait(el("mvp-view-grocery"));
      assert.equal(await planRaw(), saved, "Detail links must preserve the three-recipe plan and dates.");
    }
    await click("mvp-filters-toggle");
    await select("mvp-filter-time-cap", "60");
    await wait(`!${el(`mvp-show-catalog-${developmentFixtures[0].id}`)}`);
    assert.equal(await planRaw(), saved);
    await click("mvp-filters-clear");
    await wait(el(`mvp-show-catalog-${developmentFixtures[0].id}`));
    await evaluate(`{const button=[...document.querySelectorAll('[data-testid="mvp-filters-panel"] button')].find(n=>n.textContent.trim()==='Dinner');if(!button)throw new Error('Dinner filter missing');button.click();}`);
    await wait(`!${el(`mvp-show-catalog-${developmentFixtures[0].id}`)}`);
    await click("mvp-filters-clear");
    await wait(el(`mvp-show-catalog-${developmentFixtures[0].id}`));
    const ingredient = "ground beef";
    await evaluate(`{const n=${el("mvp-ingredient-input-mustInclude")};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(ingredient)});n.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await click("mvp-ingredient-add-mustInclude");
    const expectedMatches = recipes.filter(r => r.ingredients.some(line => line.toLowerCase().includes(ingredient))).length;
    await wait(`${el("mvp-filter-result-count")}.textContent.match(/\\b${expectedMatches}\\b/)`);
    assert.ok(expectedMatches > 0 && expectedMatches < recipes.length);
    await click("mvp-filters-clear");
    await wait(`${el("mvp-filter-result-count")}.textContent.match(/\\b${recipes.length}\\b/)`);
    assert.equal(await planRaw(), saved);
    assert.deepEqual(exceptions, []);
    await mkdir("generated-artifacts", { recursive: true });
    await browser.navigate(`${base}${plannerRecipeURL(developmentFixtures[0].id, week)}`);
    await wait(el("synthetic-provenance"));
    const image = await call("Page.captureScreenshot", { format: "png" });
    await writeFile("generated-artifacts/development-fixture-detail.png", Buffer.from(image.data, "base64"));
    console.log(`PASS real API/browser at supplied origin: ${counts.total} total; all 100 batch records match; original + first/middle/last imported details; source links/provenance/unknown times; exactly three selected and confirmed; dates/plan preserved; ingredient, dinner and time filters; cleared catalog restored; no runtime exceptions. This is main-preview evidence ONLY if that origin is independently established as main.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
