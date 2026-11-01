import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import { openTestTab } from "./cdp-test-tab";
import { example, fixture } from "./test-step-analysis";
import viteConfig from "../vite.config";

async function main() {
  const f = await fixture();
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
  const click = (id: string) => tab.evaluate(`document.querySelector('[data-testid="${id}"]').click()`);
  async function fill(id: string, value: string) {
    await tab.evaluate(`(() => {
      const el = document.querySelector('[data-testid="${id}"]');
      const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  try {
    await tab.call("Page.addScriptToEvaluateOnNewDocument", { source: `
      localStorage.setItem('tablewise_language', 'en');
      window.alert = () => {}; window.confirm = () => true;
      Object.defineProperty(navigator, 'mediaDevices', { value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] })
      } });
      window.MediaRecorder = class {
        static isTypeSupported() { return true; }
        state = 'inactive'; mimeType = 'audio/webm';
        start() { this.state = 'recording'; }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['fake audio'], { type: this.mimeType }) });
          this.onstop?.();
        }
      };
    ` });
    const login = await f.request("/api/operator/session", { token: f.token });
    // Browser login requires an Origin; use same-origin browser fetch instead.
    assert.equal(login.status, 403);
    await tab.navigate(`${f.base}/import`);
    await tab.wait("document.querySelector('[data-testid=\"input-title\"]')");
    const loginStatus = await tab.evaluate(`fetch('/api/operator/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${JSON.stringify(f.token)} })
    }).then(r => r.status)`);
    assert.equal(loginStatus, 200); // fetch follows the 303 to /recipes.
    await fill("input-title", example.title);
    await fill("textarea-ingredients", example.ingredients.join("\n"));
    await fill("textarea-steps", example.steps.join("\n"));
    f.mode("timeout");
    await click("button-save");
    await tab.wait("document.querySelector('[data-testid=\"timing-review\"] [role=\"alert\"]')");
    assert.equal(await tab.evaluate("document.querySelector('[data-testid=\"input-title\"]').value"), example.title);
    assert.equal(f.writes, 0);
    f.mode("ok");
    await click("button-save");
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    assert.match(await tab.evaluate("document.querySelector('[data-testid=\"analysis-warnings\"]').textContent"), /crawfish.*fish fillets/);
    const before = f.calls;
    await fill("input-title", `${example.title} edited`);
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 0");
    await tab.evaluate(`(() => {
      const button = document.querySelector('[data-testid="button-save"]');
      button.click(); button.click();
    })()`);
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    assert.equal(f.calls, before + 1);
    await click("button-save");
    await tab.wait("location.pathname === '/recipe/imported' && document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    assert.equal(f.writes, 1);
    await tab.navigate(`${f.base}/recipe/imported`);
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    assert.match(await tab.evaluate("document.querySelector('[data-testid=\"step-duration\"]').textContent"), /2–4 min.*AI estimate/);
    f.advance();
    await tab.navigate(`${f.base}/import`);
    await tab.wait("document.querySelector('[data-testid=\"button-start-dictation\"]')");
    await click("button-start-dictation");
    await tab.wait("document.querySelector('[data-testid=\"button-stop-dictation\"]')");
    await click("button-stop-dictation");
    await tab.wait("document.querySelector('[data-testid=\"button-transcribe\"]')");
    await click("button-transcribe");
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    assert.equal(await tab.evaluate("document.querySelector('[data-testid=\"input-title\"]').value"), example.title);
    await click("button-save");
    await tab.wait("location.pathname === '/recipe/imported' && document.querySelector('[data-testid=\"text-prep-time\"]')");
    assert.equal(f.writes, 2);
    const saved = f.rows.get("imported");
    assert.equal(saved.prepTime, 10); assert.equal(saved.cookTime, 15); assert.equal(saved.servings, "2");
    assert.deepEqual(saved.ingredients, example.ingredients);
    f.advance();
    await tab.navigate(`${f.base}/import`);
    await tab.wait("document.querySelector('[data-testid=\"input-title\"]')");
    await fill("input-title", "Timed recipe");
    await fill("textarea-ingredients", example.ingredients.join("\n"));
    await fill("textarea-steps", ["Stir 30 seconds.", "Cook 5–8 minutes.", "Rest 1 to 2 hours.", "Serve."].join("\n"));
    f.mode("hold");
    const callsBefore = f.calls;
    await click("button-save");
    for (let i = 0; i < 100 && f.calls === callsBefore; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.calls, callsBefore + 1);
    await fill("input-title", "Edited while analyzing");
    f.release();
    await tab.wait("!document.querySelector('[data-testid=\"button-save\"]').disabled");
    assert.equal(await tab.evaluate("document.querySelectorAll('[data-testid=\"step-duration\"]').length"), 0);
    assert.equal(f.writes, 2);
    await click("button-save");
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    const badges: string[] = await tab.evaluate("[...document.querySelectorAll('[data-testid=\"step-duration\"]')].map(el => el.textContent)");
    assert.match(badges[0], /30 sec.*Source-stated/);
    assert.match(badges[1], /5–8 min.*Source-stated/);
    assert.match(badges[2], /1–2 hr.*Source-stated/);
    assert.match(badges[3], /AI estimate/);
    await click("button-save");
    await tab.wait("location.pathname === '/recipe/imported' && document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    await tab.navigate(`${f.base}/recipe/imported`);
    await tab.wait("document.querySelectorAll('[data-testid=\"step-duration\"]').length === 4");
    assert.match(await tab.evaluate("document.querySelector('[data-testid=\"step-duration\"]').textContent"), /30 sec.*Source-stated/);
    assert.deepEqual(tab.exceptions, []);
    console.log("PASS browser: typed failure/retry/review, repeated clicks, edits during/after analysis, saved detail/reload with source/estimate range badges, fake voice parse+automatic analysis, parsed metadata. Mock storage and provider only.");
  } finally { await tab.close(); await vite.close(); await f.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
