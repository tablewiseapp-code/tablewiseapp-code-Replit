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
  const expectedCredit = (r: Recipe) => r.creditKind === "mine" ?
    `Mine${r.creditName ? ` — ${r.creditName}` : ""}` :
    r.creditName ? `${r.chefReference ? "Chef reference (synthetic recipe)" : "Chef / creator"}: ${r.creditName}` :
    `Chef reference (synthetic recipe): ${r.chefReference}`;
  for (const r of recipes) assert.ok(r.creditKind === "mine" || r.creditName || r.chefReference, "Every selected recipe needs an honest creator/reference credit.");
  const browser = await openTestTab();
  const { evaluate, wait, navigate, call } = browser;
  const el = (id: string) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
  try {
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(`${base}/`);
    await evaluate("localStorage.clear();localStorage.setItem('tablewise_language','en');localStorage.setItem('tablewise:time-display:v1','total')");
    await navigate(`${base}/`);
    await wait("location.pathname === '/meals'");
    await wait(el(`meals-catalog-facts-${recipes[0].id}`));
    assert.equal(await evaluate("document.querySelectorAll('[data-testid^=\"recipe-card-\"]').length"), 20);
    assert.equal(await evaluate("Boolean(document.querySelector('[data-testid=\"mvp-planner\"]'))"), false);
    assert.equal(await evaluate("document.querySelector('[data-testid=\"dev-nav\"] a').getAttribute('href')"), "/meals");
    assert.equal(await evaluate("Boolean(document.querySelector('a[href=\"/plan\"]'))"), false);
    const legacyKey = "tablewise:mvp:plan:v1:2026-10-19";
    const legacyValue = JSON.stringify({ version: 1, weekStart: "2026-10-19",
      selectedRecipeIds: [recipes[0].id], assignments: { [recipes[0].id]: "2026-10-19" }, confirmed: false });
    await evaluate(`localStorage.setItem(${JSON.stringify(legacyKey)},${JSON.stringify(legacyValue)})`);
    await navigate(`${base}/plan?week=2026-10-19`);
    await wait("location.pathname === '/meals'");
    await wait(el(`meals-catalog-facts-${recipes[0].id}`));
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(legacyKey)})`), legacyValue);
    assert.equal(await evaluate("Boolean(document.querySelector('[data-testid=\"mvp-planner\"]'))"), false);
    for (const recipe of recipes) {
      const facts = await evaluate(`${el(`meals-catalog-facts-${recipe.id}`)}.textContent`);
      const badges = await evaluate(`Array.from(${el(`recipe-card-${recipe.id}`)}.querySelectorAll('span')).map(span => span.textContent.trim())`);
      assert.equal(badges.some((text: string) => /^\+\d+$/.test(text)), false,
        "All tags are visible; ingredient counts must not appear as hidden-tag badges.");
      assert.match(facts, /Portions:/); assert.match(facts, /Preparation:/);
      assert.match(facts, /Tools used:/); assert.doesNotMatch(facts, /not specified/);
      assert.equal(facts.includes("Development estimates"), Boolean(recipe.metadataEstimated));
      assert.equal(await evaluate(`${el(`recipe-credit-${recipe.id}`)}.textContent.trim()`), expectedCredit(recipe));
    }
    for (const recipe of recipes) {
      const detailResponse: Response = await fetch(`${base}/api/recipes/${encodeURIComponent(recipe.id)}`);
      assert.equal(detailResponse.status, 200);
      assert.deepEqual(await detailResponse.json(), recipe);
      await navigate(`${base}/recipe/${encodeURIComponent(recipe.id)}`);
      await wait(`${el("text-recipe-title")}?.textContent.trim()===${JSON.stringify(recipe.title)}`);
      await wait(el("text-tools"));
      assert.equal(await evaluate(`${el("link-back-to-planner")}.getAttribute('href')`), "/meals");
      assert.equal(await evaluate(`${el(`recipe-credit-${recipe.id}`)}.textContent.trim()`), expectedCredit(recipe));
      assert.ok(await evaluate(`Boolean(${el("recipe-credit-editor")})`));
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
      assert.equal(await evaluate(`${el(`recipe-credit-${recipe.id}`)}.textContent.trim()`), expectedCredit(recipe));
    }
    // Exercise the real proxy's same-origin gate with invalid input: validation
    // must reject before storage, without changing any recipe or credit.
    assert.equal(await evaluate(`fetch('/api/development/recipe-credits/${encodeURIComponent(recipes[0].id)}',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)`), 400);
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
    await evaluate(`${el("dev-nav-mobile-trigger")}.click()`);
    await wait(el("dev-nav-mobile-link-meals"));
    assert.equal(await evaluate(`Boolean(${el("dev-nav-mobile-link-plan")})`), false);
    await navigate(`${base}/recipes`);
    await wait(el(`recipe-credit-${recipes[0].id}`));
    for (const recipe of recipes) assert.equal(await evaluate(`${el(`recipe-credit-${recipe.id}`)}.textContent.trim()`), expectedCredit(recipe));
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
    assert.deepEqual(browser.exceptions, []);
    console.log("PASS real development API/browser: home and retired /plan redirect to /meals; desktop/mobile navigation has no /plan; legacy saved data preserved; 20 visible recipes; all 20 detail pages return to /meals and show portions, preparation, tools and creator/Mine/reference credits; credit editors and estimate notices; content protection; list/detail consistency; mobile layout; no runtime exceptions, API mocks or data mutations.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
