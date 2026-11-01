---
name: Recipe display modes
description: Optional nutrition grouping and mock CAD pricing for different recipe audiences.
---

Provide a Nutrition details toggle. When enabled, show ingredients grouped by
Protein, Carbs and other food types together with nutrition estimates. When
disabled, show the complete plain ingredient list and hide nutrition details.

**Why:** The user first requested food-type grouping, then explicitly requested
a toggle because a mother of five may prioritize price rather than nutrition.
This describes a product audience, not a personal fact about the user.

**How to apply:** Default to the simpler view, remember the browser preference
and keep the switch available near expanded previews as well as the main
toolbar. Preserve original wording, quantities and every ingredient in either
mode; keep an honest Other/unclassified group when grouping is enabled.

Show a $/$$/$$$ price control beside the recipe name in either mode. A click
reveals the whole-dish CAD amount. Keep explanatory text out of the visible UI;
use bold for estimated/mock prices and regular weight for verified prices.

**Why:** The user chose CAD for mock prices, then explicitly requested price
beside the name, dollar-symbol tiers, click-to-reveal and bold rather than
explanatory text to distinguish estimated values from real numbers.

**How to apply:** Preserve truthful mock/AI/verified provenance in accessible
labels/tooltips, even when visible labels are omitted. Never call hardcoded
mock prices AI-generated or verified. Use whole-dish tiers, not per-person
prices presented as dish totals. Price is fixed by the title, outside the
reorderable facts; preserve other saved field positions when migrating.
Do not imply currency conversion. Preserve saved nutrition/planner data;
display preferences must not trigger paid AI or database mutations.

Make individual recipe information blocks reorderable, including each nutrient,
and retain one shared browser layout rather than changing the stored recipes.
Use a two-dimensional grid with dragging across rows and columns, not a
vertical-only list.

**Why:** The user explicitly requested separate draggable elements to exchange
their positions, then clarified “I want it to be 2d array.” A shared layout avoids repeating the same customization on
every recipe and preserves a consistent comparison layout.

**How to apply:** Keep field-order preference separate from planning data and
nutrition visibility. Use field handles and keyboard/touch alternatives on
cards; compact calendar facts inherit the order without interfering with
whole-recipe calendar dragging. Retain reset and hidden-field positions.
