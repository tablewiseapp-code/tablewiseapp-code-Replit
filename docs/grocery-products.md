# Household product suggestions and reference pictures

The current grocery list’s Add item form searches a shared Postgres catalog of 101 common food and household products. Names are available in English, Russian and Hebrew; aliases include “tooth brush”, “yoghurt” and “trash bags”. Matching searches all three languages and aliases, prioritizes name prefixes, and shows up to 12 suggestions. Arrow keys navigate, Enter selects, Escape dismisses. Custom text always works, including when the catalog cannot load. No AI is required.

An item needs a name and may have one reference picture. JPEG, PNG and WebP up to 10 MB are decoded and re-encoded in the browser as a JPEG, at most 640 pixels on its longest side and 210 KB. Originals and metadata are discarded. A preview can be removed before saving. Saved photos live in owner-scoped grocery_extras and survive reloads; deleting an extra deletes its picture. Re-adding the same name with a new photo replaces that photo, while re-adding without one preserves it. Saving is disabled during processing and in-flight requests.

Pictures are private references, excluded from existing text exports and shared-list snapshots. Image recognition, global catalog pictures, and editing recipe-derived items are outside this version.

Apply migrations/0009_grocery_products_photos.sql before deploying the code. It adds the image column, creates household_products and seeds the catalog. Schema push alone does not seed product data. shared/household-products.json is the reviewed seed source; keep it and the migration aligned. The catalog is global reference data; uploaded photos never modify it.

Verify with npm run validate, npm run test:grocery-extras (TABLEWISE_TEST_DATABASE_URL must name a disposable database ending in _test), and npm run test:grocery-products-browser against a running development app.

## Validation in the implementation environment

Passed: all five TypeScript checks, production build, PostgreSQL 16 migration/schema comparison and grocery-extra tests, live API photo round trip and owner isolation, grocery progress and share tests, and remaining validation suites. Used `node --import tsx` to run TypeScript scripts because this environment blocks the tsx CLI's Unix socket.

`test:curated-development` fails with 32 versus 112 records on both unchanged main and this branch. Browser execution is blocked before page load because Chromium also requires a Unix socket; the added browser regression test must be run in a normal local environment before merging.

The local seed snapshot was refreshed with PostgreSQL 16 pg_dump directly because Docker is unavailable here. It excludes private cooking sessions, photos and grocery extras, as does the updated dump script.
