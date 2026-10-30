# Meal category review and filter contract

## Scope and evidence

Reviewed the twelve records in `imports/researched-dinners.json` against their
linked publisher pages on 2026-10-30. This is a source-referenced editorial
review, not kitchen testing, an allergen assessment, or an instruction to change
an application database. No recipes, seed files, import files, schema, or database
records were changed.

All twelve imported records already carry the explicit `Dinner` tag. Those
reviewed tags are recognized as Dinner; unrelated existing tags are preserved.
The table distinguishes existing editorial dinner assignments from explicit
publisher meal-time language. A generic “meal”, children helping to cook,
freezability, reader comments, and links to other recipes do **not** establish
Breakfast, Lunch, Lunchbox, or School lunchbox.

| Imported recipe / cited source | Existing assignment and evidence | Additional supported proposal | Unknowns |
| --- | --- | --- | --- |
| [Easy chicken curry](https://www.bbcgoodfood.com/recipes/easy-chicken-curry) | Dinner; publisher says “family dinners”. | None | Breakfast, Lunch, both lunchbox labels |
| [Salmon egg-fried rice](https://www.bbcgoodfood.com/recipes/salmon-egg-fried-rice) | Dinner; publisher calls it a “simple salmon supper”. | None | Breakfast, Lunch, both lunchbox labels |
| [Red lentil, carrot and leek soup](https://www.bbcgoodfood.com/recipes/lentil-soup) | Existing editorial Dinner; publisher describes “satisfying lentil soup”, without an explicit meal-time claim in its description. | None | Breakfast, Lunch, both lunchbox labels |
| [Simple baked salmon](https://www.bbcgoodfood.com/recipes/baked-salmon) | Dinner; publisher explicitly says “for lunch or supper”. | Add `meal:lunch`, preserving Dinner and all other tags | Breakfast, both lunchbox labels |
| [Coconut chickpea and kale curry](https://www.budgetbytes.com/coconut-curry-chickpeas/) | Dinner; publisher calls it an “easy weeknight dinner”. | None | Breakfast, Lunch, both lunchbox labels |
| [One-pot creamy sun-dried tomato pasta](https://www.budgetbytes.com/one-pot-creamy-sun-dried-tomato-pasta/) | Dinner; publisher describes “quick and satisfying weeknight dinner”. | None | Breakfast, Lunch, both lunchbox labels |
| [Black bean and corn quesadillas](https://www.budgetbytes.com/hearty-black-bean-quesadillas/) | Existing editorial Dinner; publisher describes a filling “snack or light meal”. | None; reader lunch comments, student suitability, and freezing are not reviewed lunchbox evidence | Breakfast, Lunch, both lunchbox labels |
| [Spanish potato and pepper omelette](https://www.bbcgoodfood.com/recipes/spanish-omelette) | Existing editorial Dinner; publisher calls it a “great meal to make with older children”. | None; neither the title nor children helping establishes Breakfast or School lunchbox | Breakfast, Lunch, both lunchbox labels |
| [Easy tuna and sweetcorn pasta bake](https://www.bbcgoodfood.com/recipes/easy-tuna-pasta-bake) | Existing editorial Dinner; source preparation/serving guidance supports a cooked main dish, not an additional time-of-day label. | None; a reader’s lunch comment is not publisher classification | Breakfast, Lunch, both lunchbox labels |
| [Garlic butter baked chicken thighs](https://www.budgetbytes.com/garlic-butter-baked-chicken-thighs/) | Dinner; publisher says “no-fuss weeknight dinner recipe”. | None | Breakfast, Lunch, both lunchbox labels |
| [Beef and Sichuan pepper stir-fry](https://www.bbcgoodfood.com/recipes/beef-sichuan-pepper-stir-fry) | Existing editorial Dinner; publisher says “speedy midweek meal for four”, without additional meal-time classification. | None | Breakfast, Lunch, both lunchbox labels |
| [Spaghetti with beef and sausage meatballs](https://www.bbcgoodfood.com/recipes/meatballs-spaghetti) | Existing editorial Dinner; publisher describes a family favourite, with cooked spaghetti serving instructions. | None | Breakfast, Lunch, both lunchbox labels |

### Dry-run metadata proposal (not applied)

Only Simple baked salmon has a newly proposed category: append `meal:lunch` to
its current tags, preserving `Dinner`, `Fish`, and `Source-verified`. Match its
existing identifier and source URL during a separately authorized metadata
operation; never create a replacement recipe. The proposal is deliberately
documentation-only and is not auto-loaded into the catalog or preview.

Breakfast, Lunchbox, and School lunchbox have no supported additions from this
review. Lunch also remains empty in the unchanged researched import. This is
honest missing metadata, not a reason to invent recipes or infer categories.

## Canonical tag mapping

`meal:breakfast`, `meal:lunch`, and `meal:dinner` are canonical. Exact legacy
`Breakfast`, `Lunch`, `Dinner` aliases are supported case-insensitively after
Unicode/whitespace normalization. Recipes may have several of these tags.

`suitability:lunchbox` and `suitability:school-lunchbox` are canonical;
exact aliases `lunchbox`, `lunch box`, `school-lunchbox`, and `school lunchbox`
are accepted. School lunchbox also qualifies for general Lunchbox. Neither
suitability tag implies Lunch or any other meal type. Partial tags such as
`breakfast-friendly` do not qualify. Unknown/unclassified tags qualify only
when their category restriction is reset to All/Any.

School lunchbox is an editorial suitability label, **not** a guarantee about
school policies, allergens, cross-contamination, or storage without refrigeration.
No such labels are newly assigned in this review.

## Browsing and compatibility

The default planner uses only explicit tags, never the advanced planner's legacy
title heuristics. Groups combine with AND; selected meal types combine with OR.
Ingredient include terms all must match; any excluded term rejects, including
an include/exclude conflict. Terms match within individual ingredient lines,
with normalized whitespace/case and Unicode word/phrase boundaries; `nut` does
not match `coconut`, and plural/synonym expansion is not supplied.

Time caps use the existing Preparation / Total Time semantics. Unknown durations
fail active caps and remain visible without a cap; explicit zero is known.
Clear resets restrictions, not the shared time-display preference.

Restrictions are versioned browser-local browsing preferences at
`tablewise:meal-filters:v1`, separate from week plans and grocery check marks.
Malformed/future versions recover to unrestricted browsing. Unavailable storage
does not block planning; failed preference saves are reported on the page.
Filters never save/mutate plans, discard selections, change confirmation
eligibility, or send analytics. Replacement candidates respect the filters and
show a no-replacement message without clearing the existing meal.

Default planner/grocery/navigation labels say meals/days in English, Russian,
and Hebrew. Legacy function/key identifiers and saved-document formats remain
unchanged. The advanced planner and recipe library are not redesigned.
