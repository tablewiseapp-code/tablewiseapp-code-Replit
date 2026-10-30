# Development fixture verification — 2026-10-30

## Outcome: tooling rebuilt; main operation still pending

The owner explicitly approved rebuilding the unavailable archived implementation.
No recovery or merge of the archived code is claimed. The new checked-in
manifest, guarded importer, tests, provenance notice and expanded-preview
validation are prepared in this task's isolated code workspace.

**The main-development import has not been performed.** It must occur after
integration into main, using `docs/development-test-recipes.md`. There is no
automatic import or schema action in startup, merge, build or deployment.

## Current non-secret target evidence

- The platform reports `DATABASE_URL` as **runtime-managed** and present in the
  development environment; no connection string or credential was displayed.
- The platform query explicitly routed with `environment: development` returned
  system identifier `7593985004690038805`, database `heliumdb`, 12 recipes.
- A read-only dry-run using the task's actual `server/db.ts` connection returned
  the same identifier/database. This ties the **task's active connection** to
  that development-routed service, not merely to a name or row count.
- Replit's documentation states managed development and production databases
  are isolated, and task code runs in an isolated project copy until applied
  to main. No production configuration values or SQL were accessed.
- These results **do not establish main code integration or the independently
  verified main-preview target**. Main must refresh the evidence, establish its
  actual origin/connection, and review a fresh full snapshot before apply.

## Actual application-database operation

Only read-only dry-runs ran against the active application connection:

| Measurement | Result |
| --- | --- |
| First dry-run | 12 → 12, would insert 100, matched 0 |
| Final dry-run | 12 → 12, would insert 100, matched 0 |
| Entire before/after baseline | Exactly equal, including all IDs, columns, tags and timestamps |
| Snapshot | `ad7125f294ac0d25a9a1ec4aed762503ecbc361ffaa00653dd0cda6625e9239e` |
| Guarded main apply | **Not run** |
| Main repeat-apply/no-op | **Not run** |
| Main 112-recipe browser checks | **Not run** |

Full baselines and dry-run output are in ignored `generated-artifacts/` in the
task workspace; they are not part of the merge and must not be reused as main's
reviewed snapshot.

The existing managed preview restarted successfully on port 5000. Its real
development-origin API returned 12 researched recipes and zero synthetic ones.
The captured `/plan` rendered correctly with 12 matching recipes. That is
twelve-row preview evidence only, not expanded-main-catalog verification.
Disabled analytics requests return 503 as expected; planning remains functional.

## Verified disposable facilities only

Created a fresh socket-only PostgreSQL cluster under
`/tmp/tablewise-phase2-devfixtures`, using the existing preparation script.
Tests independently verified the actual data directory, socket directory,
`tablewise_phase2` database and empty `listen_addresses` before writes.
No application connection fallback was used.

`npm run test:development-fixtures -- --test-socket ...` passed:

- all 100 sequential IDs, supplied titles/URLs, ordered ingredients and steps,
  attachment SHA and full checked-in-manifest equality;
- all chef reference/source-type metadata, 95 collection links, shared URLs,
  synthetic labels and null unknown metadata;
- malformed input, missing schema, required identity and snapshot guards;
- genuinely read-only dry-run and complete full-precision snapshots;
- 12 → 112, preserving all twelve originals;
- 13 → 113, preserving an additional unrelated record and extra columns;
- repeat apply inserted zero, with every row and microsecond timestamp unchanged;
- conflicting last batch entry rejected without partial inserts;
- a database trigger changed a pre-existing timestamp during insertion:
  preservation detection rolled back all inserts and the timestamp change;
- actual public CLI dry-run and no-op apply; rejection of missing apply flags,
  conflicting modes, production mode, baseline overwrite and out-of-directory
  baseline output;
- expanded startup validation accepts original-only and expanded catalogs,
  preserves unrelated rows and rejects partial/changed batches.

These are **rehearsals**, not main-application writes.

## Expanded real-API browser rehearsal

Explicitly prepared the same fresh disposable database with 12 researched and
100 synthetic recipes, then served it separately on port 5001. The server's
startup wrapper performs no import. Used a disposable Chromium profile with
real APIs and no recipe mocks.

`npm run test:development-fixtures-browser -- http://127.0.0.1:5001 --disposable-browser`
passed:

- all 100 entries exactly matched through API enumeration;
- 112 recipes rendered with filters cleared;
- original and first/middle/last imported details and source links;
- explicit synthetic provenance and unknown timing fields;
- original plus two imported recipes selected, assigned separate dates and
  confirmed; a fourth choice disabled;
- detail navigation from available and selected cards preserved the full plan;
- ingredient inclusion, time caps and dinner filters behaved correctly;
- clearing filters restored all 112 without changing the saved plan;
- no uncaught browser runtime exceptions.

The browser attempted frontend analytics delivery, but the wrapper disables
analytics, so those POSTs were rejected with 503 and did not store events.
No recipe mutations were sent. A detail screenshot is saved in ignored
`generated-artifacts/development-fixture-detail.png`.

The rehearsal server, disposable Chromium and local database were stopped after
verification. The existing managed twelve-recipe preview remains running.

## Other checks

Passed:

- `npm run check:development-fixtures`
- `npm run check:mvp`
- `npm run test:meal-filters`
- `npm run test:planner-return`
- `npm run test:researched-import -- --test-socket ...`
- `npm run build`
- `git diff --check`

`npm run check` still fails with 12 diagnostics in unchanged files: the
meal-filter module needs a modern TypeScript target; existing batch helpers use
an incompatible `pRetry.AbortError` API; chat storage imports absent schema
exports; image helpers dereference possibly undefined response data.
The scoped checks above pass. No unrelated repair was substituted.

## Remaining main-agent operation

After applying these code changes to main: independently prove the current
main development target, review a fresh dry-run/full baseline, invoke the
guarded apply explicitly, compare every pre-existing row, repeat apply as a
timestamp-preserving no-op, restart the existing workflow and run the browser
test against the actual main development origin.

Expected result with the current documented baseline is 12 → 112. Report the
actual result and preserve unrelated rows if main has changed. Until those
steps are recorded, the user's requested main import remains **incomplete**.

No production operations, publication, schema pushes, destructive resets,
source research or inferred recipe metadata occurred.
