# Built-in recipe catalog v1 — import and restore

200 original TableWise recipes (Dinner 70, Lunch 40, Breakfast 35, Dessert 25, Snack 20, Soup 10),
stored as ordinary rows in the existing `recipes` table under IDs `tablewise:catalog:v1:<slug>`.
No schema change, no new UI, no startup seeding. The app reads them like any other recipe.

## Artifacts (`data/catalog/`)

| File | Purpose |
| --- | --- |
| `tablewise-recipes-v1.json` | **Source of truth.** 200 recipes in deterministic order; stored fields plus `category`, `cuisine`, `ingredientsStructured` (reference only, not stored). |
| `tablewise-recipes-v1.sql` | Portable, additive, conflict-checked import (recommended for existing databases). |
| `tablewise-recipes-v1.dump` | `pg_dump -Fc --data-only --table=public.recipes` of a database holding only the catalog. For databases with no catalog rows yet. |
| `tablewise-recipes-v1-sources.json` | Source, licence and attribution per recipe. |
| `tablewise-recipes-v1-validation.json` | Counts, duplicate/similarity checks, coverage, restore/API/browser verification. |
| `tablewise-recipes-v1.sha256` | Checksums. Verify with `cd data/catalog && shasum -a 256 -c tablewise-recipes-v1.sha256`. |
| `source/*.json`, `AUTHORING-SPEC.md` | Authored structured sources and the rules they follow. |

All three data artifacts hold identical recipe content (verified: restored dump == JSON, and the SQL
import against the restored dump reports `inserted 0, already present 200`). The dump is not
byte-reproducible (it embeds its creation time); its *content* is.

**Generated with:** PostgreSQL server 16.15 and `pg_dump` 16.15 (`postgres:16` image).
Requirements on the target: PostgreSQL 13+ for the SQL file; `pg_restore` 16+ for the dump; the TableWise
`recipes` table including `prep_time` (migration `0002_recipe_preparation_time.sql`). Only the columns
`id, title, ingredients, steps, image, source_url, prep_time, cook_time, servings, tags` are written;
`created_at`/`updated_at` take the target's defaults (SQL) or the generation time (dump).

## What the SQL import guarantees

One transaction, `SHARE ROW EXCLUSIVE` lock on `recipes`, then:
- inserts catalog IDs that are missing (`ON CONFLICT (id) DO NOTHING`);
- if any catalog ID already exists with **different** content → error, nothing committed (it never overwrites);
- hashes every non-catalog row before and after → error if anything changed;
- contains no `UPDATE`, `DELETE`, `DROP`, `TRUNCATE` or `ALTER`;
- re-running is a no-op (`inserted 0, already present 200`), timestamps untouched.

**Dry run:** set `tablewise.dry_run = on` and the import does all checks, reports what it would insert,
then raises `DRY RUN OK ...` so the transaction rolls back. (The error exit is expected in a dry run.)

## DEV (local Docker compose database)

```sh
cd data/catalog && shasum -a 256 -c tablewise-recipes-v1.sha256 && cd ../..
# 1. Backup
docker compose exec -T db pg_dump -U tablewise -Fc tablewise > /tmp/tablewise-dev-before-catalog.dump
# 2. Dry run (expect: ERROR: DRY RUN OK: would insert 200 ...)
docker compose exec -T -e PGOPTIONS='-c tablewise.dry_run=on' db \
  psql -X -v ON_ERROR_STOP=1 -U tablewise -d tablewise < data/catalog/tablewise-recipes-v1.sql
# 3. Import (expect: NOTICE: Catalog v1: inserted 200, already present 0 ...)
docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U tablewise -d tablewise < data/catalog/tablewise-recipes-v1.sql
# 4. Verify
docker compose exec -T db psql -U tablewise -d tablewise -Atc \
  "SELECT count(*) FROM recipes WHERE id LIKE 'tablewise:catalog:v1:%'"   # 200
```

Note: the compose app sets `TABLEWISE_DEV_CURATED_CATALOG=true`, which shows the 20 curated development
recipes plus accepted AI recipes and the `tablewise:catalog:*` rows (`server/seeds/curated-development-catalog.ts`);
restart the app container after importing. Also, `db/init` snapshots only load into an
empty volume, so refresh the snapshot (`script/db-dump.sh`) if you want new volumes to include the catalog.

## Production (requires separate approval)

Do not run this without explicit approval and a verified backup. Use the SQL file, not the dump.

```sh
# Run from a trusted machine. PROD_DATABASE_URL is entered by the operator; never commit it.
cd data/catalog && shasum -a 256 -c tablewise-recipes-v1.sha256 && cd ../..
# 1. Backup, then prove the backup is readable
pg_dump "$PROD_DATABASE_URL" -Fc -f tablewise-prod-before-catalog-$(date +%Y%m%d%H%M).dump
pg_restore -l tablewise-prod-before-catalog-*.dump | grep -c 'TABLE DATA'   # > 0
# 2. Preconditions: schema has prep_time; no catalog rows yet (or only identical ones)
psql "$PROD_DATABASE_URL" -Atc "SELECT count(*) FROM pg_attribute WHERE attrelid='recipes'::regclass AND attname='prep_time'"   # 1
psql "$PROD_DATABASE_URL" -Atc "SELECT count(*) FROM recipes WHERE id LIKE 'tablewise:catalog:v1:%'"
# 3. Dry run — expect 'DRY RUN OK: would insert 200'; any 'Conflict:' message means stop and review
PGOPTIONS='-c tablewise.dry_run=on' psql "$PROD_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f data/catalog/tablewise-recipes-v1.sql
# 4. Import, in a quiet period
psql "$PROD_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f data/catalog/tablewise-recipes-v1.sql
# 5. Verify: 200 catalog rows, other_recipes unchanged from step 2; then open /recipes and one recipe per category
```

In a hosted SQL editor without `psql`: run `SET tablewise.dry_run = 'on';` in the same session first for a
dry run; open a new session (or `RESET tablewise.dry_run;`) for the real import.

### Dump restore (fresh environments only)

Only for a database with the schema and **no** catalog rows. It runs in one transaction and fails
entirely (duplicate key) if any catalog ID exists; it never overwrites.

```sh
pg_restore --data-only --single-transaction --exit-on-error --no-owner --no-privileges \
  -d "$TARGET_DATABASE_URL" data/catalog/tablewise-recipes-v1.dump
```

## Conflicts

`Conflict: N catalog ID(s) already hold different content` means a row with a catalog ID was edited
after an earlier import, or holds something else. Nothing was imported. Inspect with:

```sql
SELECT id, title, updated_at FROM recipes WHERE id LIKE 'tablewise:catalog:v1:%' ORDER BY updated_at DESC;
```

Decide manually; the importer will not resolve it. Fixes or new recipes ship as a new version
(`tablewise:catalog:v2:*`), never by mutating v1.

## Rollback

Preferred: restore the backup taken in step 1 (to a new database, then switch over), which also restores
anything else to its pre-import state. Targeted removal, only with approval and only if no one has
started relying on the recipes (meal plans in browsers reference recipe IDs; `recipe_nutrition` rows cascade;
`recipe_generations.recipe_id` is set null):

```sql
BEGIN;
SELECT count(*) FROM recipes WHERE id LIKE 'tablewise:catalog:v1:%';   -- expect 200
DELETE FROM recipes WHERE id LIKE 'tablewise:catalog:v1:%';
COMMIT;  -- or ROLLBACK if the count was not 200
```

## Regenerating / re-verifying

The catalog is generated once. To re-verify (no shared database is touched):

```sh
npm run catalog:build            # rebuild + validate from data/catalog/source (deterministic)
npm run test:recipe-catalog      # data quality, planner, filters, grocery, SQL safety
npm run test:recipe-catalog-db   # throwaway postgres:16 containers: seed, idempotency, conflicts,
                                 # dump, restore, compare, app API, headless Chrome (desktop + mobile)
```

On this Mac the dependencies live in the compose `tablewise_node_modules` volume, so the TypeScript
commands run as `docker run --rm -v "$PWD":/app -v tablewise_node_modules:/app/node_modules:ro -w /app node:20 npx tsx <script>`;
`script/recipe-catalog-db.sh` does this itself. Every database it uses is a container it just created
(verified by image, label, network, no published ports and an empty cluster before any write) and
removes on exit. It never reads `DATABASE_URL`.

## Sourcing and licensing

All 200 recipes are original TableWise content written for this catalog from general culinary
knowledge (common dish names, standard techniques, published food-safety temperatures). No third-party
recipe text, dataset, scraped page or photograph was used, so there are no attribution or share-alike
obligations. Openly licensed datasets were not used because the common ones are non-commercial,
share-alike (e.g. CC BY-SA wiki cookbooks) or of unclear provenance. The recipes were drafted with AI
assistance inside the development session; no paid external API was called. Images are `null`
(the app's existing placeholder is shown). No nutrition data is stored.

**Before production:** a human cook should review the recipes. The automated checks prove structure,
quantities, scaling, planner and grocery compatibility, dietary tag consistency with every ingredient line,
and doneness temperatures for meat and fish. They do not prove the taste or that every timing is right.
Dietary tags describe the ingredients as written. They are not allergen guarantees for purchased products.
