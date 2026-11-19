# Week → Plan filters and Food deals

The panel is `client/src/components/week-filter-panel.tsx`, shown on the Week page and in Your household (`/household`) with one saved state (`client/src/lib/week-filters.ts`, the `filters` of the `weeklyMealsState` browser copy). Suggested dinners, the full Suggested week, swaps and replacements apply these filters after the household restrictions. For the Week calendar's slots (`proposeWeek`, `slotOptions`) Meal type is ignored, and a slot no recipe passes the filters for falls back to the restrictions alone. In Your household the panel (`variant="onboarding"`) leaves out Dietary and Kitchen tools, shows Meal type first and Cuisine up front as optional; hidden filters still apply and still show as chips.

Definitions live in `client/src/lib/planner-filters.ts` (`dietaryOptions`, `cookingLevels`, `weekTimeOptions`) so tools and standing dietary preferences can move into Basic Settings later. Sample deals live
in `client/src/lib/food-deals.ts`. Basic Settings restrictions (allergies, diets, devices) still apply first.

## Matching rules

A positive match needs an explicit recipe tag or a supported calculation. Missing data never matches.
Tags are compared case-insensitively, ignoring spaces, `-` and `_`.

| Filter | Matches |
|---|---|
| Total time | prep + cook ≤ the limit (Any, or 15, 20, 30, 40, 45, 60; default 30) |
| Cooking level | tag `level:easy`, `level:intermediate` or `level:advanced` |
| Gluten-free, Dairy-free, Vegan | that tag |
| Vegetarian | `vegetarian` or `vegan` tag |
| Pescatarian | `pescatarian`, `vegetarian` or `vegan` tag, or no land meat in any ingredient line (`evaluateDiet("pescatarian")` is `ok`) |
| Mediterranean-style | `mediterranean-style` or the `Mediterranean` cuisine tag |
| Keto, Paleo, Low-sodium, Low added sugar | that tag only (no sodium or added-sugar data) |
| Egg-free, Peanut-free, Tree-nut-free, Soy-free, Kosher, Halal | that tag only |
| Kid favourites | `kid friendly` tag |
| Kitchen tools | instructions mention at least one selected tool (`tools` in `planner-recipes.ts`); offered: the devices in Basic Settings plus No-cook |
| Source | "My recipes" (no source link) or "Imported" (has a source link); "Trusted authors" and "Personal" match nothing |
| Cuisine | the recipe's cuisine tag; only cuisines present in the eligible recipes are offered |
| My picks, Minimum rating | the old per-browser pick and rating; nothing writes them now, so they match nothing |
| With my notes, Modified by me | never recorded; they match nothing |
| Food deal | an ingredient line contains one of the deal's terms as whole words (e.g. "chicken thigh(s)") |

## Per-serving nutrition thresholds

Used only when the recipe has real (not mock) nutrition and a numeric serving count. A serving range is judged at
its least favourable end. A matching tag (`high-protein`, `low-carb`, `lower-calorie`, `high-fibre`) also qualifies.

| Filter | Threshold per serving |
|---|---|
| High-protein | protein ≥ 20 g |
| Low-carb | carbohydrates ≤ 20 g |
| Lower-calorie | ≤ 500 kcal |
| High-fibre | fibre ≥ 6 g |

## AI generation

"Generate recipe with AI" receives time, Vegetarian, Gluten-free, Kid favourites, kitchen tools, protein, meal type
and ingredients. Cooking level, the newer dietary options and the deal are listed as "not applied".

## Food deals

Hardcoded sample offers, labelled "Sample deals". Categories added with **+** last for the visit only.
