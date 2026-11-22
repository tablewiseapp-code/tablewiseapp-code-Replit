-- Cook with what I have: the proteins on hand confirmed for a week (client/src/lib/on-hand.ts OnHand: items with an
-- optional amount and the grocery rows confirmed as covered, plus Minimize groceries). NULL = none. Groceries subtract it.
ALTER TABLE "week_plans" ADD COLUMN IF NOT EXISTS "on_hand" jsonb;
