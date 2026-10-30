# Development fixture verification — 2026-10-30

## Outcome: main-development import completed

The approved additive import was explicitly applied in main on 2026-10-30:
**12 existing recipes → 112 total**, with all 100 supplied synthetic fixtures
added and every pre-existing record preserved. The repeat apply inserted zero.
The real main-preview API/browser checks passed with the expanded catalog.
See **Main-agent operation — completed** below for the fresh evidence and outputs.

**Subsequent owner-requested display change:** the current development preview
shows only 20 complete recipes; the other 92 are hidden, not deleted. All 112
stored records still exactly match the post-import snapshot. See
`docs/curated-development-catalog.md` for the current selection, explicitly
labelled development estimates, and exhaustive twenty-detail-page verification.
The 112-card browser results below describe the successfully verified full view
before that later display change.

No production access, publication, schema push, destructive reset or inferred
fixture metadata was part of this operation.

## Historical pre-integration task-workspace record

The owner explicitly approved rebuilding the unavailable archived implementation.
No recovery or merge of the archived code is claimed. The new checked-in
manifest, guarded importer, tests, provenance notice and expanded-preview
validation are prepared in this task's isolated code workspace.

At the time of the historical task-workspace checks below, **the main-development
import had not been performed.** It had to occur after
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

In that historical pre-integration run, `npm run check` failed with 12 diagnostics: the
meal-filter module needs a modern TypeScript target; existing batch helpers use
an incompatible `pRetry.AbortError` API; chat storage imports absent schema
exports; image helpers dereference possibly undefined response data.
The scoped checks above passed. These baseline issues have since been repaired
in the main follow-through described below, without changing planner behavior
or adding database schema.

## Main-agent operation — completed on 2026-10-30

### Fresh isolation, integration and origin evidence

- The current workspace was on branch `main`, with the merged development-import
  implementation present, including its guarded CLI and expanded startup validation.
- A fresh platform `viewEnvVars` query limited to secret existence in
  **development** reported `DATABASE_URL` present and **runtime-managed**.
  No connection string or secret value was accessed or displayed.
- An independent platform SQL query explicitly routed to **development**
  returned system identifier `7593985004690038805`, database `heliumdb`, and
  12 recipes. No production identity or production query was used.
- A new read-only CLI dry-run through the actual `server/db.ts` connection
  returned precisely the same system identifier and database. The preview
  imports that same connection without a connection override.
- The configured main managed workflow was `TableWise researched preview`,
  running `npm run dev:researched` on port 5000, not the disposable port-5001
  rehearsal. Its platform-provided main development origin was:
  `https://7a187424-42c1-4c10-8541-b778e38b2dbf-00-60391wl94hbw.spock.replit.dev`.
- Replit's official documentation confirms separation of managed development
  and production databases:
  <https://docs.replit.com/features/data-and-storage/development-and-production>.

The fresh identity was checked against the independent development result
before supplying apply flags. The proposed IDs exactly matched the 100 pinned
manifest entries; the 12 baseline IDs were the existing researched catalog.
The earlier task-workspace snapshot was not reused as evidence.

### Actual main-development operation

| Measurement | Verified result |
|---|---|
| Fresh dry-run | 12 → 12; would insert 100; matched 0; no conflicts |
| Explicit guarded apply | 12 → 112; inserted 100; preserved 12 |
| Full original-row comparison | All stored fields, tags, extra columns and full-precision timestamps exactly unchanged |
| After-import dry-run | 112 → 112; matched 100; would insert 0 |
| Repeat explicit apply | 112 → 112; inserted 0; matched 100; preserved all 112 |
| Repeat snapshot comparison | Before and after hashes exactly equal |

Full-catalog snapshot hashes:

- Before: `ad7125f294ac0d25a9a1ec4aed762503ecbc361ffaa00653dd0cda6625e9239e`
- After: `a28832bff835bc331548eda8479403f7f5a24bf79c00f97de1300e6ba2a13cb2`

Secure before/after baselines and logs remain in ignored `generated-artifacts/`:

- `main-development-before-20261030-approved.json`
- `main-development-after-20261030-approved.json`
- `main-development-dry-run-before.log`
- `main-development-apply.log`
- `main-development-dry-run-after.log`
- `main-development-repeat-apply.log`
- `main-development-browser.log`

No original recipe was edited to force the total. No startup/build/merge import
or schema hook was added. The supplied manifest and fixture contents were not
modified.

### Main-preview API and browser verification

Restarted the existing managed workflow once. Startup validated **112 total:
12 researched, 100 synthetic, 0 other records**, and reported no import or
migration at startup.

With a fresh disposable Chromium profile:

```sh
npm run test:development-fixtures-browser -- \
  "https://$REPLIT_DEV_DOMAIN" --disposable-browser
```

Passed against the independently established main origin, using real recipe
APIs without mocks:

- all 100 batch records exactly match the pinned manifest through the API;
- all 112 catalog entries render when filters are cleared;
- an original plus first/middle/last imported detail pages and source links work;
- synthetic provenance warnings and honest unknown timing fields appear;
- exactly three selections, scheduling and confirmation work;
- detail/return navigation preserves selected meals and assigned dates;
- ingredient, dinner and time filters work, and clearing restores 112;
- no uncaught browser runtime exceptions.

This is exhaustive API enumeration plus **representative** detail-page browser
coverage, not a claim that all 100 detail pages were individually clicked.
A fresh main `/plan` screenshot also showed 112 matching recipes. Expected
analytics POSTs were rejected with 503 because analytics remains disabled.
No recipe mutations or pilot-event writes were performed by browser tests.

The disposable browser was stopped after verification; the managed development
preview remains running.

### Full-project code checks restored

The separate approved code-check repair sets the modern TypeScript target,
uses the installed retry library's named `AbortError` and retry-error context,
imports the already-existing optional chat model directly, and rejects missing
image payloads instead of dereferencing them or returning empty buffers.
Optional AI routes remain unregistered; no unrelated tables or schema exports
were added. An obsolete incremental compiler cache was cleared after verifying
that a clean non-incremental check passed.

Passed in main:

- `npm run check`
- `npm run check:mvp`
- `npm run check:development-fixtures`
- `npm run check:pilot`
- `npm run check:analytics`
- `npm run test:integration-utils` (offline, no database or external API access)
- `npm run test:meal-filters`
- `npm run test:planner-return`
- `npm run test:mvp`
- `npm run test:meals-timing`
- `npm run build` (existing non-blocking bundle-size warning)
- `git diff --check`
