# Phase 3 — three-dinner planner

## Status and scope

The expected completed Phase 3 implementation was not present on the local
branches, and the requested upload contained no implementation files. After
approval, the missing prerequisite was rebuilt alongside Phase 4. This report
describes the implemented contract, not an assumed earlier implementation.

The MVP planner is now at `/plan`; `/` is an alias. The existing advanced
planner remains at `/meals`, unchanged.

## Customer flow

1. Open a dated calendar week.
2. Choose exactly three different recipes from the real recipe API.
3. Assign each recipe to a different day within that week.
4. Save/confirm the three dinners.
5. Follow **View Grocery List** to that same week's groceries.

Selecting a fourth dinner is disabled. Removing, replacing, or rescheduling a
selected dinner reopens confirmation. Replacing a recipe preserves its day.
Confirmation requires three valid selections, three distinct assigned days,
and a successfully loaded catalog containing all three recipes.

Previous/next week controls navigate explicitly dated URLs. EN/RU/HE interface
copy and Hebrew RTL use the existing language setting. Recipe content remains
in its stored language.

## Actual state contract

The MVP does **not** read or migrate `weeklyMealsState`.

Each week has its own versioned local-storage document:

```text
tablewise:mvp:plan:v1:2026-10-19
```

Example shape (illustrative recipe IDs):

```json
{
  "version": 1,
  "weekStart": "2026-10-19",
  "selectedRecipeIds": ["recipe-a", "recipe-b", "recipe-c"],
  "assignments": {
    "recipe-a": "2026-10-19",
    "recipe-b": "2026-10-21",
    "recipe-c": "2026-10-23"
  },
  "confirmed": true
}
```

Weeks begin on Monday and dates are local-calendar `YYYY-MM-DD`, not UTC
timestamps or an undated rolling seven-day window. Invalid explicit week links
show a recovery screen rather than silently opening another week. Zod validates
stored version, shape, week, unique selections, assignments and confirmation.

Only explicit user actions write state. Mounting a screen, retrying the recipe
API, or encountering an unavailable recipe never removes selections.

Malformed saved data remains untouched until explicit reset confirmation.
Unavailable/quota-limited storage displays an error and keeps the previous
saved document. Stale writes are refused if another tab has changed the raw
document; the user can reload the saved version.

## Files

- `client/src/lib/week-plan.ts`: calendar helpers, schemas, selection,
  replacement, assignment and confirmation.
- `client/src/hooks/use-week-workspace.ts`: guarded browser persistence and
  real recipe query.
- `client/src/pages/mvp-planner.tsx`: focused planner.
- `client/src/lib/mvp-copy.ts`: typed EN/RU/HE interface copy.
- `client/src/App.tsx`: MVP routes and preserved legacy route dispatch.
- `client/src/lib/i18n.tsx`: new planner navigation label.

## Verification

- Fixture tests cover calendar boundaries, invalid dates/links, schema
  invariants, three-selection limit, assignment validation and replacement.
- A real Chromium journey chose, dated and confirmed three actual API recipes.
  Reload, replacement, next/previous week and independent storage passed.
- Malformed JSON and simulated browser quota failure left prior raw storage
  unchanged and displayed explicit recovery messages.
- Advanced `/meals` and legacy `/grocery-list` still render separately;
  MVP navigation does not overwrite `weeklyMealsState`.

Commands and the complete grocery test matrix are in
[Phase 4](phase-4-grocery.md). The fixture and browser tests are retained in
`script/test-mvp-grocery.ts` and `script/test-mvp-browser.ts`.

## Boundaries

Plans are device/browser/origin-local, not accounts or server-backed plans.
Clearing site storage, changing preview origin, or changing devices does not
preserve them. No authentication, analytics, AI recommendations or deployment
was added for this work. Public pilot approval remains separate.
