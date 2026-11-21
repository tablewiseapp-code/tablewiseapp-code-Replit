import { and, eq, sql } from "drizzle-orm";
import { groceryShoppingItems } from "@shared/schema";
import type { z } from "zod";
import type { groceryShoppingPatch } from "./request-schemas";

export async function readGroceryShopping(ownerId: string) {
  const { db } = await import("./db");
  const rows = await db.select({
    key: groceryShoppingItems.itemKey, skipped: groceryShoppingItems.skipped,
    priceCents: groceryShoppingItems.priceCents, priceText: groceryShoppingItems.priceText, quantity: groceryShoppingItems.quantity,
  }).from(groceryShoppingItems).where(eq(groceryShoppingItems.ownerId, ownerId));
  return rows;
}

export async function patchGroceryShopping(ownerId: string, input: z.infer<typeof groceryShoppingPatch>) {
  const { db } = await import("./db");
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}), 32)`);
    // Edits of a week's list ("2026-11-16|…") are dropped once that week is eight weeks old.
    const cutoff = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);
    await tx.delete(groceryShoppingItems).where(and(eq(groceryShoppingItems.ownerId, ownerId),
      sql`${groceryShoppingItems.itemKey} like '____-__-__|%' and left(${groceryShoppingItems.itemKey}, 10) < ${cutoff}`));
    const rows = await tx.select({ key: groceryShoppingItems.itemKey }).from(groceryShoppingItems)
      .where(eq(groceryShoppingItems.ownerId, ownerId));
    if (rows.length >= 1000 && !rows.some(row => row.key === input.key)) return null;
    const changes = input.skipped !== undefined ? { skipped: input.skipped }
      : input.quantity !== undefined ? { quantity: input.quantity }
      : { priceCents: input.price!.cents, priceText: input.price!.text };
    const [row] = await tx.insert(groceryShoppingItems).values({ ownerId, itemKey: input.key, ...changes })
      .onConflictDoUpdate({ target: [groceryShoppingItems.ownerId, groceryShoppingItems.itemKey], set: changes })
      .returning();
    return { key: row.itemKey, skipped: row.skipped, priceCents: row.priceCents, priceText: row.priceText, quantity: row.quantity };
  });
}
