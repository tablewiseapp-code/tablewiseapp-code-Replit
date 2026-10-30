import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { recipeCreditInput } from "../shared/recipe-credit";
import { recipeInput } from "../server/request-schemas";
import { DatabaseStorage } from "../server/storage";
import { registerRoutes } from "../server/routes";
import { researchedDinners } from "../server/seeds/researched-import";
import { developmentFixtures } from "../server/seeds/development-fixtures";
import { curatedDevelopmentIds } from "../server/seeds/curated-development-catalog";
import { openLocalTestDatabase, testSocketArgument } from "./local-test-database";
import { openTestTab } from "./cdp-test-tab";

async function main() {
  assert.deepEqual(recipeCreditInput.parse({ creditKind: "mine", creditName: "  " }), { creditKind: "mine", creditName: null });
  assert.deepEqual(recipeCreditInput.parse({ creditKind: "mine" }), { creditKind: "mine", creditName: null });
  for (const input of [{ creditKind: "chef" }, { creditKind: "chef", creditName: " " },
    { creditKind: "mine", creditName: "x".repeat(121) }, { creditKind: "other" },
    { creditKind: "mine", title: "Not allowed" }]) assert.equal(recipeCreditInput.safeParse(input).success, false);
  assert.equal(recipeInput.safeParse({ title: "Own", ingredients: ["1 egg"], steps: ["Cook in pan."], creditKind: "mine" }).success, true);
  const pool = await openLocalTestDatabase(testSocketArgument()), client = await pool.connect();
  const namespace = `credit_test_${randomUUID().replaceAll("-", "")}`;
  const oldNode = process.env.NODE_ENV, oldFlag = process.env.TABLEWISE_DEV_CURATED_CATALOG;
  const app = express(), server = createServer(app);
  let created = false;
  try {
    await client.query(`CREATE SCHEMA ${namespace}`); created = true;
    await client.query(`SET search_path TO ${namespace}, public`);
    await client.query(`CREATE TABLE recipes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text, title text NOT NULL,
      ingredients text[] NOT NULL, steps text[] NOT NULL, image text, source_url text,
      cook_time integer, prep_time integer, servings text, tags text[],
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    assert.deepEqual(await new DatabaseStorage(drizzle(client, { schema })).getAllRecipes(), [],
      "Legacy schema reads must not require the new credit columns.");
    const migration = (await readFile("migrations/0003_recipe_credit.sql", "utf8")).replaceAll("public.recipes", `${namespace}.recipes`);
    await client.query(migration); await client.query(migration);
    const storage = new DatabaseStorage(drizzle(client, { schema }));
    for (const record of [...researchedDinners, ...developmentFixtures].filter(r => curatedDevelopmentIds.includes(r.id))) {
      const { id, ...input } = record;
      const saved = await storage.createRecipe(input);
      await client.query("UPDATE recipes SET id=$1 WHERE id=$2", [id, saved.id]);
    }
    const id = researchedDinners[0].id;
    const original = (await client.query("SELECT to_jsonb(r)-'credit_kind'-'credit_name' AS row FROM recipes r WHERE id=$1", [id])).rows[0].row;
    await storage.updateRecipeCredit(id, { creditKind: "mine" });
    assert.equal((await storage.getRecipe(id))?.creditName, null);
    await storage.updateRecipeCredit(id, { creditKind: "chef", creditName: "  Fixture creator  " });
    assert.equal((await storage.getRecipe(id))?.creditName, "Fixture creator");
    await assert.rejects(client.query("UPDATE recipes SET credit_kind=NULL,credit_name='orphan' WHERE id=$1", [id]), /recipes_credit_check/);
    process.env.NODE_ENV = "development"; process.env.TABLEWISE_DEV_CURATED_CATALOG = "true";
    const operator = randomBytes(32).toString("hex");
    await registerRoutes(server, app, { storage,
      config: { operatorToken: operator, publicCatalog: true, production: false, aiEnabled: false, analyticsEnabled: false } });
    if (process.argv.includes("--browser")) {
      app.use(express.static(resolve("dist/public")));
      app.use((_req, res) => res.sendFile(resolve("dist/public/index.html")));
    }
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const patch = (id: string, body: unknown, origin = base) => fetch(`${base}/api/development/recipe-credits/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
    });
    assert.equal((await patch(id, { creditKind: "mine" }, "https://unrelated.invalid")).status, 403);
    for (const bad of [{ creditKind: "chef" }, { creditKind: "mine", title: "Overwrite" }]) assert.equal((await patch(id, bad)).status, 400);
    assert.equal((await patch("missing", { creditKind: "mine" })).status, 404);
    for (const target of [id, "tablewise:synthetic:v1:017"]) {
      for (const credit of [{ creditKind: "mine" as const }, { creditKind: "mine" as const, creditName: "Test person" },
        { creditKind: "chef" as const, creditName: "Test creator" }]) {
        const response: Response = await patch(target, credit); assert.equal(response.status, 200);
        const saved = await response.json(); assert.equal(saved.creditKind, credit.creditKind);
        assert.equal(saved.creditName, credit.creditName ?? null);
        assert.equal((await (await fetch(`${base}/api/recipes/${encodeURIComponent(target)}`)).json()).creditName, credit.creditName ?? null);
      }
    }
    assert.equal((await fetch(`${base}/api/recipes/${encodeURIComponent(id)}`, { method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${operator}` }, body: JSON.stringify({ prepTime: null }) })).status, 409);
    assert.equal((await (await fetch(`${base}/api/recipes`)).json()).length, 20);
    assert.deepEqual((await client.query("SELECT to_jsonb(r)-'credit_kind'-'credit_name' AS row FROM recipes r WHERE id=$1", [id])).rows[0].row, original);
    // Production-like configuration must never permit anonymous development writes.
    const deniedApp = express(), deniedServer = createServer(deniedApp);
    await registerRoutes(deniedServer, deniedApp, { storage,
      config: { publicCatalog: true, production: true, aiEnabled: false } });
    deniedServer.listen(0, "127.0.0.1"); await once(deniedServer, "listening");
    try {
      const a = deniedServer.address(); assert.ok(a && typeof a !== "string");
      assert.equal((await fetch(`http://127.0.0.1:${a.port}/api/development/recipe-credits/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${a.port}` },
        body: JSON.stringify({ creditKind: "mine" }) })).status, 403);
    } finally { deniedServer.closeAllConnections(); await new Promise<void>(resolve => deniedServer.close(() => resolve())); }
    if (process.argv.includes("--browser")) {
      const browser = await openTestTab();
      const { evaluate, navigate, wait } = browser;
      const el = (testId: string) => `document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)})`;
      try {
        await browser.call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        await navigate(`${base}/recipe/${encodeURIComponent(id)}`);
        await evaluate("localStorage.setItem('tablewise_language','en')");
        await navigate(`${base}/recipe/${encodeURIComponent(id)}`);
        await wait(el("select-credit-kind"));
        await evaluate(`{const n=${el("select-credit-kind")};n.value="mine";n.dispatchEvent(new Event('change',{bubbles:true}));}`);
        assert.equal(await evaluate(`${el("input-credit-name")}.required`), false);
        await evaluate(`${el("button-save-credit")}.click()`);
        await wait(`${el(`recipe-credit-${id}`)}?.textContent.trim()==="Mine"`);
        await wait(`${el("credit-save-status")}?.textContent==="Recipe credit saved."`);
        await navigate(`${base}/recipe/${encodeURIComponent(id)}`);
        await wait(`${el("input-credit-name")}?.value===""`);
        await navigate(`${base}/plan`);
        await wait(`${el(`recipe-credit-${id}`)}?.textContent.trim()==="Mine"`);
        await navigate(`${base}/meals`);
        await wait(`${el(`recipe-credit-${id}`)}?.textContent.trim()==="Mine"`);
        await navigate(`${base}/recipe/${encodeURIComponent(id)}`);
        await wait(el("input-credit-name"));
        await evaluate(`{const n=${el("input-credit-name")};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'Personal cook');n.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await evaluate(`${el("button-save-credit")}.click()`);
        await wait(`${el(`recipe-credit-${id}`)}?.textContent.trim()==="Mine — Personal cook"`);
        await navigate(`${base}/recipe/${encodeURIComponent(id)}`);
        await wait(`${el("input-credit-name")}?.value==="Personal cook"`);
        await evaluate(`{const n=${el("select-credit-kind")};n.value="chef";n.dispatchEvent(new Event('change',{bubbles:true}));}`);
        assert.equal(await evaluate(`${el("input-credit-name")}.required`), true);
        assert.equal(await evaluate(`${el("button-save-credit")}.disabled`), true);
        await evaluate(`{const n=${el("input-credit-name")};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'Fixture chef');n.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await evaluate(`${el("button-save-credit")}.click()`);
        await wait(`${el(`recipe-credit-${id}`)}?.textContent.includes("Fixture chef")`);
        await navigate(`${base}/recipe/${encodeURIComponent(id)}`);
        await wait(`${el("input-credit-name")}?.value==="Fixture chef"`);
        assert.equal((await storage.getRecipe(id))?.creditName, "Fixture chef");
        assert.deepEqual(browser.exceptions, []);
        console.log("PASS browser on isolated DB: Mine without name, Mine with optional name, Chef with required name, save/reload and both planner credits; actual persistent writes, no API mocks.");
      } finally { await browser.close(); }
    }
    console.log("PASS isolated PostgreSQL/API: idempotent migration, validation, create/storage persistence, Chef/Mine changes, cross-origin/invalid/missing denials, original content/timestamps unchanged, curated timing protection and production-disabled editing.");
  } finally {
    if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    if (created) await client.query(`DROP SCHEMA ${namespace} CASCADE`);
    client.release(); await pool.end();
    if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode;
    if (oldFlag === undefined) delete process.env.TABLEWISE_DEV_CURATED_CATALOG; else process.env.TABLEWISE_DEV_CURATED_CATALOG = oldFlag;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
