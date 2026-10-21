# Preparation / total time, equipment, and recipe links

## Behavior

The planners have a Preparation / Total Time toggle that updates the time shown
under available recipes and selected dishes.

The user changed the earlier Preparation / Cooking display to Preparation /
Total Time. Chicken with 10 minutes of preparation and 50 minutes in the oven
now shows **Preparation: 10 min** or **Total Time: 60 min**.
The chicken test recipe has those supplied values. Other preparation times
remain unknown rather than being guessed from recipe instructions or totals.
Existing cooking-time values are not changed or automatically split. Total
time is derived only when both durations are known; a missing preparation or
cooking value makes the total unspecified, not an assumed zero.

The display preference is remembered on the device. It does not change saved
plans, assignments, portions, grocery quantities, or analytics definitions.
Unknown values are identified explicitly; an explicitly saved zero shows 0 min.
English, Russian, and Hebrew labels are included.

The advanced `/meals` planner also carries the raw preparation/cooking minutes
and portions from `/api/recipes`. Its catalog, selected recipes, planning
sidebar, used-recipe tray, calendar cells, and drag-overlay markup use the
selected display. Both planners share the same device display preference.
Legacy Cooking preferences default to Total Time. The advanced Max minutes
filter applies to the selected display; with a limit active, recipes with
unknown times for that display are excluded. No step-count
estimate or inferred portion range is displayed as recorded recipe data.

The advanced planner also shows equipment explicitly mentioned in the saved
recipe instructions, with localized tool names. Missing equipment is marked
unspecified, not “No-cook.” Cards, selections, the planning sidebar, tray, and
calendar cells have **Show Recipe** links to the corresponding recipe detail.
Their pointer and keyboard events do not start dragging. The decorative drag
overlay has no interactive recipe link.

The visible label is now **See full recipe** in both planners. The default
Three dinners page includes the link beneath available recipes and selected
dishes; opening a recipe does not change selections, assignments or groceries.
Production was inspected read-only: its database and public API both contain
three existing recipes, with no reviewed dinner seed IDs. The twelve reviewed
dinner fixtures remain isolated test data, not a production import. Publishing
the UI does not import those fixtures into production.

## Editing

On a recipe's detail page, open **Edit recipe times** to enter separate
preparation and cooking minutes. Empty fields save as unknown (`null`).
Values must be whole minutes from 0 through 10080.

Saving uses the existing protected recipe PATCH endpoint. Operator authorization
is required. This work does not add accounts, an operator sign-in screen, public
write permissions, or any paid AI calls. Failed saves are reported, not shown as
successful.

## Storage and production boundary

- The additive migration is `migrations/0002_recipe_preparation_time.sql`.
- It adds one nullable `prep_time` integer column and a range constraint.
- It does not update, delete, seed, or infer any existing recipe data.
- There is no automatic migration on startup or post-merge.
- Production schema/data were not changed by this implementation.
- Existing production catalog reads remain compatible before that column is
  installed: missing preparation metadata is returned as unknown.
- Attempts to save preparation times without the column are rejected with a
  sanitized 503 and no partial changes. New recipe creation also requires the
  reviewed schema update; it must not be published as an editing-ready release
  before that setup is complete.
- Adding the column to production requires separate approval and an explicit
  reviewed production database operation. Republishing alone does not supply
  preparation values for the three existing production recipes.

The temporary test database disappeared during a workspace restart. The same
authorized socket-only target was recreated, its server isolation verified
before recipe/schema writes, and the reviewed fixtures restored. Only that
local test catalog contains the supplied chicken preparation value.

Local-only setup:

```sh
npm run timing:setup:local -- --test-socket /tmp/tablewise-phase2-pilot/socket
```

## Verification

- Focused TypeScript and production build.
- Fresh local PostgreSQL namespace: old-schema reads, failed preparation writes
  without partial changes, repeat-safe additive migration, protected API
  create/edit/read round trips, independent 10/50 values, invalid input rejection,
  zero, and clearing to unknown.
- Real browser/API: toggle applies to the catalog and selections, choice
  survives refresh, plan bytes remain unchanged, and chicken switches 10 / 50.
- Existing planner/grocery, replacement, week separation, fault, storage,
  mobile, Russian, and Hebrew browser checks.
- Timing editor in a real browser: actual 10/50 values load; an unauthorized
  save fails explicitly and leaves the actual recipe unchanged.
- Browser-only fixture responses verify successful editor rendering and PATCH
  payloads, zero/clearing, input constraints, and mobile width. These fixture
  responses are not evidence of production authorization or production writes.
  Actual persistence is separately verified with the real local PostgreSQL/API.
- All 16 existing server security test groups; no real AI calls.

Commands:

```sh
npm run check:analytics
npm run test:recipe-timing -- --test-socket /tmp/tablewise-phase2-pilot/socket
npm run test:mvp-browser -- "https://$REPLIT_DEV_DOMAIN"
npm run test:pilot
npm run build
```

### Advanced planner verification

`npm run test:meals-timing` checks raw API mapping, stored 10/50 durations and
derived total 60, equipment word matching without default guesses,
missing/invalid/zero values, and preserving actual portion strings rather than
displaying inferred ranges.

`npm run test:meals-timing-browser -- "https://$REPLIT_DEV_DOMAIN"` checks the real
read-only API, Show Recipe navigation and links, equipment labels,
catalog/selection toggle, preparation/total time limits, preference
persistence, shared MVP preference, mobile layout, and Russian/Hebrew rendering.
Calendar/sidebar/tray rendering uses an explicitly seeded browser-local saved
assignment fixture. Mouse-drag automation was unreliable and is not claimed as
verified. An additional browser-fetch fixture was also unreliable; missing/zero
normalization is covered by the unit tests, not claimed as browser-fixture
verification. No drag handlers, server API, database schema, or production data
were changed for this advanced-planner update.
