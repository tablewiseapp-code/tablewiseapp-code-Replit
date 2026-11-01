# Interactive import: step timing review

## Scope and meaning

Typed imports and voice imports both pass through complete-recipe timing
analysis before final save. Typed entry uses **Analyze step times** as the
first completion action; it never saves immediately. Voice fill automatically
analyzes after transcription and parsing. Review the instructions, duration
badges and warnings, then use **Save & open**.

Each analyzed instruction keeps its exact text and a positive integer duration
or range in seconds, minutes or hours (maximum seven days). `Source-stated`
means stated in the supplied instruction, **not independently verified**.
`AI estimate` means the supplied instruction did not provide that duration.
Simple numeric stated ranges are preserved locally even if the provider
mistakenly estimates them. Fractional minutes/hours can be represented as exact
seconds rather than rounded. More complex language and multiple durations within
one instruction depend on the model, so source-stated badges still require review.

Warnings highlight potential internal inconsistencies, including the attached
crawfish-omelette title with fish-fillet ingredients and instructions. They
do not correct the recipe or verify authorship, source authenticity, food safety
or culinary correctness. Automated regression tests use that example as an
import draft; they never change the pinned synthetic recipe/catalog.

Preparation and cooking remain separate stage fields. Only the existing
preparation-plus-cooking rule determines total time when both are known.
**Never sum step durations into recipe totals:** steps can overlap.

## Failure and retry

An analysis must cover every instruction exactly once, in order, with valid
units, bounds and provenance. Missing steps, reordered/rewritten instructions,
invalid ranges, refusal, truncated/malformed output, timeout and provider
errors fail closed. The draft remains in the current page and an inline error
explains retry. The draft is **not** durable across navigation/reload.

Changing title, ingredients, instructions, preparation/cooking or servings
makes the old analysis unusable. Responses for an outdated draft cannot replace
the current review. Final save is a separate action after review; repeated
clicks cannot start parallel client analysis/save requests. A voice parse
arriving after manual edits preserves those edits instead of replacing them.

The interactive `/api/import-recipe` endpoint accepts only a currently
server-validated result matching the complete context. Per-process successful
analysis results expire after ten minutes, restart, or bounded cache eviction.
An expired save asks for another analysis. Save failure clears the review so
the Analyze action is available again. Legacy `/api/recipes` creation remains
available to the existing protected non-interactive workflows.

## Operator and paid-provider boundaries

No AI is enabled by this change. Existing operator authorization, same-origin
cookie restrictions and `TABLEWISE_AI_ENABLED=true` prerequisites still apply.
The researched preview deliberately forces AI off. Credential provisioning,
enabling paid AI, deployment and public pilot approval require separate approval.
See [pilot-safeguards.md](pilot-safeguards.md).

Analysis reuses the existing five-per-minute, twenty-per-hour, forty-per-day
AI request budgets, two-active-request concurrency cap, and write/global limits.
Requests are bounded to 100 steps and 16,000 serialized recipe characters
(also existing per-field and 64 KB request-body limits).
Output has a bounded 8,192-token budget, twenty-second SDK timeout and no retries.
Logs and errors do not expose recipe text or provider details.

Identical valid analyses share in-flight/completed work for ten minutes, up to
50 entries; parsed transcripts similarly share work, up to 20 entries.
Keys are hashes, not recipe text. Errors are not cached. Client voice retry
also reuses unchanged transcription and parsing. Request quotas still apply
to cache hits, so repeated clicks cannot bypass request controls.

## Storage and separately reviewed migration

`migrations/0004_recipe_step_analysis.sql` is **prepared, not applied**.
It adds nullable JSONB metadata without backfill or instruction rewrites.
Application validation binds the complete timing context and each instruction's
exact text to the timing array. JSONB stores version, context, per-step durations,
provenance and warnings together. Context-changing edits clear existing
analysis; display validates alignment again before showing badges.

Legacy rows and schemas remain readable: JSON row lookup yields null when the
new column is absent; old recipes show `Time unspecified` per step. A write
requiring missing timing storage returns a sanitized setup error without a
partial save. No runtime migration or automatic post-merge schema push is added.

Before a separately approved application, review the target, take a backup,
and apply this additive migration explicitly. To roll back application code,
leave the nullable column intact. Dropping it requires separate approval and
an export because that destroys saved timing analysis. No backfill is needed.

## Safe verification

- `npm run test:step-analysis`: fake provider and in-memory/API/storage mocks;
  explicit units/ranges, invalid output, mismatches, stale data, cache expiry,
  disabled AI/auth, quota/concurrency, round trip and legacy-read SQL.
- `npm run test:step-analysis-browser`: actual browser with fake microphone,
  provider and in-memory storage; typed failure/retry/review/edit/save/reload,
  stale in-flight responses, source/range badges, voice parse/automatic
  review/save and parsed metadata retention. Requires the
  existing local Chromium debugging endpoint on port 9222.
- `npm run test:step-analysis-postgres -- --test-socket /tmp/tablewise-phase2-step-analysis/socket`:
  verifies the target is a fresh private socket-only cluster before writing;
  real API/SQL tests ordinary creates on legacy schemas, missing-column
  failures without partial writes, repeat-safe migration and timed round trips.
  Does not read or fall back to the application's configured database.
- `npm run test:pilot`: security regressions without a database unless the
  explicit verified isolated socket is passed.
- Existing `test:recipe-timing` requires a separately proven isolated PostgreSQL
  target; never substitute the application database.

The new tests need neither real paid calls nor application database mutations.
The isolated PostgreSQL regression has been run successfully against a freshly
created temporary cluster with TCP disabled. The application database migration
remains unapplied. Live transcription accuracy and real-provider estimate quality
are not verified by fake-provider tests.
