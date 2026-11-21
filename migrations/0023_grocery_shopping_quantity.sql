-- Grocery list redesign (2026-11-20): a shopper's quantity for one item on one list. Recipe items are keyed
-- "<week Monday>|<item>", so edits and removals stay on that week's list; manual items keep "extra:<id>".
-- Rows saved before keep working: no quantity means the item's own quantity.
ALTER TABLE "grocery_shopping_items" ADD COLUMN IF NOT EXISTS "quantity" text;
ALTER TABLE "grocery_shopping_items" ADD CONSTRAINT "grocery_shopping_items_quantity_check" CHECK ("quantity" IS NULL OR length("quantity") BETWEEN 1 AND 40);
