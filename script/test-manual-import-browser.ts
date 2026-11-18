import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import { openTestTab } from "./cdp-test-tab";
import { fixture } from "./test-step-analysis";
import viteConfig from "../vite.config";

// Manual "Type or paste" import with AI switched off: validation → paste → live preview → failed save → save → open.
// Mock storage only. Needs headless Chrome with --remote-debugging-port=9222.
async function main() {
  const f = await fixture(false);
  const vite = await createViteServer({
    ...viteConfig, configFile: false,
    server: { middlewareMode: true, hmr: false, allowedHosts: true },
    appType: "custom",
  });
  f.app.use(vite.middlewares);
  f.app.get("*", async (req, res) => {
    const html = await readFile("client/index.html", "utf8");
    res.type("html").send(await vite.transformIndexHtml(req.originalUrl, html));
  });
  const tab = await openTestTab();
  const exists = (id: string) => tab.evaluate(`Boolean(document.querySelector('[data-testid="${id}"]'))`);
  const value = (id: string) => tab.evaluate(`document.querySelector('[data-testid="${id}"]').value`);
  async function fill(id: string, text: string) {
    await tab.evaluate(`(() => {
      const el = document.querySelector('[data-testid="${id}"]');
      const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  try {
    await tab.call("Page.addScriptToEvaluateOnNewDocument", { source: `
      localStorage.setItem('tablewise_language', 'en');
      window.__alerts = 0; window.alert = () => { window.__alerts++; };
    ` });
    await tab.navigate(`${f.base}/import`);
    await tab.wait("document.querySelector('[data-testid=\"input-title\"]')");
    const login = await tab.evaluate(`fetch('/api/operator/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${JSON.stringify(f.token)} })
    }).then(r => r.status)`);
    assert.equal(login, 200);
    await tab.navigate(`${f.base}/import`);
    await tab.wait("document.querySelector('[data-testid=\"type-or-paste\"]')");

    // Other import methods stay on the page; with AI off there is no step-time analysis control.
    for (const id of ["youtube-import", "button-add-photo", "input-source-url"]) assert.equal(await exists(id), true, id);
    assert.equal(await exists("button-analyze"), false);
    assert.equal(await exists("timing-review"), false);
    assert.equal(await tab.evaluate("document.querySelector('[data-testid=\"button-save\"]').textContent.trim()"), "Save recipe");

    // Validation beside each field; nothing is sent.
    await tab.evaluate("document.querySelector('[data-testid=\"button-save\"]').click()");
    await tab.wait("document.querySelector('[data-testid=\"error-steps\"]')");
    for (const id of ["error-title", "error-ingredients", "error-steps"]) assert.equal(await exists(id), true, id);
    assert.equal(f.writes, 0);

    // Paste a mixed list; the preview follows the text, keeps order and skips blank lines.
    const pasted = "2Kg flour\n\n250gr butter\n500ml milk\n1 ½ cups milk\n1/2 teaspoon salt\n   \nsalt to taste\na handful of parsley\n2 eggs\n2Kg\n";
    const expected = ["2 kg flour", "250 g butter", "500 mL milk", "1½ cups milk", "½ tsp salt", "salt to taste", "a handful of parsley", "2 eggs", "2 kg"];
    await fill("input-title", "Weeknight pancakes");
    await fill("textarea-ingredients", pasted);
    await tab.wait(`document.querySelectorAll('[data-testid="ingredient-preview-item"]').length === ${expected.length}`);
    assert.deepEqual(await tab.evaluate("[...document.querySelectorAll('[data-testid=\"ingredient-preview-item\"]')].map(el => el.textContent)"), expected);
    assert.deepEqual(await tab.evaluate("[...document.querySelectorAll('[data-testid=\"ingredient-preview-item\"]')].map(el => el.dataset.parsed)"),
      ["true", "true", "true", "true", "true", "false", "false", "true", "true"]);
    assert.equal(await exists("error-title"), false);
    assert.equal(await exists("error-ingredients"), false);
    assert.equal(await exists("error-steps"), true);
    await fill("textarea-ingredients", pasted.replace("2Kg flour", "3 cups of flour"));
    await tab.wait("document.querySelector('[data-testid=\"ingredient-preview-item\"]').textContent === '3 cups flour'");
    await fill("textarea-ingredients", pasted);
    await fill("textarea-steps", "Mix everything\n\nCook for 10 minutes\n");
    await tab.wait("!document.querySelector('[data-testid=\"error-steps\"]')");

    // A failed save keeps every field and explains inline.
    f.mode("storage");
    await tab.evaluate("document.querySelector('[data-testid=\"button-save\"]').click()");
    await tab.wait("document.querySelector('[data-testid=\"save-error\"]') && !document.querySelector('[data-testid=\"button-save\"]').disabled");
    assert.equal(f.writes, 0);
    assert.equal(await tab.evaluate("location.pathname"), "/import");
    assert.equal(await value("input-title"), "Weeknight pancakes");
    assert.equal(await value("textarea-ingredients"), pasted);
    assert.equal(await tab.evaluate("document.querySelector('[data-testid=\"textarea-steps\"]').disabled"), false);

    // Save (double click sends once) and open the saved recipe.
    f.mode("ok");
    await tab.evaluate("(() => { const b = document.querySelector('[data-testid=\"button-save\"]'); b.click(); b.click(); })()");
    await tab.wait("location.pathname === '/recipe/imported' && document.body.textContent.includes('2 kg flour')");
    assert.equal(f.writes, 1);
    const saved = f.rows.get("imported");
    assert.equal(saved.title, "Weeknight pancakes");
    assert.deepEqual(saved.ingredients, expected);
    assert.deepEqual(saved.steps, ["Mix everything", "Cook for 10 minutes"]);
    assert.equal(saved.stepAnalysis, undefined);
    assert.deepEqual(saved.ingredientParts[0], { originalText: "2Kg flour", quantity: 2, unit: "kg", ingredient: "flour" });
    assert.deepEqual(saved.ingredientParts[3], { originalText: "1 ½ cups milk", quantity: 1.5, unit: "cup", ingredient: "milk" });
    assert.deepEqual(saved.ingredientParts[5], { originalText: "salt to taste", quantity: null, unit: null, ingredient: "salt to taste" });
    assert.deepEqual(saved.ingredientParts[8], { originalText: "2Kg", quantity: 2, unit: "kg", ingredient: "" });

    // A recipe saved before manual import (no parts) still opens.
    f.rows.set("legacy", { id: "legacy", title: "Older saved recipe", ingredients: ["200g rice"], steps: ["Cook the rice"],
      image: null, sourceUrl: null, cookTime: null, servings: null, tags: null, createdAt: new Date(), updatedAt: new Date() });
    await tab.navigate(`${f.base}/recipe/legacy`);
    await tab.wait("document.body.textContent.includes('Older saved recipe') && document.body.textContent.includes('200g rice')");

    assert.equal(await tab.evaluate("window.__alerts"), 0);
    assert.deepEqual(tab.exceptions, []);
    console.log("PASS browser manual import (AI off): other methods present, field validation, live preview of a mixed list, failed save keeps text, single save opens the recipe with parsed parts, legacy recipe opens.");
  } finally { await tab.close(); await vite.close(); await f.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
