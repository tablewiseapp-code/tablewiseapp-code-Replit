// Local development only: gives every grocery row of every owner's Week (and their hand-added products)
// a random CAD price estimate, so the category totals on /grocery-list have data. Existing prices are kept.
// Usage (in the app container): npx tsx script/seed-grocery-prices.ts
import { sql } from "drizzle-orm";
import { groceryExtras, groceryShoppingItems, recipes, weekPlans } from "../shared/schema";
import { buildRecipeGroceryRows } from "../client/src/lib/grocery-meal-removal";
import { buildShoppingList } from "../client/src/lib/grocery-items";
import { toPlannerRecipes } from "../client/src/lib/planner-recipes";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Local development seeding only.");
  const { db, pool } = await import("../server/db");
  const catalog = toPlannerRecipes(await db.select().from(recipes) as never);
  const extras = await db.select().from(groceryExtras);
  let count = 0;
  for (const plan of await db.select().from(weekPlans)) {
    const rows = buildRecipeGroceryRows({ selectedIds: plan.selectedIds, planAssignments: plan.planAssignments } as never, catalog);
    const own = extras.filter(extra => extra.ownerId === plan.ownerId);
    const { activeRows } = buildShoppingList(rows, own, new Set(), new Set());
    if (!activeRows.length) continue;
    await db.insert(groceryShoppingItems)
      .values(activeRows.map(row => ({
        ownerId: plan.ownerId, itemKey: row.key, priceText: row.ingredient,
        priceCents: 150 + Math.floor(Math.random() * 2350), // CAD 1.50–24.99
      })))
      .onConflictDoUpdate({
        target: [groceryShoppingItems.ownerId, groceryShoppingItems.itemKey],
        set: { priceCents: sql`excluded.price_cents`, priceText: sql`excluded.price_text` },
        setWhere: sql`${groceryShoppingItems.priceCents} IS NULL OR ${groceryShoppingItems.priceText} <> excluded.price_text`,
      });
    count += activeRows.length;
  }
  console.log(`Priced up to ${count} grocery rows.`);
  await pool.end();
}

main().catch(error => { console.error(error); process.exit(1); });
