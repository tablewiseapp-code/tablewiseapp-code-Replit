import { inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../shared/schema";
import { dinnerCatalog, type DinnerSeed } from "./dinner-catalog";

function sameContent(row: schema.Recipe, seed: DinnerSeed): boolean {
  return row.title === seed.title
    && row.cookTime === seed.cookTime && row.servings === seed.servings
    && (row.prepTime ?? null) === (seed.prepTime ?? null)
    && row.image === (seed.image ?? null) && row.sourceUrl === (seed.sourceUrl ?? null)
    && JSON.stringify(row.ingredients) === JSON.stringify(seed.ingredients)
    && JSON.stringify(row.steps) === JSON.stringify(seed.steps)
    && JSON.stringify(row.tags) === JSON.stringify(seed.tags);
}

export async function seedDinners(db: NodePgDatabase<typeof schema>) {
  return db.transaction(async (tx) => {
    // Serialize catalog seeders; the primary key also protects against other writers.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74621, 2)`);
    const inserted = await tx.insert(schema.recipes).values(dinnerCatalog)
      .onConflictDoNothing({ target: schema.recipes.id }).returning({ id: schema.recipes.id });
    const stored = await tx.select().from(schema.recipes)
      .where(inArray(schema.recipes.id, dinnerCatalog.map((r) => r.id))).for("update");
    for (const seed of dinnerCatalog) {
      const row = stored.find((r) => r.id === seed.id);
      if (!row || !sameContent(row, seed)) {
        // Throwing rolls back every insert from this run; never repair existing rows.
        throw new Error(`Seed identifier conflict: ${seed.id}. No rows from this run were committed.`);
      }
    }
    return { inserted: inserted.length, skipped: dinnerCatalog.length - inserted.length };
  });
}
