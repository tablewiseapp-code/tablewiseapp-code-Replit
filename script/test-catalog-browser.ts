import assert from "node:assert/strict";
import WebSocket from "ws";
import { dinnerCatalog } from "../server/seeds/dinner-catalog";

// Uses existing Chromium's debugging protocol and the existing ws dependency.
// Browser fault injection affects only this test tab, never the server/database.
async function main() {
  const base = process.argv[2];
  if (!base || !/^https?:\/\//.test(base)) throw new Error("Pass the development preview origin.");
  const response = await fetch(`${base}/api/recipes`);
  assert.equal(response.status, 200);
  const recipes = await response.json() as typeof dinnerCatalog;
  assert.equal(recipes.length, 12);
  for (const seed of dinnerCatalog) {
    const row = recipes.find((r) => r.id === seed.id);
    assert.ok(row);
    for (const field of ["title", "ingredients", "steps", "cookTime", "servings", "tags"] as const) {
      assert.deepEqual(row[field], seed[field]);
    }
    const detail = await fetch(`${base}/api/recipes/${encodeURIComponent(seed.id)}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), row);
  }
  console.log("PASS: normal GET list and all 12 GET detail APIs return persisted catalog content.");

  const targets = await (await fetch("http://127.0.0.1:9222/json")).json() as {
    type: string; webSocketDebuggerUrl: string;
  }[];
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const send = (method: string, params = {}): Promise<unknown> => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async <T,>(expression: string): Promise<T> => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }) as {
      result: { value: T }; exceptionDetails?: unknown;
    };
    assert.ok(!result.exceptionDetails, `Browser evaluation failed: ${expression}`);
    return result.result.value;
  };
  const wait = async (expression: string) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  const exists = (id: string) => `!!document.querySelector('[data-testid="${id}"]')`;
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__catalogMode = 'error';
        window.__catalogErrors = [];
        addEventListener('error', event => window.__catalogErrors.push(event.message));
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          if (String(args[0]) === '/api/recipes') {
            if (window.__catalogMode === 'error') return new Response('{}', {status: 500});
            if (window.__catalogMode === 'network') throw new TypeError('Test network interruption');
            if (window.__catalogMode === 'empty') return new Response('[]', {status: 200});
            if (window.__catalogMode === 'delay') await new Promise(resolve => window.__releaseCatalog = resolve);
          }
          return originalFetch(...args);
        };
      `,
    });
    await send("Page.navigate", { url: `${base}/recipes` });
    await wait(exists("text-error"));
    assert.equal(await evaluate(exists("text-empty")), false);
    assert.equal(await evaluate(exists("link-import-first")), false);
    assert.equal(await evaluate(`document.querySelector('[data-testid="text-error"]').getAttribute('role')`), "alert");
    await evaluate(`window.__catalogMode = 'delay'; document.querySelector('[data-testid="button-retry"]').click()`);
    await wait(exists("text-loading"));
    assert.equal(await evaluate(`document.querySelector('[data-testid="button-retry"]').disabled`), true);
    assert.equal(await evaluate(exists("text-error")), false);
    await wait(`typeof window.__releaseCatalog === 'function'`);
    await evaluate(`window.__catalogMode = 'real'; window.__releaseCatalog()`);
    await wait(`document.querySelectorAll('[data-testid^="card-recipe-"]').length === 12`);
    assert.equal(await evaluate(exists("text-empty")), false);
    console.log("PASS: API 500 shows an alert, not empty/import; retry is disabled while pending and recovers to 12 cards.");

    for (const lang of ["en", "ru", "he"]) {
      await evaluate(`localStorage.setItem('tablewise_language', '${lang}')`);
      await send("Page.reload");
      await wait(exists("text-error"));
      await wait(`document.documentElement.lang === '${lang}'`);
      const errorText = await evaluate<string>(`document.querySelector('[data-testid="text-error"]').textContent`);
      assert.ok(errorText.trim() && !errorText.includes("recipes.error"));
      assert.equal(await evaluate(`document.documentElement.dir`), lang === "he" ? "rtl" : "ltr");
      await send("Emulation.setDeviceMetricsOverride", {
        width: lang === "he" ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile: lang === "he",
      });
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
      await evaluate(`window.__catalogMode = 'network'; document.querySelector('[data-testid="button-retry"]').click()`);
      await wait(exists("text-error"));
      assert.equal(await evaluate(exists("text-empty")), false);
      await evaluate(`window.__catalogMode = 'empty'; document.querySelector('[data-testid="button-retry"]').click()`);
      await wait(exists("text-empty"));
      assert.equal(await evaluate(exists("text-error")), false);
      assert.equal(await evaluate(`document.querySelector('[data-testid="link-import-first"]').getAttribute('href')`), "/import");
    }
    console.log("PASS: English/Russian/Hebrew errors, network failure, retry-to-empty import action, and mobile Hebrew RTL without overflow.");
    assert.deepEqual(await evaluate("window.__catalogErrors"), []);
    await evaluate(`localStorage.setItem('tablewise_language', 'en')`);
    await send("Emulation.clearDeviceMetricsOverride");
  } finally {
    ws.close();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
