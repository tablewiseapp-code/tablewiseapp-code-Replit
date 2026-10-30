import assert from "node:assert/strict";
import { openTestTab } from "./cdp-test-tab";
import { curatedDevelopmentIds } from "../server/seeds/curated-development-catalog";
import type { Recipe } from "../client/src/lib/storage";

async function main() {
  const base = process.argv.find(arg => /^https?:\/\//.test(arg));
  if (!base || !process.argv.includes("--disposable-browser")) throw new Error("Supply a verified development origin and --disposable-browser.");
  const response = await fetch(`${base}/api/recipes`);
  assert.equal(response.status, 200);
  const recipes = await response.json() as Recipe[];
  assert.deepEqual(recipes.map(r => r.id), curatedDevelopmentIds);
  const browser = await openTestTab();
  const { evaluate, wait, navigate, call } = browser;
  const el = (id: string) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
  try {
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(`${base}/plan`);
    await evaluate("localStorage.clear();localStorage.setItem('tablewise_language','en');localStorage.setItem('tablewise:time-display:v1','total')");
    await navigate(`${base}/plan`);
    await wait(el(`mvp-catalog-facts-${recipes[0].id}`));
    assert.equal(await evaluate("document.querySelectorAll('[data-testid^=\"mvp-choose-\"]').length"), 20);
    for (const recipe of recipes) {
      const facts = await evaluate(`${el(`mvp-catalog-facts-${recipe.id}`)}.textContent`);
      assert.match(facts, /Portions:/); assert.match(facts, /Preparation:/);
      assert.match(facts, /Tools used:/); assert.doesNotMatch(facts, /not specified/);
      assert.equal(facts.includes("Development estimates"), Boolean(recipe.metadataEstimated));
    }
    for (const recipe of recipes) {
      const detailResponse: Response = await fetch(`${base}/api/recipes/${encodeURIComponent(recipe.id)}`);
      assert.equal(detailResponse.status, 200);
      assert.deepEqual(await detailResponse.json(), recipe);
      await navigate(`${base}/recipe/${encodeURIComponent(recipe.id)}`);
      await wait(`${el("text-recipe-title")}?.textContent.trim()===${JSON.stringify(recipe.title)}`);
      await wait(el("text-tools"));
      assert.match(await evaluate(`${el("text-prep-time")}.textContent`), new RegExp(`\\b${recipe.prepTime}\\b`));
      assert.ok((await evaluate(`${el("text-servings")}.textContent`)).includes(recipe.servings!));
      assert.doesNotMatch(await evaluate(`${el("text-tools")}.textContent`), /not specified/);
      assert.equal(await evaluate(`Boolean(${el("text-development-estimates")})`), Boolean(recipe.metadataEstimated));
      assert.equal(await evaluate(`Boolean(${el("development-read-only")})`), true);
      for (const id of ["input-prep-time", "input-cooking-time", "button-save-times", "button-delete-recipe"]) {
        assert.equal(await evaluate(`${el(id)}.disabled`), true);
      }
      if (recipe.id === recipes[0].id || recipe.id === recipes.find(r => r.metadataEstimated)!.id) {
        await evaluate(`document.querySelector('details').open=true;${el("input-prep-time")}.value="";${el("button-save-times")}.click()`);
        await navigate(`${base}/recipe/${encodeURIComponent(recipe.id)}`);
        await wait(`${el("text-recipe-title")}?.textContent.trim()===${JSON.stringify(recipe.title)}`);
        assert.equal(await evaluate(`${el("input-prep-time")}.value`), String(recipe.prepTime));
        const reloaded: Response = await fetch(`${base}/api/recipes/${encodeURIComponent(recipe.id)}`);
        assert.deepEqual(await reloaded.json(), recipe, "A read-only edit attempt must not change the source or displayed estimate.");
      }
    }
    await navigate(`${base}/meals`);
    await wait(el(`meals-catalog-facts-${recipes[0].id}`));
    assert.equal(await evaluate("document.querySelectorAll('[data-testid^=\"recipe-card-\"]').length"), 20);
    for (const recipe of recipes) {
      const facts = await evaluate(`${el(`meals-catalog-facts-${recipe.id}`)}.textContent`);
      assert.match(facts, /Portions:/); assert.match(facts, /Preparation:/);
      assert.match(facts, /Tools used:/); assert.doesNotMatch(facts, /not specified/);
    }
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
    assert.deepEqual(browser.exceptions, []);
    console.log("PASS real development API/browser: exactly 20 visible recipes; all 20 detail pages and both planners show portions, preparation and tools; all 8 estimate notices; read-only inputs/save/delete; researched and estimated edit-attempt/reload stability; list/detail consistency; mobile overflow and runtime checks. No API mocks or recipe writes.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
