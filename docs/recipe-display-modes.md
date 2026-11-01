# Optional nutrition and mock CAD prices

The owner requested a toggle for grouped ingredients, emphasizing that family
budgets may matter more than nutrition detail, and explicitly selected CAD for
mock prices.

## Display

- **Nutrition details defaults off** for a browser without a preference.
- Off: show all ingredients in their original order; hide food-group headings
  and AI nutrition summaries.
- On: group ingredients by food type and show the existing saved AI nutrition
  estimates. The underlying estimates are not deleted or regenerated.
- The toolbar switch is available in selection and calendar views. A switch is
  also available in expanded ingredient previews and on full recipe pages.
- The setting persists across reloads/navigation using a dedicated browser
  preference. It does not change selections, dates, filters, recipe metadata,
  grocery state or database records.

## Price

All twenty visible development recipes have deterministic example whole-dish
prices in CAD. These are **mock data**, not retailer quotes or AI price estimates.
The price control sits beside the recipe name on cards, selected recipes,
sidebar suggestions, tray/calendar entries and full recipe details.

The collapsed control displays `$` (whole dish up to CAD 10), `$$` (up to CAD 20)
or `$$$` (above CAD 20). One click replaces the symbol with the whole-dish CAD
amount; another click collapses it. Revealing a price does not select or drag
the recipe. Nutrition visibility does not hide the control.

Estimated/AI and mock prices are bold; verified prices use regular weight.
The current dataset contains mock prices only. Visible explanatory labels were
removed as requested, but the accessible label and hover title retain truthful
provenance and explain the tiers/weight convention. Unmapped IDs show a dash
with an accessible unavailable label. No mock value is presented as verified
or claimed to have been AI-generated.

Per-portion calculations remain available in the pricing utility, but the
compact title control reveals only the unambiguous whole-dish amount.

English, Russian and Hebrew labels are included. Original ingredient wording
and quantities remain unchanged in both display modes.

## Reordering information

Each meal-card information item has its own div: portions, time,
tools, preparation, credit, nutrition caption, all six nutrient values and
estimate details. Drag the grip to rearrange items, including moving a nutrient
above portions/tools. Price now stays beside the title instead of in this list.
Older saved layouts discard only the retired price position, preserving all
remaining field positions.

Move-earlier/later buttons provide a touch and keyboard alternative; the grip also
supports Space, all four arrow keys and Space to finish a keyboard drag. Reset order
restores the defaults. The shared browser preference applies to all cards and
survives reloads and nutrition-toggle changes. It never changes recipe values.

Information blocks now form a two-dimensional, two-column grid when the actual
card content area is at least 300px wide, and stack in narrower cards. Pointer
dragging works diagonally/across rows and columns; keyboard Left/Right and
Up/Down use the actual tile positions. Earlier/later buttons move through the
row-major order. Tile contents retain full readable width below their controls.
The underlying ordered field preference is unchanged, so earlier saved layouts
continue to work without changing recipe or planner records.

Compact sidebar/tray/calendar/drag-overlay facts follow the chosen order without
their own field-drag controls, keeping whole-recipe calendar dragging separate.
Full recipe nutrition values can also be individually reordered.

`test:recipe-fact-layout` covers normalization and immutable cross-section moves.
`test:recipe-fact-layout-browser` exercises actual pointer dragging, native
keyboard dragging, move buttons, reset, reload/global synchronization and
preservation of selected recipes and other browser planning data.

## Verification

`npm run validate` includes offline mock-price checks for all twenty IDs,
CAD totals, per-portion ranges, per-item yields and unknown IDs.

The curated development browser suite checks both toggle states, original
ingredient coverage, saved nutrition visibility, example prices on cards and
details, and preference persistence. The meals timing suite verifies that
changing the display preference leaves other browser planning data unchanged.

No database schema, AI invocation, production operation or publication is needed
for this display-only change.
