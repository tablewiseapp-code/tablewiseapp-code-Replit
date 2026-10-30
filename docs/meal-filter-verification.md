# Minimal meal filters: verification

## Automated checks

- `npm run test:meal-filters`: deterministic tag classification, multiple meal
  types, unknown categories, school/general lunchbox hierarchy, AND/OR group
  semantics, ingredient boundary/phrase/Unicode/normalization/conflict handling,
  unknown/invalid/zero stage times, strict versioned preference recovery and
  unavailable storage. Confirms breakfast, lunch and unclassified fixtures can
  make the same three-recipe plan and grocery list, without changing plan data
  under filtering. Reads the researched import without modifying it.
- `npm run test:meal-filters-browser -- "https://$REPLIT_DEV_DOMAIN"`: fresh
  browser-only API fixtures exercise real planner, recipe and grocery UI.
  Keyboard Enter opens the panel, Escape closes and restores focus.
  Tests combined time/ingredient filtering, non-dinner selection, saved-plan
  invariance and confirmation eligibility, zero replacements without selection
  loss, collapsed chips and Clear, refresh and recipe-return persistence,
  three-meal confirmation/groceries, malformed optional preferences, localized
  controls, Hebrew RTL, long tokens at 320px with no horizontal overflow, and
  existing stale/loading/error/empty catalog safeguards.
- `npm run test:mvp`, `npm run test:planner-return`,
  `npm run test:meals-timing`: existing plan, grocery, navigation and timing
  compatibility checks. No database argument is passed.
- `npm run test:mvp-browser -- "https://$REPLIT_DEV_DOMAIN"`: existing
  read-only real-catalog browser checks passed for detail navigation, all
  selections and dates, confirmation, exact groceries/check marks, replacement,
  week isolation, API faults/recovery, simulated recipe deletion, local-storage
  corruption/quota failure, Russian and Hebrew, and mobile layouts. Its
  time-control checks now open Filters; recipe pathname assertions correctly
  expect encoded identifiers. No application recipe data is mutated.
- `npm run check:mvp` includes both new test scripts; `npm run build` checks
  production compilation.

The browser fixture recipes are explicitly regression data, not additions to
the real recipe catalog. All API requests in that test tab are intercepted, so
these tests do not write to any application database. The configured researched
preview restarted successfully; a mobile screenshot of its unchanged real
catalog confirmed the default collapsed panel and three-meal layout.

## Limits

Automated keyboard and semantic-label checks do not substitute for a session
with a physical keyboard or a screen-reader user. No manual assistive-technology
session, kitchen testing, public pilot, deployment, database migration, or
application metadata write was performed.

The current researched import still contains twelve explicitly tagged dinners.
It has no Breakfast, Lunch, or lunchbox assignments; empty results there are
intentional. The source-supported Lunch proposal is documentation-only in
`docs/meal-category-review.md`.
