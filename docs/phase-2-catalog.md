# Phase 2 — Dinner recipe catalog

## 1. What changed

Implemented Phase 2 only. Twelve familiar dinners are defined as typed recipe
inserts: tomato pasta, oven-baked chicken, vegetable fried rice, baked salmon,
chicken stir-fry, vegetable omelet, beef tacos, lentil soup, chicken and rice,
roasted vegetables with potatoes, homemade pizza, and pasta with mushrooms.
Each has quantified ingredients, usable steps, a total cooking-time estimate,
numeric serving text (`"4"`), and the existing planner-compatible `Dinner` tag.
Meat/fish/egg instructions include doneness guidance.

The explicit seed command persists through the existing PostgreSQL recipe model.
The ordinary recipe API and existing recipe cards display that data, not browser
fixtures. The existing list now distinguishes loading, failure, successful empty,
and populated results. Failures have an accessible localized alert and retry;
empty results retain the existing import action. No navigation, planner, grocery,
AI, authentication, ownership, or analytics behavior was changed.

## 2. Created and modified files

Created:
- `server/seeds/dinner-catalog.ts` — typed catalog with fixed namespaced IDs.
- `server/seeds/seed-dinners.ts` — transactional, insert-only seeding.
- `script/seed-recipes.ts` — explicit command and resource cleanup.
- `script/local-test-database.ts` — local socket configuration and server checks.
- `script/prepare-catalog-test.sh` — opt-in creation of a new local cluster.
- `script/local-test-app.ts` — run the unchanged app against the isolated target.
- `script/test-dinner-catalog.ts` — data-quality and PostgreSQL safety checks.
- `script/test-catalog-browser.ts` — normal API retrieval and browser state tests.
- `tsconfig.catalog.json` — focused check including scripts omitted by the main config.
- `docs/phase-2-catalog.md` — this report and runbook.
- `.agents/memory/phase-approval-gates.md` and memory index — approval boundaries.

Modified:
- `package.json` — seed, isolated preview, and focused test commands.
- `client/src/pages/recipe-list.tsx` — error/retry state and stale-request guards.
- `client/src/lib/i18n.tsx` — English, Russian, and Hebrew error/retry labels.

No application schema, existing API contract, storage implementation, dependency,
lockfile, or startup seed hook was changed. The temporary verification workflow
is not part of the application’s normal startup configuration.

## 3. Decisions and database safety evidence

The initial inspection did **not** establish isolation of the existing managed
`DATABASE_URL`. Work stopped before changes, database queries, seeds, or test
writes. The user then explicitly authorized a dedicated isolated test database.

A new `initdb` cluster was created at `/tmp/tablewise-phase2/data`, with a private
socket directory at `/tmp/tablewise-phase2/socket` (parent/directory mode 0700).
PostgreSQL was launched with `listen_addresses=''`, so TCP is disabled.
Read-only server settings confirmed:

| Setting | Confirmed value |
| --- | --- |
| Database | `tablewise_phase2` |
| Local role | `runner` |
| Data directory | `/tmp/tablewise-phase2/data` |
| Unix socket directory | `/tmp/tablewise-phase2/socket` |
| TCP listen addresses | empty / disabled |

This was reported before recipe schema setup, seed writes, or writing tests.
Isolation rests on freshly provisioned local storage, private socket access,
disabled TCP, and queried server settings—not a database name or `NODE_ENV`.
The existing application database connection was not queried, seeded, or modified.
No production data, deployment, or external customer testing was involved.

The CLI intentionally supports **only this kind of approved local test cluster**.
It requires `--test-socket`, rejects other paths and socket symlinks, verifies
server data/socket/TCP settings, and never falls back to `DATABASE_URL`.
The preview launcher supplies a synthetic credential-free local connection to
the existing app in a child process; it does not replace workspace secrets.
Supporting any hosted or production seed target requires separate approval and
environment verification.

Each recipe has a permanent `tablewise:dinner:v1:*` primary key. A transaction
takes a catalog advisory lock, inserts with primary-key `ON CONFLICT DO NOTHING`,
and locks/compares the resulting rows. Only exact catalog content counts as
already seeded. Any differing occupied ID—including a modified seed—fails and
rolls back all inserts from that run. Titles never determine identity. Existing
rows and timestamps are never updated by the seed. Pool resources close on
success and failure.

### Local runbook

The local test data is temporary and is not transported by a code merge.
These commands require PostgreSQL tools already available in this environment.
After explicit approval for a **new** isolated local cluster:

```sh
# Pick a NEW directory, including a different suffix for each full test run.
bash script/prepare-catalog-test.sh /tmp/tablewise-phase2-demo

# Keep this running in a separate persistent terminal.
postgres -D /tmp/tablewise-phase2-demo/data \
  -c listen_addresses='' -k /tmp/tablewise-phase2-demo/socket

# In another terminal:
createdb -h /tmp/tablewise-phase2-demo/socket -U "$(id -un)" tablewise_phase2
npm run test:catalog -- --test-socket /tmp/tablewise-phase2-demo/socket

# The test prepares only the recipes table and leaves 12 seeded dinners.
# This command now reports inserted=0, skipped=12:
npm run seed:recipes -- --test-socket /tmp/tablewise-phase2-demo/socket

# Preview the existing app against the same isolated DB:
npm run dev:test-catalog -- --test-socket /tmp/tablewise-phase2-demo/socket
```

For seed-only use, prepare the existing recipe schema in the approved isolated
database first. The seed command does not create tables. The full test requires
the seed namespace to be absent; it refuses an already-seeded target rather than
deleting existing data. No DROP/TRUNCATE/destructive migrations are used.
Test cleanup deletes only fixtures/seed rows created during that test; it never
removes baseline rows. Normal application startup never seeds.

Browser verification uses the existing `ws` dependency and installed Chromium,
not a new test framework:

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/tablewise-phase2-demo/chromium about:blank
# With the isolated preview serving:
npm run test:catalog-browser -- "https://$REPLIT_DEV_DOMAIN"
```

Run this only against the isolated test preview. The browser test expects exactly
the 12 catalog rows. It injects network/API failures and empty responses in its
own tab, without modifying server behavior or database contents.

## 4. Checks run and results

All writing checks targeted only the confirmed local cluster.

| Check | Result |
| --- | --- |
| Twelve unique namespaced identities; current insert schema validation; positive integer times; numeric serving text; quantified ingredients; steps and Dinner tags | PASS |
| First explicit CLI seed | PASS: inserted=12, skipped=0 |
| Repeat CLI seed | PASS: inserted=0, skipped=12; full rows/timestamps unchanged |
| Two independent concurrent CLI processes against a fresh namespace | PASS: one inserted 12, one skipped 12; exactly 12 catalog rows |
| Twelve customer fixtures with matching catalog titles but independent IDs | PASS: all fields/timestamps preserved |
| Occupied final catalog ID with different customer content | PASS: failure and whole-transaction rollback, including other attempted inserts |
| Edited existing catalog content | PASS: CLI fails nonzero and does not repair/overwrite it |
| Seed command without explicit local target | PASS: fails closed before connecting |
| Baseline preservation after fixture cleanup | PASS: full before/after row equality and matching SHA256 |
| Ordinary `/api/recipes` and all twelve `/api/recipes/:id` GETs | PASS: list/detail return full PostgreSQL catalog contents |
| Browser API 500 vs empty state; accessible alert | PASS: error does not show empty/import action |
| Retry pending state and recovery to twelve real cards | PASS: error clears; retry disabled while loading; data loads |
| Network exception, retry to successful empty and existing import link | PASS |
| English/Russian/Hebrew translations, mobile Hebrew RTL and horizontal overflow | PASS |
| Browser uncaught errors during interaction checks | PASS: none |
| Visual screenshot of `/recipes` at 1280×900 | PASS: all twelve existing-style cards visible |
| `npx tsc -p tsconfig.catalog.json` | PASS |
| `npm run check -- --incremental false` | FAIL: exactly seven documented pre-existing integration errors; no new app-source errors |
| `npm run build` | PASS: frontend and server bundles built |

Before/after evidence retained from the full PostgreSQL test:

- Initial and final baseline: 0 rows, SHA256
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
- Baseline plus all twelve same-title customer fixtures, preserved across seeds:
  `b56702b706c9411d00b7003cc517839e1127dc9da41b2da5e0c6cb08093cbd9a`.
- Collision snapshot before and after rejected transaction:
  `e88f28cf4de9562cdb40b42ca6239acac2d2d6540451b23227901b7e803e4809`.

The tests compare actual full rows; hashes are concise evidence, not a substitute
for equality assertions. “Customer” rows here are synthetic fixtures in the
approved isolated database, never live customer records.

## 5. Known issues and checks intentionally not executed

The full app type-check remains blocked by the seven unchanged baseline errors:
- `server/replit_integrations/batch/utils.ts`: two `pRetry.AbortError` errors.
- `server/replit_integrations/chat/storage.ts`: two missing shared-schema exports.
- `server/replit_integrations/image/client.ts`: two optional `response.data` errors.
- `server/replit_integrations/image/routes.ts`: one optional `response.data` error.

Existing build warnings about bundle size and outdated browser mapping data are
not Phase 2 regressions. Existing long recipe titles may truncate in cards;
details and API retain their full titles.

No production/hosted database tests, paid AI requests, external customer tests,
deployment, planner/grocery regression suite, or later-phase scenarios were run.
Browser error handling was tested by tab-local failure injection, not by taking
down a shared server. The local cluster and preview are development-only and
temporary. Catalog prose remains English, while list state labels support the
existing three languages. No claims of a public-pilot-ready or complete MVP.

## 6. Next phase and mandatory approval gates

**Stop here. Phase 3 requires separate user approval.** Its proposed work is the
focused three-dinner planner and calendar-week browser persistence, preserving
existing advanced planning. Phases 3–6 have not been implemented.

Before any public deployment or external pilot, the following minimum server
safeguards **must be implemented and tested**, with separate approval:

1. Server-enforced restrictions on recipe POST/PATCH/DELETE and paid AI parsing/
   transcription (operator-only or disabled for the pilot). Hiding UI controls is
   not access control. The shared catalog must not expose unreviewed personal
   recipes; use a dedicated clean pilot database or review every exposed row.
2. Bounded, validated request inputs, smaller suitable body caps, and rate limits,
   including cost/size limits on paid AI requests.
3. Removal of full API response-body logging, especially recipes/transcripts.
4. Sanitized errors that do not expose provider details, and an error handler
   that does not rethrow after responding and terminate the process.
5. When analytics is introduced, bounded/validated/rate-limited ingestion and
   protected operator-only aggregate inspection; no public raw-event access.

These are acknowledged blockers, not Phase 2 hardening changes. No authentication
system, ownership migration, or broad security refactor is authorized by this phase.
