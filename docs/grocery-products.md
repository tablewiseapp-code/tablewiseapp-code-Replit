# Household product suggestions and reference pictures

The current grocery list’s Add item form searches a shared Postgres catalog of 101 common food and household products. Names are available in English, Russian and Hebrew; aliases include “tooth brush”, “yoghurt” and “trash bags”. Matching searches all three languages and aliases, prioritizes name prefixes, and shows up to 12 suggestions. Arrow keys navigate, Enter selects, Escape dismisses. Custom text always works, including when the catalog cannot load. No AI is required.

An item needs a name and may have one reference picture. JPEG, PNG and WebP up to 10 MB are decoded and re-encoded in the browser as a JPEG, at most 640 pixels on its longest side and 210 KB. Originals and metadata are discarded. A preview can be removed before saving. Saved photos live in owner-scoped grocery_extras and survive reloads; deleting an extra deletes its original picture. Re-adding the same name with a new photo replaces that photo, while re-adding without one preserves it. Saving is disabled during processing and in-flight requests.

Existing rows have a picture options menu for Add picture / Change picture / Remove picture. This also works on checked rows (expand completed categories first) and recipe ingredients. A thumbnail opens a keyboard-accessible larger preview. Picture edits preserve checked state, recipe links, notes and the item itself. The same validation and resizing apply; preparing/saving states are announced and failed saves can be retried without selecting the file again. Failed saves preserve the old picture.

Later edits are saved in owner-scoped grocery_item_photos, keyed by the same lowercased ingredient line as checked state and notes. These override legacy grocery_extras.image values; a null override hides a removed legacy picture. Adding the same extra again with a new picture clears its override. At most 500 overrides per owner are stored; concurrent updates are serialized per owner. Picture references follow the ingredient key across weeks, like item notes; deleting an extra removes it from the list but does not clear an existing picture override for that key.

Apply migrations/0010_grocery_item_photos.sql before deploying this update. The database snapshot excludes this table's private data.

Pictures are private references, excluded from existing text exports and shared-list snapshots. Image recognition and global catalog pictures are outside this version.

Apply migrations/0009_grocery_products_photos.sql before deploying the code. It adds the image column, creates household_products and seeds the catalog. Schema push alone does not seed product data. shared/household-products.json is the reviewed seed source; keep it and the migration aligned. The catalog is global reference data; uploaded photos never modify it.

Verify with npm run validate, npm run test:grocery-extras (TABLEWISE_TEST_DATABASE_URL must name a disposable database ending in _test), and npm run test:grocery-products-browser against a running development app.

## Validation in the implementation environment

Passed: all five TypeScript checks, production build, PostgreSQL 16 migration/schema comparison and grocery-extra tests, live API photo round trip and owner isolation, grocery progress and share tests, and remaining validation suites. Used `node --import tsx` to run TypeScript scripts because this environment blocks the tsx CLI's Unix socket.

`test:curated-development` fails with 32 versus 112 records on both unchanged main and this branch. Browser execution is blocked before page load because Chromium also requires a Unix socket; the added browser regression test must be run in a normal local environment before merging.

The local seed snapshot was refreshed with PostgreSQL 16 pg_dump directly because Docker is unavailable here. It excludes private cooking sessions, photos and grocery extras, as does the updated dump script.

## Later picture editing validation

Passed: all five TypeScript checks; production build; new real-Postgres HTTP/store tests (`test:grocery-item-photos`), including migration/schema parity, owner isolation, cross-origin rejection, malformed payloads, >64 KB uploads, concurrent capacity checks, replace/remove/reload, re-adding legacy pictures and recipe ingredient keys; existing grocery-extra database, grocery progress/share, integration utility, optional AI, ingredient grouping, recipe nutrition/price/layout and step analysis suites.

The npm validation/build entry points hit the environment's blocked Unix sockets in the tsx CLI. Their TypeScript suites were instead run with `node --import tsx`, and the production build with `node --import tsx script/build.ts`. The unchanged curated-development suite still fails on 32 versus 112 catalog rows. Chromium fails before page load because Unix sockets are unavailable, so the expanded grocery-products browser regression test (later add/change/remove, checked state, preview, invalid file, failed-save retry, recipe ingredients and RU/HE layout) is syntax-checked but must be run in a normal browser environment before merging.

The seed snapshot was refreshed using PostgreSQL 16 pg_dump against an isolated copy of the existing catalog with migration 0010 applied; all private table data is excluded. Docker is unavailable here.
