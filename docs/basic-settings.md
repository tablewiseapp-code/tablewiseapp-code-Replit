# My Basic Settings

Route `/settings` (nav: **My Basic Settings**). Six sections: My Household, Dietary Preferences, My Kitchen,
Cooking Preferences, Weekly Meal Planning, Budget & Shopping. Every change autosaves (Saving… / Saved /
Unable to save — Retry). English, Russian and Hebrew (RTL).

## Where it applies

| Place | Effect |
| --- | --- |
| Weekly Meals list and name search | Hard restrictions hide recipes; soft preferences reorder them. A banner says how many are hidden. |
| Cooking-method filter | Only the person's devices, plus No-cook. |
| Selected recipes | An incompatible pick is never removed: it gets a warning with the reason and a **Replace with …** button. |
| Weekly plan | **Fill my week** fills empty slots only, from the selected recipes, using meals to plan, cooking days, time limits, leftovers and servings. |
| Recipe page | Opens at the household's servings when the recipe can be scaled. |
| Grocery list | Pantry items are marked “In your pantry”. |
| My Recipes | Unchanged: always the complete collection. |

## Weekly Meals: active recipe preferences

A compact bar above the search (“Your active recipe preferences”) lists only configured values, grouped as
**Always applied** (diets, allergies incl. per member, devices, a hard time limit), **Planning** (household,
servings, meals, cooking days, leftovers) and **Preferences** (times, per-day preferences, cuisines, favourites,
dislikes, budget…). It shows the first six chips with **Show all / Show less**, the number of hidden recipes, and
**Edit preferences** (→ `/settings`). Settings are the baseline; the page's own filters narrow within it, and
**Clear filters** clears only those. Settings refresh on return from `/settings`, on tab focus, and on saves in
another tab; a cooking-method filter for a device no longer owned is dropped. If no recipe passes the hard
restrictions, the page says “No recipes match your current settings.”, names the restrictions that excluded the
most recipes, and offers Edit preferences — it never falls back to incompatible suggestions.

## Weekly Meals filter sidebar

Order: Meal type, Max cooking time, Protein type, Ingredients (must include / must exclude), Dietary, Cooking
method, Source; **+ More filters** holds Cuisine, My Picks/rating, With my notes and Modified by me. Each filter
appears once. The header shows “Additional filters (n)”, the live matching count, and every active filter as a
chip with its own remove button; **Clear additional filters** resets only these, never My Basic Settings. Filters
are combined with AND in one function (`matchesPlannerFilters`), so their visual order cannot change results.
Difficulty and cost filters are not offered: recipes have no difficulty data and prices are illustrative.

## Rules

**Hard (recipe hidden):** devices; dietary patterns (vegetarian, vegan, pescatarian, gluten-free, dairy-free,
no pork) and allergies (milk, eggs, peanuts, tree nuts, soy, gluten, fish, shellfish, sesame, mustard) for the
household and for every member eating; custom allergies; the time limit only when “Never suggest recipes over my
longest time” is on. Diets and allergens are checked against every ingredient line (`shared/food-rules.ts`):
*contains* and *may contain* (e.g. pesto, chocolate, stock, curry paste unless labelled free-from) both exclude,
and a recipe with no ingredient lines is never treated as safe. Custom allergies match by ingredient name only.

**Per meal (Weekly Meal Planning → Recipes for each meal):** Breakfast, Lunch and Dinner each have a recipe type
(Both / Meatless / Meat) and a maximum total time (prep + cook: 15, 20, 30, 45, 60 min, No limit, or — the default —
“Same as Cooking Preferences”). Meat means meat, poultry or seafood, read from every ingredient line
(`evaluateMeat` in `shared/food-rules.ts`); eggs and dairy are meatless. Unclear lines (stock, curry paste) or no ingredient
lines pass neither Meatless nor Meat, and an unknown total time never passes a time limit. These rules apply only when a
meal is evaluated: Fill my week (each slot uses its own meal; an explicit meal limit replaces the weekday/weekend time for
that meal), replacements, the slot picker (matching recipes first), and the Weekly Meals list when that meal type is
filtered (the meal-type chips show each meal's live match count from the same rules and filters). Without a meal filter the
list uses only the global rules, so a recipe that fails Breakfast still shows for Dinner. Global hard rules (allergies,
diets, devices, hard time limit) always apply first; a meal rule never relaxes them. Older settings without meal rules
read as Both / Same as Cooking Preferences.

**Soft (order only):** favourite/disliked ingredients (household and per member), preferred/avoided cuisines,
weekday/weekend time, quick, minimal clean-up, one-pot and batch cooking (set separately for weekdays and the weekend; Fill my week uses each day's set, the list uses the weekday set), meals to plan, repeat favourites,
familiar vs new, variety against already-selected recipes, ingredient reuse, budget-friendly (catalog
“Budget” tag). With default settings nothing is hidden and the order is unchanged.

**Devices:** each recipe gets AND-of-OR requirements from its steps (`client/src/lib/device-requirements.ts`):
“oven or air fryer” is one either/or group; separate mentions are each required; reheating, storage and optional
mentions are ignored; a kettle's boiling water is not the stovetop; ambiguous mentions stay required. Explicit
`deviceRequirements` on a recipe overrides inference (no stored column yet). Not configured = every device;
an explicitly empty selection is kept and leaves only no-cook recipes.

## Storage

There are no user accounts, so settings live in this browser (`localStorage["tablewise_basic_settings"]`), like
the other TableWise preferences. The document is versioned (v2) and sanitized field by field; the first
version (`{ devices: [...] }`) migrates without loss, including an empty list. Each save re-reads the latest stored
copy and applies only that change, so two tabs don't overwrite each other; other tabs refresh on the `storage`
event. Moving to account storage later is a storage swap behind `loadSettings`/`updateSettings`.

## Not built (no real data behind them)

- Cooking difficulty: recipes have no difficulty data.
- Snacks in planning: the weekly plan has breakfast, lunch and dinner slots only.
- Weekly grocery budget and preferred stores: prices are illustrative and there is no store connection.
- Choosing which members a specific meal is for: supported by the engine (`memberIds`), no UI yet.
- AI recipe generation does not yet receive household restrictions; generated drafts that break them show
  the incompatible warning once selected.

## Tests

`npm run test:basic-settings` (20 checks: persistence, migration, empty vs unset, two-tab merge, failed write,
AND/OR devices, household restrictions, uncertain allergens, ranking, replacement, Weekly Meals filtering,
Fill my week) and `BASE_URL=http://localhost:5001 npm run test:basic-settings-browser` (39 checks: keyboard,
autosave failure/retry, reload, Weekly Meals, My Recipes unchanged, en/ru/he, RTL, desktop/mobile, touch targets) and
`npm run test:weekly-preferences-browser` (34 checks: auto-applied restrictions, chips, soft vs hard time, search, manual
filters + Clear filters, edit → return, Fill my week, My Recipes, no-match state, ru/he RTL mobile). Unit tests: 25.
