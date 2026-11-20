# The Week as a cooking plan (`/meals?plan`)

> Screen definition. Product owner request, 2026-11-20. Replaces the 21-slot Breakfast/Lunch/Dinner calendar of 2026-11-19.

The screen answers two questions at a glance: **what am I cooking each day, and how much should I make?**

## URLs

- `/meals`, `/meals?plan` (the nav's link) and `/plan` (redirect) open the current week. `?plan` itself carries no meaning.
- `?week=YYYY-MM-DD` (a Monday) opens that week. Any other value opens the current week.
- `?browse` is the recipe browser, a separate screen.

## Layout

- **Header:** "Weekly meals", Previous week / Next week, the date range, and a status pill: Draft, Approved or Changes not saved.
- **Weekly deals · N offers:** a collapsed row under the header. It is shown only when an offer applies to the shown week (see Deals).
- **Days:**
  - Seven groups, Monday to Sunday, each headed by weekday and date. Today is highlighted in the current week.
  - A day with dishes lists their cards, then "+ Add a dish" and "Move cooking day" (once per day).
  - An empty day is one compact line: "No cooking planned" and "+ Add a dish".
- **Width:**
  - Desktop: the date sits beside the day's cards, which form a grid.
  - Phone: everything stacks.
- **Below the days:** "Browse recipes" and "Change household".
- **Sticky footer:**
  - Draft: "Approve cooking plan".
  - Approved: "View groceries".
  - Changes not saved: "Save changes".

Every action is a visible, labelled button that works by tap, click and keyboard. There is no drag and drop.

## Dish card

Each planned dish (one batch) appears once, on the day it is cooked. Its card shows:

- **Title.** It opens the recipe at this batch (`/recipe/:id?week=…&batch=…`), scaled to the batch total. Back returns to the week.
- **Time**, per the recipe time setting.
- **"Make X servings"**, the amount to prepare. Half servings are shown as written, e.g. 3.5.
- **"For Sun, Nov 22 & Tue, Nov 24"**, the serving dates.
- **Recipe View rows** (Settings).
- **Buttons:** Edit servings, Swap dish, Remove dish.

## Servings

```text
Servings for a date   = adults + kids × 0.5, or a direct amount (half-serving steps) that replaces it
Make X servings       = the sum across the selected dates (a skipped date adds 0)
Ingredient scale      = Make X servings / the recipe's original yield
```

- **Household counts:** adults and kids come from the household members (Basic Settings). A fixed number of servings from Your household counts as adults.
  - With neither, a new dish makes the recipe's own yield.
- **Original yield:** the leading number of the recipe's servings ("4", "4–6" → 4, "12 muffins" → 12).
  - With no yield, Edit servings asks for one; it is kept on the dish only.
  - Quantities are always scaled from the original recipe, never from an earlier scale.
- **A new dish** has one serving date: its cooking date.
- **Edit servings:**
  - Dates run from the cooking date to the end of the following week. They may be non-consecutive, and the cooking date can be dropped.
  - Each selected date has Adults and Kids steppers, or "Set servings". The total updates live; Cancel discards.
  - Rules: at least one date, a positive total, and no date before the cooking date. Dates are local calendar dates, so no timezone can move a dish.

## Actions

| Button | What it does |
|---|---|
| + Add a dish | Opens the recipe picker for that date and adds the pick beside the dishes already there. |
| Swap dish | Replaces only that dish's recipe. The cooking date, serving dates and portions stay; quantities use the new recipe's yield. |
| Edit servings | Changes the dish's dates and amounts, as above. |
| Move cooking day | Moves every dish of that day, together, to another day of the shown week; dishes already there stay. See below for portions that would land before the new day. |
| Remove dish | Removes only that dish (another batch of the same recipe stays). Undo puts it back. |

**Move cooking day, portions before the new day:**

- They are listed by dish, date and amount.
- Each one is either moved to the new day (added to that day's amount) or removed.
- Move is enabled only when every portion is resolved and every dish keeps at least one serving date.
- The move is applied as one change. Cancel changes nothing.

The picker offers eligible catalog recipes for that weekday, best first: dinners, then lunches, then breakfasts. The rules:

- A recipe's own meal rules and the weekday limits apply through `checkEligibility`.
- The Week → Plan filters narrow the list. When nothing passes them, the restrictions alone decide.
- Restrictions are never relaxed.

## The draft

Made once per week (`proposed`), the first time an unapproved week is opened. Saved at once.

- **Cooking days** (`cookingEvenings`):
  - Every preferred weekday from Your household is a cooking day, even beyond the weekly count.
  - The chef challenge day counts as a preferred weekday.
  - If the count is higher, days are added one at a time. Each added day is the one farthest from its nearest cooking day, with Sunday and Monday adjacent; ties go to the earlier day in Monday-first order.
  - With no preferred days, the days are spread the same way. "Not sure yet" means three.
- **Dishes:** each cooking day without a dish gets one eligible recipe not yet in the week. A recipe repeats only when the eligible ones run out.
- **Changes are kept:** reopening the week keeps swaps, extra dishes, serving edits and moves. A moved cooking day changes that week only.

## Approval and Groceries

- **Approve cooking plan** and **Save changes** copy the dishes to the approved copy (`approved`). Groceries use only that copy.
- **Draft edits** update the cards and the recipe page at once. Groceries wait for Save changes.
- **Counting:** each dish counts once, in the week it is cooked, even when it is eaten next week. Repeated approval, retries and refreshes give the same amounts, because the list is computed from the approved dishes.
- **Changing or removing a dish** changes only its share. Other dishes, hand-added items, checked items and purchases are untouched.
- **Removing a main protein** on Groceries can also remove its dishes. This changes both the plan and the approved copy; Undo restores them.

## Deals

- Offers come from `client/src/lib/food-deals.ts`, still sample data, labelled "Sample deal".
- An offer shows when it has no end date, or ends on or after the week's Monday.
- Offers that match a planned dish's ingredients come first, with "For {dish}".
- Expanded, each shows item, store, price per unit and end date.
- Only offers from My stores (Basic Settings, store picker) show; with no store chosen, every offer shows.

## Week boundaries

Weeks run Monday to Sunday, so a Sunday dish eaten on Tuesday serves the next week, and "move Sunday to Monday" would leave the week. Moving a cooking day stays within the shown week.

## Earlier plans

- Weeks saved with Breakfast/Lunch/Dinner slots are converted when read (`fromLegacy` in `shared/cooking-plan.ts`):
  - each slot becomes a dish cooked on that date, serving its spanned days;
  - its servings are split evenly across those days;
  - a locked week stays approved.
- Browser copies are converted the same way.
- The server refuses the old shape on save.
