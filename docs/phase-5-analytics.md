# Phase 5 — MVP analytics and return measurement

## Status and hypothesis

Implemented and verified in the isolated development preview. Stop after this
phase for review. No deployment or customer invitations were performed.

Primary hypothesis supplied by the user:

> Customers who use Tablewise to plan dinners will find it valuable enough to
> return and plan another week.

This implementation measures the requested **later-calendar-week planning
proxy**, not an elapsed seven-day retention guarantee. A customer can complete
a later week's plan in the same session. The conversion definition intentionally
follows the approved instructions; it does not prove a separate return visit.

All current verification data is synthetic test activity, **not customer
evidence that the hypothesis is validated**.

Reviewed before changes:
[actual Phase 3 state](phase-3-planner.md) and
[Phase 4 grocery integration](phase-4-grocery.md). Dated MVP documents remain
independent of legacy `weeklyMealsState`. No planner/grocery redesign, account
system, third-party analytics service or new customer-facing feature was added.

## Event definitions and duplicate rules

| Event | Definition | Stored once per |
| --- | --- | --- |
| `planner_opened` | Valid dated MVP planner screen mounted | Anonymous browser + calendar week |
| `meal_selected` | A recipe was newly added/replaced in a successfully saved MVP selection | Browser + week + recipe ID |
| `plan_completed` | A successfully saved draft became a confirmed three-dinner plan | Browser + week |
| `grocery_list_opened` | MVP grocery screen opened with a valid confirmed plan | Browser + week |
| `next_week_plan_created` | Server-derived completion whose calendar week is later than that browser's first completed plan week | Browser + eligible later week |

`meal_selected` measures distinct selected recipes, not every toggle/click.
Replacing a recipe can add another distinct selection. Removing and reselecting
the same recipe in the same week does not inflate this count.

Page rerenders, refreshes, route revisits, repeat confirmation, same-week edits
and delivery retries do not add stored duplicates. Previously existing confirmed
plans are not retrospectively counted merely because someone opens them after
instrumentation was added.

The client may submit only the first four event names. It cannot declare a
return conversion. The server anchors the first completion using original
`occurred_at` order (event ID breaks exact timestamp ties), not request arrival
order. In one transaction it derives eligible later-week events and corrects
derived classifications when delayed, earlier completions arrive.

Opening another week, changing a recipe, or editing the original week's plan
does not constitute a return conversion. An earlier-calendar-week completion
also does not qualify, even if performed later in time.

## Identity, metadata and persistence

### Browser

`tablewise:pilot-analytics:v1` is a versioned, validated local-storage journal:

- A random cryptographic UUID identifies this browser/origin.
- Pending events carry stable UUIDs, original UTC timestamps and local
  Monday-based `YYYY-MM-DD` calendar-week identifiers.
- A bounded acknowledgment ledger remembers semantic event keys.
- Only `meal_selected` adds a recipe identifier; no recipe titles, ingredients,
  names, email, IP addresses, user agents, referrers or free-form text are sent.

This is pseudonymous browser identification, not an account or fingerprint.
Different devices/origins, private sessions, or cleared site storage can become
different pilots. If storage is denied/corrupt, telemetry warns in the developer
console and skips recording rather than inventing a new temporary identity on
every refresh. Planning continues.

### Delivery

Events are queued after successful local plan saves. UI actions never await
telemetry. Sending uses bounded batches, a five-second timeout, keepalive,
exponential retry up to a minute, `Retry-After` handling, and online/visible-page
resumption.

Pending events retain the same IDs/timestamps across failures and refreshes.
Only a successful HTTP acknowledgment removes them. Failure to save an
acknowledgment may resend a batch; database uniqueness prevents extra records.
Web Locks serialize journal writes across supported browser tabs. The server
also handles concurrent/repeated submissions.

The journal is bounded to 200 pending entries, 5,000 remembered events and
1 MB. Exhausted/corrupt storage causes a generic developer warning, not planning
failure. Delivery is best-effort, not guaranteed after browser data is cleared,
long-term offline use or quota exhaustion. Browsers without Web Locks have a
best-effort initial identity/write race across simultaneous tabs; no account
system was introduced to solve that.

### PostgreSQL

The additive `pilot_events` table contains:

- Event UUID and anonymous pilot UUID.
- Allowlisted event name.
- Calendar-week start date.
- Original occurrence timestamp and server receipt timestamp.
- Recipe identifier only for selection events; empty otherwise.

An event-ID primary key and a semantic unique constraint
`(pilot_id, event_name, week_start, recipe_id)` provide database-backed
idempotency. Week/name/recipe constraints, transactional writes, bounded SQL
timeouts and serialized conversion derivation protect integrity.

No startup or post-merge DDL is added. The reviewed migration is
`migrations/0001_pilot_analytics.sql`. The setup command is explicitly restricted
to an isolated local test socket and never falls back to the configured
application connection.

## Endpoint protection and privacy

The existing server safeguards were reviewed before adding telemetry. Their
blanket mutation guard previously blocked analytics writes too. The smallest
exception is **exactly** anonymous `POST /api/analytics/events`; this does not
open other analytics paths, methods, recipe writes or paid AI.

- Explicit feature flag `TABLEWISE_ANALYTICS_ENABLED=true` and a reviewed public
  catalog are both required. Defaults remain disabled.
- Same-origin POST required; only JSON, 16 KB maximum, at most 20 events.
- Strict Zod validation rejects unknown fields and client-authored conversion
  events. IDs, event names, Monday dates and metadata are bounded.
- Timestamps must be no more than five minutes in the future or 90 days old.
- General API budget: 120 requests/minute/process.
- Ingest budget: 60 requests/minute and 500/hour/process, plus 20/minute per
  anonymous pilot. Counter maps are bounded. Limits do not use/store IPs.
- Analytics storage has a hard 100,000-row cap, including derived conversions;
  a capacity breach rolls back and returns unavailable rather than overflowing.
- Database/provider failures return sanitized errors. Logs contain method,
  status, duration and fixed operation labels, not bodies, IDs or credentials.
- Existing recipe POST/PATCH/DELETE and paid AI routes still require operator
  authorization. AI is disabled in this reviewed local preview.
- No tracking SDK or third-party analytics endpoint was added.

The application deliberately does not retain IP addresses. Standard HTTP/proxy
infrastructure is outside this application-level storage claim.

Anonymous IDs are not authentication or bot-proof identity. Origin checks stop
ordinary cross-site browser posts, not a malicious non-browser sender. Rate,
size, time and capacity limits bound abuse; fabricated anonymous activity can
still bias these self-reported pilot metrics.

## Developer-only aggregate inspection

Local shell, restricted to the verified socket-only database:

```sh
npm run analytics:summary -- \
  --test-socket /tmp/tablewise-phase2-pilot/socket
```

For an authorized developer, `GET /api/analytics/summary` uses the existing
server-side operator guard. Anonymous requests receive 403. The local reviewed
preview deliberately has operator access disabled, so use the shell command
there. No credentials were requested, printed or configured for this phase.

Output contains only event totals, distinct-pilot totals, completed/returning
pilot counts, a return ratio and up to 26 first-plan-week cohorts. There are no
individual IDs, event records, unrestricted query parameters or raw-event APIs.
Hiding navigation is not used as access control.

```text
completedPilots = distinct pilots with plan_completed
returningPilots = distinct pilots with next_week_plan_created
returnRate = returningPilots / completedPilots
```

The rate is `null` with no completed pilots. Multiple later-week completions
yield multiple per-week conversion events, but count the pilot only once in the
numerator. The all-time rate is not adjusted for cohort maturity; inspect the
week cohorts before interpreting it as evidence.

## Changed files

- `shared/pilot-analytics.ts`: public event contract, keys and time validation.
- `shared/schema.ts`, `migrations/0001_pilot_analytics.sql`: analytics table,
  indexes and constraints.
- `server/pilot-analytics.ts`: PostgreSQL persistence, conversion derivation,
  capacity protection and aggregates.
- `server/db.ts`: export existing pool for the new store; no connection switch.
- `server/security.ts`, `server/routes.ts`: exact ingestion exception,
  validation/limits, private summary and privacy-preserving budgets.
- `client/src/lib/pilot-analytics.ts`: persistent anonymous journal and delivery.
- `client/src/hooks/use-pilot-page.ts`: deduplicated page instrumentation.
- `client/src/hooks/use-week-workspace.ts`: instrument successful selections
  and confirmations, not failed local writes.
- `client/src/pages/mvp-planner.tsx`, `mvp-grocery.tsx`: instrumentation hooks
  only; layout and customer workflow unchanged.
- `script/setup-local-analytics.ts`, `script/pilot-summary.ts`: local setup and
  developer aggregate command.
- `script/test-pilot-analytics-client.ts`, `test-pilot-analytics.ts`:
  fixture, API and real PostgreSQL tests.
- `script/test-mvp-browser.ts`: extend the existing real-browser journey with
  telemetry delivery/return assertions.
- `script/local-test-app.ts`, `.env.example`, `package.json`,
  `tsconfig.analytics.json`: reviewed local enablement and commands.

## Database isolation and verification

A workspace restart removed the old temporary cluster. The approved local test
service was recreated at the same private path. Before restoring data, the
helper verified the server's actual data directory, exact socket/database
relationship and disabled TCP; isolation was reported before seed/setup.

- Data directory: `/tmp/tablewise-phase2-pilot/data`.
- Private Unix socket: `/tmp/tablewise-phase2-pilot/socket`.
- Restored only the 12 reviewed dinners using existing catalog verification.
- Added the analytics table explicitly to that isolated database.
- Store/API tests created a fresh uniquely named test schema, then removed only
  that schema. Recipe row hashes were unchanged during analytics tests.
- Browser tests wrote synthetic telemetry through the normal running app API
  and compared the persisted PostgreSQL records. That demonstration data
  remains local and must not be mistaken for customer validation.
- No configured hosted/production database was queried, migrated or modified.

### Results

| Check | Result and evidence |
| --- | --- |
| Anonymous identity and event creation | Fixture client and real browser/API/PostgreSQL passed |
| Duplicate prevention | Concurrent sends, same semantic key/new UUID, rerender-style calls, refresh, reselection and failed acknowledgment retry passed |
| Failed delivery | Simulated network rejection/503 preserved pending IDs; real browser saved/confirmed plans during failure and later delivered queued events |
| Page refresh | Browser identity and acknowledged/pending semantic keys persisted without extra stored records |
| Week rollover | Older plan/checks survived; opening a later week produced no conversion |
| Repeat-week measurement | Later completed week produced one conversion; subsequent same-week edit/reconfirmation produced no extra conversion |
| Delayed/out-of-order delivery | Real PostgreSQL transaction tests corrected the baseline and derived conversion classification |
| Aggregation and privacy | Known synthetic cohort counts/rates matched; no raw IDs returned; anonymous summary requests rejected |
| Endpoint abuse controls | Feature flag, origin, content type, unknown metadata, malformed IDs/dates/time, oversized body, batch cap and rate limits passed fixture API tests |
| Existing safeguards | All 16 security groups passed, with no real AI calls |
| Existing UI behavior | Three-dinner/grocery journey, replacement, missing-recipe/API faults, legacy routes, mobile and EN/RU/HE RTL passed Chromium checks |
| Focused TypeScript | `npm run check:analytics` passed |
| Production build | Passed; existing large-bundle warning remains |
| Whole-project TypeScript | Same seven pre-existing errors in unused batch/chat/image scaffolds; not fixed here |

Fixture tests use injected storage/network/providers and controlled metadata.
Real tests use the explicitly verified PostgreSQL database and actual HTTP API;
the full browser run checks actual persisted events. Failure/deletion/quota
scenarios are browser-only or fixture injections, never production changes.

### Commands

```sh
npm run check:analytics
npm run test:analytics -- --test-socket /tmp/tablewise-phase2-pilot/socket
npm run test:analytics-browser -- "https://$REPLIT_DEV_DOMAIN" \
  --test-socket /tmp/tablewise-phase2-pilot/socket
npm run test:pilot
npm run build
```

The browser command uses the existing temporary-profile Chromium/CDP setup on
local port 9222, not additional dependencies. The running preview uses the same
verified local socket, reviewed catalog and analytics flag. Public/other
environments remain disabled until separately configured and approved.

## Remaining pilot-release blockers and limits

1. Separate approval is still required to deploy or invite customers. These
   tests do not establish production readiness or validate customer demand.
2. Any persistent/published database target needs its own reviewed schema,
   isolation/data-access decision and catalog approval. Temporary `/tmp`
   services and records do not survive all workspace restarts.
3. Operator inspection must remain server-protected; any operator credential
   must be provisioned through Secrets, never a frontend variable or chat.
4. Per-process global limits suit a small pilot, not distributed/high-volume
   traffic. Public abuse can exhaust shared budgets or contaminate anonymous
   metrics; review pilot access/distribution and infrastructure controls before
   opening it broadly.
5. Approve a retention/deletion policy and operational capacity monitoring
   before collecting real pilot activity. There is no automatic deletion job;
   at capacity ingestion fails closed. Events pending beyond 90 days or with
   substantially wrong client clocks need explicit diagnosis/recovery.
6. Browser clearing/private mode, unsupported cross-tab locks, storage quotas,
   blocked requests and client-clock skew can bias measurements. Plans remain
   browser-local and are not backed up by this analytics table.
7. The same seven unrelated full-project TypeScript errors and bundle warning
   remain outside this approved phase.

Stopped after Phase 5. No next phase, accounts, customer features, production
data changes or deployment were started.
