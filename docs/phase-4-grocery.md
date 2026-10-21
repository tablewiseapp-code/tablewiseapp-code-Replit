# Phase 4 — confirmed-week grocery integration

## Status

Implemented and verified in the isolated development preview. Stopped after
Phase 4 for review; no deployment or customer invitations.

The missing three-dinner planner prerequisite was rebuilt after approval.
Its actual state contract is documented in [Phase 3](phase-3-planner.md).
Earlier catalog setup is documented in [Phase 2](phase-2-catalog.md).

## What changed

- `/` and `/plan?week=YYYY-MM-DD`: choose three dinners, assign three distinct
  days, confirm the week, then **View Grocery List**.
- `/grocery-list?source=mvp&week=YYYY-MM-DD`: groceries for exactly those
  three confirmed recipes and that dated week.
- Back-to-planner links keep the same explicit week.
- Week-specific persistent checkmarks, category grouping, safe merging,
  contribution details, retry/recovery states and EN/RU/HE + RTL.
- `/meals` and `/grocery-list` without `source=mvp` retain their existing
  advanced-planner behavior. Neither legacy page was rewritten.

No authentication, analytics, AI recommendations, pantry matching, delivery
integration, database migration or new package dependency was added by this
phase. Pre-existing unfinished server-safeguard changes remain separate work;
this report does not approve or certify those changes.

## Files added/changed for this feature

| File | Role |
| --- | --- |
| `client/src/lib/week-plan.ts` | Dated plan/check schemas, calendar helpers and plan transitions |
| `client/src/lib/grocery-engine.ts` | Pure category, conservative quantity and contribution logic |
| `client/src/hooks/use-week-workspace.ts` | Validated per-week persistence and real API query |
| `client/src/lib/mvp-copy.ts` | Typed EN/RU/HE interface strings |
| `client/src/pages/mvp-planner.tsx` | Three-dinner planner prerequisite |
| `client/src/pages/mvp-grocery.tsx` | Confirmed-week grocery UI |
| `client/src/App.tsx` | Routes, root entry and legacy/MVP grocery dispatch |
| `client/src/lib/i18n.tsx` | Translated planner navigation entry |
| `script/test-mvp-grocery.ts` | Fixture and optional read-only PostgreSQL/API checks |
| `script/test-mvp-browser.ts` | Repeatable real-browser journey and tab-only fault injection |
| `tsconfig.mvp.json`, `package.json` | Focused TypeScript/test commands |
| `docs/phase-3-planner.md`, this report | Contract, verification and limitations |

No Phase 4 server or database code changes were needed.

## Data flow and grocery behavior

```text
Explicit calendar-week URL
  -> validated tablewise:mvp:plan:v1:<Monday> browser document
  -> confirmed selectedRecipeIds (exactly 3) + dated assignments
  -> normal GET /api/recipes
  -> only the 3 selected IDs are resolved
  -> conservative grocery aggregation
  -> grouped ingredient rows + original contributions
  -> tablewise:mvp:grocery:v1:<Monday> checkedIds
```

Unconfirmed or incomplete drafts do not produce a grocery list. A replacement
retains its assigned day but requires confirmation again before a revised list
is shown. Grocery generation never mutates the saved plan.

### Quantities, units and duplicates

- Every original ingredient line contributes; there is no lossy set-based
  deduplication.
- Merge only an unambiguous positive number and supported measured unit with
  the same normalized ingredient/preparation text.
- Recognized units: `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, plus equivalent
  teaspoon/tablespoon/cup spellings. Aliases normalize within the same unit;
  no cross-unit conversions.
- Integer, decimal and ordinary/mixed fraction addition uses reduced rational
  arithmetic with safe-integer checks rather than rounded floating sums.
- Different units (`g` vs `kg`, `tsp` vs `tbsp`), different preparation wording,
  counts, ranges, unrecognized units and vague quantities remain separate.
- A single line keeps its original text. A merged row displays its total;
  expandable details retain every original quantity, unit and source recipe.
- Categories: produce, meat/poultry, seafood, dairy/eggs, grains/pasta,
  canned/jarred, seasonings and other.

Check identity contains the contributing recipe IDs, ingredient positions and
original strings, not just a display label. An unchanged contribution group
retains its check after replacement. A changed total/source does not inherit a
previously checked state. Hidden historical checks are retained rather than
silently deleted during an outage; only currently visible rows count toward
progress.

### Failure behavior

- A successful response missing a selected recipe produces an explicit
  incomplete-list warning. Available recipes still contribute; selected IDs,
  assignments, confirmation and stored checks are not erased.
- An API outage shows retry. Previously cached data may remain visible but is
  identified as stale; checks are disabled while loading/erroring.
- A cold outage does not falsely report that recipes were deleted.
- Invalid saved JSON/schema, cross-tab changes and browser-storage failures
  display recovery messages instead of silently overwriting saved state.
- Resetting a plan or check document requires explicit user confirmation.

Interface copy is translated. Stored recipe/ingredient content stays in its
original language, isolated appropriately so English quantities retain their
reading order inside the Hebrew RTL layout.

## Real catalog investigation and database status

**The current isolated preview has 12 actual PostgreSQL records**, not a
frontend fixture or fallback catalog.

The earlier catalog seed targeted a dedicated temporary test database. Those
records are not transported by a Git merge. An app pointed at a different
database therefore does not automatically acquire them. This explains the
configuration/data distinction; it is **not** a claim that a hosted or
production database was inspected.

For this verification, the existing helper established all of the following
before opening the test database:

- Explicit private Unix socket `/tmp/tablewise-phase2-pilot/socket`.
- Server data directory `/tmp/tablewise-phase2-pilot/data`.
- TCP disabled, approved local database and expected socket/data relationship.
- No fallback to the configured application `DATABASE_URL`.

The 12 rows were checked against every reviewed catalog entry. The same
persisted ingredients/titles were fetched through normal `GET /api/recipes`,
and grocery output was compared against the direct read-only database result.
Three real selected dinners yielded 23 shopping rows while preserving every
original ingredient contribution.

**No inserts, updates, deletes, reseeding or schema changes were made for
Phase 4 verification. No hosted/production database was queried or modified.**

### Safe catalog steps if a different preview is empty

1. Check which service/configuration the preview is using without exposing
   credentials. Do not assume isolation from a database name or environment.
2. Obtain explicit permission for a dedicated test target and verify its
   server/socket/data-directory isolation before any write.
3. Use the reviewed socket-only seed tooling described in Phase 2, not
   automatic startup/merge seeding or an unverified application connection.
4. Re-run catalog verification and normal API reads before customer-facing
   testing. The current verified preview needs no additional seed.

## Verification results

| Required scenario | Evidence/result |
| --- | --- |
| Correct ingredients for the three confirmed dinners | Fixture assertions, direct real PostgreSQL/API comparison and real Chromium flow passed |
| Unrelated recipes excluded | Fixture and real-record contribution assertions passed |
| Duplicate ingredients preserved/safely combined | Exact source-count checks, independent count/vague duplicates and fraction/decimal sums passed |
| Mismatched units remain separate | `g`/cups, `tsp`/`tbsp`, unrecognized ounces, preparation changes and ranges passed as fixture tests |
| Replacing a recipe updates groceries | Actual browser replacement preserved day, reopened confirmation and changed grocery contributions; unaffected checks survived |
| Refresh preserves plan and checks | Browser reload and next/previous week checks passed; raw saved documents retained |
| Deleted/unavailable selected recipe | Browser-only simulated missing-record response warned incomplete, retained remaining groceries and preserved saved plan |
| API outage preserves saved dinners | Browser-only HTTP 500/retry recovered without changing plan/check bytes or falsely claiming deletion |
| Advanced planner preserved | Legacy `/meals` and `/grocery-list` rendered; `weeklyMealsState` and MVP state remained separate; legacy page files unchanged |
| Mobile + EN/RU/HE/RTL | Browser checks at 320/390px, English journey, Russian rendering and Hebrew RTL passed; screenshot inspection covered quantity direction |
| Corrupt/failed browser persistence | Invalid JSON remained untouched; simulated quota failure displayed an error and preserved previous saved plan |

**Fixture vs real data:** arithmetic/ambiguous-unit edge cases use explicit
test fixtures. The ordinary planner-to-grocery browser journey and API/database
comparison use the real reviewed PostgreSQL catalog. Deletion, API failure and
quota failure were simulated only inside the isolated test browser tab; no real
recipe was deleted and no server outage was caused.

### Commands

```sh
npm run check:mvp
npm run test:mvp -- --test-socket /tmp/tablewise-phase2-pilot/socket \
  --base-url "https://$REPLIT_DEV_DOMAIN"
npm run test:mvp-browser -- "https://$REPLIT_DEV_DOMAIN"
npm run build
```

The browser script needs a separate temporary Chromium profile with its local
debugging endpoint on port 9222; it uses the existing Chromium/`ws` tooling,
not additional packages. It creates/closes a test tab and changes only browser
storage and responses in that test environment. A targeted `--rtl-only` follow-up
checks quantity direction against the previously saved test week.

- Focused TypeScript: **pass**, including client code and new test scripts.
- Fixture + real PostgreSQL/API checks: **pass**.
- Real Chromium journey/fault checks: **pass**, no uncaught runtime exceptions.
- Production build: **pass**; existing large-bundle warning remains.
- `git diff --check`: **pass**.
- Full-project `npm run check`: **fails with the same 7 baseline errors** in
  unused batch/chat/image integration scaffolds (AbortError API, absent
  conversation/message exports, potentially undefined image response data).
  These were deliberately not fixed in this phase.

## Remaining risks and next approval

- Plans/checkmarks are origin-local browser storage, not cross-device backups
  or server data. Clearing browser/site data loses that local state.
- Missing recipes cannot contribute historical ingredients because plans
  retain IDs, not immutable recipe snapshots. The UI warns rather than
  inventing a complete list; replacement is an explicit user action.
- Ingredient categorization is keyword-based. Conservative merging may leave
  multiple similar lines intentionally; no fuzzy conversion/scaling is done.
- The temporary PostgreSQL service must remain running for this local preview.
  Provisioning or seeding another environment requires separate verification
  and approval.
- Existing global recipe access and unfinished safeguard work are not
  certified for an external pilot by these grocery checks.
- No deployment, analytics, authentication work or public/customer testing is
  authorized by this completion. Review this phase before approving more work.
