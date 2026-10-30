# Development-only synthetic recipe import

## Status and authorization

The owner supplied 100 illustrative recipes, approved an additive development
import, and subsequently explicitly approved **rebuilding** the unavailable
archived importer with the existing safeguards. This implementation is rebuilt,
not recovered or merged from the archived work.

**Do not equate completed tooling or a disposable rehearsal with the main import.**
This task runs in an isolated code workspace. The guarded apply must be explicitly
run in the main working project **after these changes are integrated**, using
fresh proof of its target. No import runs on startup, build, merge or deployment.

This runbook does not authorize production access, publication, schema changes,
resetting data, editing existing recipes or saved plans, or public pilot testing.
No production SQL is needed or permitted.

## Stable batch manifest

The source is
`attached_assets/tablewise_100_recipes_manual_import_1793384956849.md`.
The subsequently uploaded copy is byte-identical. The reviewed SHA-256 is:

```text
d1d34ee39ac224835b0d62c169d883949d43ccf8d65240bfb07de3f48c032e9b
```

`server/seeds/development-fixtures.json` is the complete checked-in manifest,
including the disclaimer, reference metadata and full recipe contents.
`server/seeds/development-fixtures.ts` pins its content hash and the attachment
hash, validates all 100 consecutively numbered sections against input bounds,
retains the chef **reference** and source-type metadata separately, and derives
stable IDs `tablewise:synthetic:v1:001` through `:100`. It rejects any parsing or
validation that would trim or otherwise change the supplied text. Startup and
import use the pinned manifest, not ignored uploaded files; the isolated test
compares it exhaustively against the original attachment.

Generate its full reviewable JSON without opening a database:

```sh
mkdir -p generated-artifacts
npm run --silent recipes:development-fixtures -- --manifest \
  > generated-artifacts/development-fixtures-manifest.json
```

Review all titles, links, ordered ingredients and ordered steps against the
attachment. Shared source URLs are intentional: 95 links are collection pages;
the other five are supplied recipe-specific links that have **not** been
revalidated. Neither kind verifies the synthetic recipe.

Every record has null preparation time, cooking time, servings and image.
No meal-type, lunchbox or dietary classification is inferred. Tags identify
synthetic test data and unverified link type only. Chef reference labels are
not authorship or endorsement. Detail pages show an explicit provenance warning.
Restrictive meal/time filters correctly exclude unknown metadata; clear filters
to see the entire batch. These recipes do not replace the source-checked catalog.

## Prove the approved main target before writing

Do this **in main after integration**, not by assuming a task-fork result is main.

1. Establish fresh, non-secret platform provisioning/configuration evidence that
   the actual preview uses managed **development**, distinct from production.
   A database name, count, `NODE_ENV`, startup message, URL hostname or this
   documentation does not prove isolation.
2. Use the platform's explicitly **development-routed** read-only query to obtain
   the system identity, without displaying connection strings:

   ```sql
   SELECT system_identifier::text AS system_identifier,
     current_database() AS database
   FROM pg_control_system();
   ```

   Do not run this against production. Verify the platform reports the app's
   `DATABASE_URL` as runtime-managed, not a user-configured connection to an
   external target. Pair this current evidence with Replit's documented
   development/production separation. If the actual configuration is external,
   ambiguous or not independently attested, **stop** and request provisioning
   evidence; do not substitute a manually supplied environment label.
3. Confirm the running main preview uses the same configured `server/db.ts`
   connection (no wrapper override), and compare its active identity as reported
   by the read-only dry-run below with the independent development identity.
   Establish that the origin is main rather than a task or disposable preview.
4. Record redacted evidence and its date, target match, origin, and integration
   status. Never record credentials or query production to compare identities.

If any step cannot be proven, stop **before apply**. Do not switch the app
connection, create a replacement managed database or copy production data.

## Reviewed read-only dry-run and full preservation baseline

```sh
mkdir -p generated-artifacts
npm run recipes:development-fixtures -- --dry-run \
  --baseline-file generated-artifacts/main-before.json
```

The file must not already exist. The dry-run transaction is read-only and
consistent. It captures every existing recipe's ID, all stored columns, tags,
and full timestamp precision using database-side JSON, not JavaScript date
round-tripping. The report contains:

- actual target system ID and database (not credentials);
- actual before/after counts (dry-run changes nothing);
- exact proposed new IDs, matching existing batch count, and conflicts;
- a SHA-256 snapshot fingerprint bound to the entire catalog.

Independently verify the identity; do not copy it from the dry-run and call that
proof. Review the snapshot and all proposed records. Keep the baseline secure
and do not commit it: `generated-artifacts/` is ignored by Git and deployment.
For the expected baseline, dry-run is **12→12**, would insert 100. If the baseline
differs, preserve it and report the actual total; never delete rows to force 112.

## Explicit one-time main-development apply

Only after integration, independent identity proof, and dry-run review:

```sh
npm run recipes:development-fixtures -- --apply \
  --verified-development-system-id INDEPENDENTLY_VERIFIED_ID \
  --verified-development-database INDEPENDENTLY_VERIFIED_DATABASE \
  --snapshot REVIEWED_DRY_RUN_SNAPSHOT
```

Replace the placeholders with current non-secret evidence, not stale example
values. `NODE_ENV=production` is rejected, but is **not** the isolation proof.
Apply requires the independent identity and reviewed fingerprint. It obtains a
bounded table lock, rechecks the full baseline, rejects changed batch content
or unknown batch IDs, parameterizes all recipe values, and uses one transaction.
It never updates, deletes or creates schema. Missing schema aborts; do not run a
schema push to bypass it.

Before commit it checks every pre-existing row, including tags, extra columns
and microsecond timestamps, is unchanged and all batch content matches. Any
conflict, stale baseline or preservation failure rolls the whole transaction back.

Expected first apply is **12→112**, inserted 100, preserved 12. Report actual
results and retain the before baseline and apply output. Do not report a task
or local rehearsal as this operation.

## Preservation, no-op, API and browser verification

1. Take another read-only snapshot to a **new** file:

   ```sh
   npm run recipes:development-fixtures -- --dry-run \
     --baseline-file generated-artifacts/main-after.json
   ```

   Compare every row from `main-before.json` by ID with the same row in
   `main-after.json`. All columns and timestamps must match exactly. The new
   dry-run must find all 100 matching batch entries with `wouldInsert: 0`.
2. Repeat the guarded apply with the **new** reviewed snapshot and same
   independently verified identity. It must report inserted 0, matched 100,
   equal before/after snapshot hashes, unchanged count and timestamps.
3. Restart the existing **TableWise researched preview** managed workflow once.
   Startup validates all twelve original researched records, validates a
   recognized full synthetic batch independently, permits unrelated legitimate
   records, and retains AI/operator/analytics restrictions. It performs no
   import or migration and makes no unproven isolation claim.
4. With a fresh disposable Chromium profile and CDP on port 9222, run:

   ```sh
   npm run test:development-fixtures-browser -- \
     "https://$REPLIT_DEV_DOMAIN" --disposable-browser
   ```

   Use the real, independently established main development origin. The test
   clears storage only in that disposable profile. It checks all 100 entries
   through the real API, the complete rendered catalog with cleared filters,
   original and first/middle/last imported details and source links, provenance,
   unknown timings, exactly three recipes, scheduling/confirmation, detail-return
   preservation, ingredient/meal/time filtering and restored full counts. It
   uses **no recipe API mocks** and performs no recipe mutations. The frontend
   may attempt analytics POSTs; the preview explicitly rejects those with 503,
   so no pilot events are stored.
   Its screenshot is saved in ignored `generated-artifacts/`.

Distinguish API enumeration of all 100 from representative browser detail
coverage. A screenshot of the twelve-row preview is not expanded-catalog coverage.
Log the main before/after count, preservation comparison, repeat no-op, origin
and browser outcome separately from the rehearsal evidence.

## Isolated verification and rehearsal only

```sh
npm run check:development-fixtures
npm run check:mvp
npm run test:development-fixtures -- \
  --test-socket /tmp/tablewise-phase2-devfixtures/socket
```

Use the existing `script/prepare-catalog-test.sh` with a **new** approved path.
Start its PostgreSQL cluster persistently with TCP disabled; create only the
dedicated `tablewise_phase2` database. The test verifies the socket, actual data
directory, database and disabled TCP before making any disposable schema changes.
There is no application `DATABASE_URL` fallback.

Coverage includes exact 100-entry parsing and reference metadata, shared links,
malformed input, honest unknowns, missing schema, identity/snapshot guards,
read-only dry-run, 12→112 and 13→113 preservation (including extra columns and
microsecond timestamps), no-op repeats, conflict rejection, and a database
trigger-induced preservation failure that rolls back all inserts.

For a real-API expanded-catalog browser rehearsal, use only the same verified
fresh socket-only database:

```sh
npx tsx script/prepare-development-fixture-rehearsal.ts \
  --test-socket /tmp/tablewise-phase2-devfixtures/socket
npx tsx script/serve-development-fixture-rehearsal.ts \
  --test-socket /tmp/tablewise-phase2-devfixtures/socket
```

Preparation explicitly refuses an existing catalog. The separate serving
wrapper performs no import and uses port 5001, never replacing the main preview.
Run the browser test against that rehearsal server and label its result
**disposable rehearsal**, not main evidence.

## Main-agent handoff when this task cannot operate after integration

Leave the main apply **pending**, not successful. The main Build agent must
perform the independently verified, reviewed, explicit apply and the preservation,
repeat/no-op and real-origin browser checks above after integration. Do not
schedule an automatic import hook as a substitute. The owner has already
authorized this additive development-only operation conditional on isolation;
no production or publication operation is authorized.
