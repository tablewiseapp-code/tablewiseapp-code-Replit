import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { registerRoutes, type RecipeStorage } from "../server/routes";
import { researchedDinners } from "../server/seeds/researched-import";
import { developmentFixtures } from "../server/seeds/development-fixtures";
import type { Recipe } from "../shared/schema";

async function main() {
  const rows: Recipe[] = [...researchedDinners, ...developmentFixtures].map(r => ({
    ...r, image: r.image ?? null, sourceUrl: r.sourceUrl ?? null,
    prepTime: r.prepTime ?? null, cookTime: r.cookTime ?? null,
    servings: r.servings ?? null, tags: r.tags ?? null,
    createdAt: new Date(0), updatedAt: new Date(0),
  }));
  const before = structuredClone(rows);
  let writes = 0;
  const storage: RecipeStorage = {
    getAllRecipes: async () => structuredClone(rows),
    getRecipe: async id => structuredClone(rows.find(r => r.id === id)),
    createRecipe: async () => { writes++; throw new Error("Unexpected write"); },
    updateRecipe: async () => { writes++; throw new Error("Unexpected write"); },
    updateRecipeCredit: async () => { writes++; throw new Error("Unexpected credit write"); },
    deleteRecipe: async () => { writes++; throw new Error("Unexpected write"); },
  };
  const oldNode = process.env.NODE_ENV, oldFlag = process.env.TABLEWISE_DEV_CURATED_CATALOG;
  const app = express(), server = createServer(app);
  try {
    process.env.NODE_ENV = "development";
    process.env.TABLEWISE_DEV_CURATED_CATALOG = "true";
    const operator = randomBytes(32).toString("hex"); // Disposable test-only operator.
    await registerRoutes(server, app, {
      storage, config: { operatorToken: operator, publicCatalog: true, production: false, aiEnabled: false, analyticsEnabled: false },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const catalogBefore = await (await fetch(`${base}/api/recipes`)).json();
    assert.equal(catalogBefore.length, 20);
    for (const id of [researchedDinners[0].id, "tablewise:synthetic:v1:017"]) {
      const url = `${base}/api/recipes/${encodeURIComponent(id)}`;
      const detailBefore = await (await fetch(url)).json();
      assert.equal(detailBefore.developmentReadOnly, true);
      for (const body of [{ prepTime: null }, { cookTime: null }, { prepTime: 99, cookTime: 99 }, { title: "Overwrite" }]) {
        const response: Response = await fetch(url, { method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${operator}` }, body: JSON.stringify(body) });
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /read-only/);
      }
      assert.equal((await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${operator}` } })).status, 409);
      const response: Response = await fetch(url);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), detailBefore);
    }
    const catalogAfter: Response = await fetch(`${base}/api/recipes`);
    assert.equal(catalogAfter.status, 200);
    assert.deepEqual(await catalogAfter.json(), catalogBefore);
    assert.equal(writes, 0, "Authenticated writes must be rejected before reaching storage.");
    assert.deepEqual(rows, before);
    console.log("PASS actual HTTP route guards with authenticated test operator: researched/synthetic timing clears, changes and deletions rejected; detail/catalog reload stable; zero storage writes. Isolated in-memory records only, no database or external API.");
  } finally {
    if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode;
    if (oldFlag === undefined) delete process.env.TABLEWISE_DEV_CURATED_CATALOG; else process.env.TABLEWISE_DEV_CURATED_CATALOG = oldFlag;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
