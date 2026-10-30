# Meals is the main screen

The owner requested making `/meals` the main screen and removing the
three-meal `/plan` screen.

- `/` redirects to the canonical `/meals` URL.
- `/plan`, including old bookmarks with query parameters, redirects to `/meals`
  rather than rendering the retired screen.
- Weekly Meals is the first desktop and mobile navigation destination. The
  three-meal navigation item is removed.
- Recipe detail and existing grocery return links lead to `/meals`.
- The main title is Meals, without the obsolete Step 2 prefix, in English,
  Russian and Hebrew.
- Recipe library, import tools, grocery routes and the twenty-recipe catalog
  remain available.
- No recipe records, saved plans, calendar assignments or grocery checkmarks
  were deleted or migrated. The former three-meal state is retained in browser
  storage but is not automatically converted into a weekly-meals plan.

The retired page is no longer imported or rendered by the app router. Its
unrouted source and pure legacy data helpers are retained for reference and
existing saved-grocery compatibility, not as an active screen.

## Current verification

- `npm run validate`
- `npm run test:planner-return`
- `npm run build`
- `npm run test:curated-development-browser -- "https://$REPLIT_DEV_DOMAIN" --disposable-browser`
- `npm run test:meals-timing-browser -- "https://$REPLIT_DEV_DOMAIN"`

The current browser suites cover canonical/legacy redirects, desktop/mobile
navigation, preserved legacy storage, all twenty detail pages and return links,
the weekly planner and calendar, timing preference, credits and mobile layout.
Older browser scripts specifically targeting the retired Three dinners UI are
historical, not acceptance tests for the current main screen.

No database migration, production operation or publication was performed.
