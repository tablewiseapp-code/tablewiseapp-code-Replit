# The Week as a cooking plan (`/meals?plan`)

> Screen definition. Product owner request, 2026-11-20. Replaces the 21-slot Breakfast/Lunch/Dinner calendar of 2026-11-19.

The screen answers two questions at a glance: **what am I cooking each day, and how much should I make?**

## URLs

- `/meals`, `/meals?plan` (the nav's link) and `/plan` (redirect) open the current week. `?plan` itself carries no meaning.
- `?week=YYYY-MM-DD` (a Monday) opens that week. Any other value opens the current week.
- `?browse` is the recipe browser, a separate screen.

## Layout

Redesigned by the product owner on 2026-11-20 (the weekly cooking plan): the week is read by cooking day, and approval sits in the header.

- **Header:** "Weekly cooking plan", Previous week / Next week, the date range, and a status pill: Draft, Approved or Changes not saved. Beside them (below the date range on a phone, before any dish):
  - Draft: "Approve plan", with "Approval builds your grocery list."
  - Approved: "View groceries".
  - Changes not saved: "Save changes", with "Save changes to update your groceries."
  - A second tap on an approved plan does nothing.
- **Weekly deals · N offers:** an always-open box under the header, with a slowly pulsing dot beside its title (still when the device asks for reduced motion; product owner, 2026-11-20). It is shown only when an offer applies to the shown week (see Deals). Each offer has "Find recipes": it opens Browse recipes (`/meals?browse&deal=<id>`) with that deal's filter, the same as its "Show recipes" there.
- **Days:** Monday to Sunday, each headed by weekday and date. Today is highlighted in the current week.
  - A **scheduled cooking day** is a weekday the household cooks on (`cookingEvenings`: the preferred weekdays, then the spread days of the weekly count) or any day with a dish. It shows one row per meal enabled under Basic Settings → Meals to plan (none chosen counts as all three, as in ranking), in Breakfast, Lunch, Dinner order, even when the day has no dish yet (2026-11-21). A meal that has dishes always has its row, also when it is no longer enabled, so changing the setting never hides a dish.
  - Each row is headed by its meal. A row with dishes lists them (two dinners in the order they were added, under one Dinner heading); an empty row is one direct action, "+ Add breakfast", "+ Add lunch" or "+ Add dinner", which opens the recipe picker for that date and meal.
  - A cooking day with dishes has "Move day" beside the date and one "+ Add dish" below its rows (another dish for a meal, or a meal that is not enabled). An empty scheduled day shows "+ Add dish" only when some meal is not enabled.
  - A day without cooking is one line: the date and "+ Add dish". Adding a dish makes it a cooking day. A day a dish only covers shows nothing more; the dish's card names it ("7 servings · For Mon–Tue").
  - Weeks with dishes on all seven days (including weeks saved as Breakfast/Lunch/Dinner slots) show seven cooking days.
- **Width:** cards form two columns on wide screens and stack on a phone, with no sideways scrolling at 375 px.
- **Below the days:** "Browse recipes", "Cooking days" (reopens the cooking days with Save and Cancel), "Personalize my recipes" and "Your household".

Every action is a visible, labelled button that works by tap, click and keyboard. There is no drag and drop.

## Dish card

**Folding (2026-11-21).** A day with dishes folds under its date: the date is a button (`aria-expanded`) with a chevron; folded, it shows the day's dish names on one line, cut short when long, and hides the cards and "+ Add dish" ("Move day" stays). In the current week only today starts open; in other weeks every day starts open. Adding a dish to a day, or moving a day there, opens it. What is open is not saved; a reload starts again. A day without dishes is one line and does not fold.

Each planned dish (one batch) appears once, on the day it is cooked, in its meal's row (Breakfast, Lunch or Dinner). A day with one or two dishes shows the shared recipe card's `compact` form (`client/src/components/recipe-card.tsx`, a small photo on the left, two per row on wide screens); a day with three or more shows the standard card with the photo on top, two per row on tablets and three on wide screens (product owner, 2026-11-21). Either card has:

- **Title.** It opens the recipe at this batch (`/recipe/:id?week=…&batch=…`), scaled to the batch total. Back returns to the week.
- **One line:** total time · servings · days covered, e.g. "45 min · 7 servings · For Mon–Tue". The meal is the row heading above (2026-11-21).
  - **Meal.** A dish stores `meal` (Breakfast, Lunch or Dinner). Swap, Edit servings and Move day keep it. A dish saved without one (before 2026-11-20) is Dinner; the draft's dishes take the draft meal (see The draft); Breakfast/Lunch/Dinner slots of older weeks keep their meal.
  - **Time** is the total time, whatever the recipe time setting. Prep and cook times show below with the Recipe View details when chosen there (2026-11-21); the cooking tool stays on the recipe page.
  - **"7 servings"** is the amount to prepare (the batch total, with any edits; half servings as written, e.g. 3.5). It is a button named "Edit servings for {recipe}" that opens Edit servings.
  - **Days covered** come from the serving dates: left out when the dish is eaten only on its cooking day; "For Mon–Wed" for consecutive days, "For Mon & Wed" for separate ones, mixed as "For Mon–Tue & Thu". Dates more than a week after cooking are written in full.
- **Recipe View** nutrition, prep time, cook time and Dietary tags, as chosen in Settings.
- **No longer fits** (2026-11-21): a dish that fails `checkEligibility` for its meal and cooking day (preferences changed after it was planned) shows "No longer fits your preferences: <reasons>" on its card. It is never removed or replaced without the person.
- **Buttons:** icon buttons: Swap (arrows, named "Swap {recipe}"), Try another (circular arrows, named "Try another instead of {recipe}", 2026-11-21), on a lunch or dinner dish Move to dinner (arrow down, named "Move {recipe} to dinner") or Move to lunch (arrow up, "Move {recipe} to lunch"; 2026-11-21), and Remove dish (bin, named "Remove {recipe}"). No "⋯" menu: the request asked for the move in "the existing dish actions menu", and the dish's actions are these buttons.

## Servings

```text
Servings for a date   = adults + kids × 0.5, or a direct amount (half-serving steps) that replaces it
Make X servings       = the sum across the selected dates (a skipped date adds 0)
Ingredient scale      = Make X servings / the recipe's original yield
```

- **Household counts:** adults and kids come from the household members (Basic Settings). A fixed number of servings from Basic Settings counts as adults and wins over the members. Your household's Adults and Children counters set the members (2026-11-21).
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
| + Add dish | Asks Breakfast, Lunch or Dinner, then opens the recipe picker for that date and meal; the pick is added beside the dishes already there. |
| + Add breakfast / lunch / dinner | On an empty meal row: opens the recipe picker for that date and meal directly. |
| Move to dinner / Move to lunch | One tap: a lunch dish becomes a dinner on the same cooking day, or the reverse; it goes after the dishes already in that meal, the others stay in place. Recipe, cooking day, servings, serving dates and the plan status stay (the approved copy changes the same way, since a dish's meal does not change Groceries). Available even when the destination meal is not enabled in Settings; the move applies to this plan only, and drafts keep following Meals to plan. A breakfast has neither. If the save fails, nothing changes and the message offers Try again. |
| Swap | Replaces only that dish's recipe. The cooking date, serving dates and portions stay; quantities use the new recipe's yield. |
| Try another | One tap, no picker: the first picker option for that weekday and meal that is not already in the Week and not yet tried on this dish (since the page opened); after the last one it starts again. Like Swap, dates and portions stay. The toast offers Undo. |
| Servings label (Edit servings) | Changes the dish's dates and amounts, as above. |
| Move day | Moves every dish of that day, together, to another day of the shown week; dishes already there stay. See below for portions that would land before the new day. |
| Remove dish (bin icon) | Removes only that dish (another batch of the same recipe stays). Undo puts it back. |

**Move day, portions before the new day:**

- They are listed by dish, date and amount.
- Each one is either moved to the new day (added to that day's amount) or removed.
- Move is enabled only when every portion is resolved and every dish keeps at least one serving date.
- The move is applied as one change. Cancel changes nothing.

The picker offers eligible catalog recipes for that weekday, best first: the chosen meal's recipes (Swap: the dish's meal), then the others, dinners before lunches before breakfasts. The rules:

- A recipe's own meal rules and the weekday limits apply through `checkEligibility`.
- The Week → Plan filters narrow the list. When nothing passes them, the restrictions alone decide.
- Restrictions are never relaxed.

## The draft

Made once per week (`proposed`), the first time an unapproved week is opened. Saved at once.

- **Missing answers first** (2026-11-21): a household without its household size, requirements or kitchen is sent to `/household?ask=…` for only those questions, then back to the Week (also for `?browse`).
- **Cooking days asked once** (2026-11-21): if they were never set (`setup.scheduled`; settings saved earlier with a finished Your household count as set) and the week has no dish, the Week shows "Your cooking days" in place of the days: evenings per week (1–7, or "Not sure yet"), optional fixed evenings, and the chef challenge day for Chef challenge (the Mon–Fri time limits moved to Personalize my recipes, 2026-11-21). Fixed evenings beyond the count show "You picked N evenings but cook M a week" with "Cook N evenings"; "Plan my week" stays disabled until the count is raised or days are unselected. "Plan my week" saves them and makes the draft; later weeks reuse them. "Cooking days" under the days edits them; a week with dishes then asks "Your preferences have been changed".
- **Cooking days** (`cookingEvenings`):
  - Every fixed evening is a cooking day, even beyond the weekly count.
  - The chef challenge day counts as a preferred weekday.
  - If the count is higher, days are added one at a time. Each added day is the one farthest from its nearest cooking day, with Sunday and Monday adjacent; ties go to the earlier day in Monday-first order.
  - With no preferred days, the days are spread the same way. "Not sure yet" means three.
- **Dishes:** each cooking day without a dish gets one eligible recipe not yet in the week, placed under the **draft meal**: Dinner if enabled under Meals to plan, then Lunch, then Breakfast (`draftMeal` in `client/src/lib/meal-plan.ts`; 2026-11-21). That meal's recipes come first, then the others as in the picker. Showing three meal rows does not mean three dishes: the draft still makes one dish per cooking day. A recipe repeats only when the eligible ones run out.
- **Changes are kept:** reopening the week keeps swaps, extra dishes, serving edits and moves. A moved cooking day changes that week only.
- **Preferences changed** (2026-11-20): `setup.plannedWith` in Basic Settings holds `planKey` of the settings the Week was last planned or kept with (dish-affecting fields only). When it differs on this or a later week with dishes, a dialog "Your preferences have been changed" offers "Update the week" (all dishes of this week replaced by a new draft; status "Changes not saved" if it was approved) and "Keep my week". Either answer records the new key, so it asks once per change. Your household never builds a draft (2026-11-21); the Week does, after the cooking days.

## Approval and Groceries

- **Approve plan** and **Save changes** copy the dishes to the approved copy (`approved`). Groceries use only that copy.
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

## Backlog

- **Morning-only or evening-only planning** (requested 2026-11-21, not built). Some households want to plan only mornings or only evenings. Before building, the product owner must decide whether the preference describes *when people cook* (someone can cook dinner in the morning) or *which meals they want planned*. Until then, the existing Basic Settings → Meals to plan setting is the answer: it decides the meal rows and the draft meal.
