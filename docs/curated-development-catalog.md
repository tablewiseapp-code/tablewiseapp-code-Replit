# Twenty complete recipes in development

The owner requested only 20 visible development recipes and chose to **hide,
not delete**, the other 92. Every visible recipe must include portions,
preparation time and tools.

## Current behavior

- The database still contains all 112 original records, with their original
  recipe contents and timestamps preserved.
- The development API's catalog returns exactly 20: the 12 researched recipes
  plus eight explicitly selected synthetic fixtures.
- All 20 have portions, preparation time, cooking time, calculated total time,
  and a non-empty tools list.
- Preparation remains visible on planner cards even when Total Time is selected.
- The eight synthetic entries are labelled **Development estimates: portions,
  times and tools** in both planners and their detail pages.
- Original ingredients, steps, source links, tags and stored timestamps remain
  unchanged. The presentation adds explicit estimate metadata, not fake
  publisher-verified facts.

The selected synthetic entries and **illustrative development values** are:

| Supplied ID suffix | Recipe | Portions/yield | Prep min | Cooking min | Main equipment |
|---|---|---|---:|---:|---|
| 017 | Brilliant Bolognese | 4 | 15 | 30 | Pot, pan, knife, board |
| 002 | Sardine linguine | 4 | 10 | 15 | Pot, pan, knife, board |
| 036 | Gorgeous Greek salad | 4 | 15 | 0 | Bowl, knife, board |
| 039 | Summer chickpea salad | 4 | 15 | 0 | Bowl, knife, board |
| 048 | Puerto Rican Style Steak Sandwich | 2 | 15 | 15 | Pan, knife, board |
| 049 | Smoky Mountain Cheesy Crawfish Omelette | 2 | 10 | 15 | Pan, bowl |
| 050 | Michigan French Toast Sandwich | 2 | 10 | 10 | Pan, bowl |
| 053 | מאפינס בננה עם שוקולד צ׳יפס | 12 muffins | 15 | 25 | Oven, bowl, baking tray |

These eight values are **not researched timings, verified yields or
kitchen-tested guidance**. Their source links retain the supplied unverified
provenance. The twelve researched recipes retain their original source-backed
metadata, including yield ranges and item-count yields.

## Development-only presentation, not a database rewrite

`server/seeds/curated-development-catalog.ts` defines the explicit selection and
estimates. `script/researched-preview.ts` enables the presentation for the
managed development preview, after validating the full stored catalog.

Both list and selected detail responses use the same metadata. Hidden recipes
remain stored and their existing detail URLs remain available; this does not
delete recipes or rewrite saved plans.

The twenty selected entries' **recipe contents are read-only**. Their detail pages
show a translated notice and disable timing inputs, Save and Delete. The API
also rejects authenticated PATCH/PUT/DELETE attempts for these entries before
they reach storage. This prevents clearing required timings or changing a
stored synthetic fixture while its development estimate remains displayed.
The restriction only applies while the development curation is enabled.
The subsequently approved Chef / Mine credit fields are a separate editable
metadata exception; see `docs/recipe-credits.md`. They do not permit overwriting
ingredients, steps, timings or original timestamps.

The curation requires **both** `NODE_ENV=development` and
`TABLEWISE_DEV_CURATED_CATALOG=true`. It is disabled in production even if
the flag is present. No production operation or publication was performed.

For an explicitly requested full-storage/API regression session, starting the
development wrapper with `TABLEWISE_DEV_CURATED_CATALOG=false` restores its full
catalog response without changing any records. The older 100-entry browser
test expects that full view; it should not be run expecting 112 cards while the
20-entry presentation is enabled.

## Verification

- `npm run test:curated-development`: exact selection, all mandatory metadata,
  consistent detail presentation, immutable original records, and the
  production-disabled guard.
- `npm run test:curated-development-api`: the actual HTTP routes with isolated
  in-memory records and an authenticated disposable operator. Clearing or
  changing either selected recipe's timings, changing its title and deleting
  it are rejected, for both a researched and an estimated recipe. Detail and
  catalog reloads remain identical, with zero storage writes.
- `npm run test:curated-development-browser -- "https://$REPLIT_DEV_DOMAIN" --disposable-browser`:
  real APIs, both planners and **all 20 detail pages**, estimate labels,
  required metadata, disabled timing/save/delete controls, edit-attempt/reload
  stability for a researched and estimated entry, mobile overflow and runtime
  checks.
- Existing main-planner and advanced-timing browser suites passed against
  the twenty-entry development view.
- Before the later creator-credit fields were added, a fresh read-only database snapshot matched the complete post-import
  112-record baseline exactly, including all stored metadata and timestamps.
  The secure snapshot is in ignored
  `generated-artifacts/main-development-curated-20-storage.json`.

No recipe-content mutations were performed to create this view. The later
credit feature added two nullable metadata fields and twelve verified creator
credits, while a separate comparison preserved every original column.
