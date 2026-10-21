# TableWise server safeguards

## Scope and approval

This implements the server restrictions described in the MVP audit and section
6 of `docs/phase-2-catalog.md`. It does **not** approve a public deployment, a
customer pilot, production database writes, or an accounts/ownership migration.
The catalog, planner, grocery list and analytics phases retain their own approval
gates. No deployment, customer invitation, real AI request or change to the
configured application database was performed.

The catalog is still shared, not user-owned. Operator-created recipes become
visible to everyone when public catalog access has been approved. Operators must
not put personal or unreviewed material in that database.

## Fail-closed configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `TABLEWISE_PUBLIC_CATALOG_REVIEWED` | `false` | Public recipe GET/HEAD is 503 until the database and every exposed row are reviewed. Exact value `true` is an operator attestation, **not** proof that a connection is isolated. |
| `TABLEWISE_OPERATOR_TOKEN` | absent | All recipe mutations and paid requests are inaccessible. Optional high-entropy credential of 32–256 characters, stored only in server-side Secrets. Short/missing values disable operator access. |
| `TABLEWISE_AI_ENABLED` | `false` | Valid operators also receive 503 on AI routes. Exact value `true` enables only the two hardened routes, still subject to authentication, size limits and budgets. |

No `NODE_ENV=development` bypass exists. No client-provided operator flag,
forwarded IP, hidden link, browser storage value or frontend environment variable
grants access. Never prefix the operator credential with `VITE_`, put it in a URL,
commit it, print it, or reuse an API/database credential for it.

AI is created lazily, after authorization and validation, with a 20-second SDK
timeout and automatic retries disabled. The app starts without AI credentials.
With AI enabled, missing provider configuration fails with a sanitized error.
There are no new third-party services or customer accounts.

### Browser and development/operator tools

1. Configure the optional operator credential through secure workspace tooling.
2. On the app's HTTPS origin, open `/operator`. Enter the credential in the
   password form (never in a URL). Invalid attempts are throttled.
3. Continue to the existing `/import` and `/recipe/:id` tools. Their same-origin
   fetches carry the operator session automatically. Paid import additionally
   requires the separate AI enable flag and provider credentials.
4. Use the sign-out form at `/operator` when finished.

Sessions use random, HttpOnly, SameSite=Strict cookies, Secure in production,
limited to `/api`, stored server-side by hash, and expire after one hour. There
are at most 20 sessions per process; restarting the server invalidates them.
Changing the operator credential requires a restart. Cookie-based writes and
login require an Origin matching the request Host; production requires HTTPS.
Production TLS/Host forwarding must be verified before approval.

Operator API tools can instead send `Authorization: Bearer <operator credential>`
over HTTPS. Bearer authorization is not persisted by the app. A malformed
Authorization header cannot fall back to a valid cookie.

## Routes and boundaries

| Request | Anonymous visitor | Operator |
| --- | --- | --- |
| Recipe list/detail GET and HEAD | Approved catalog only | May inspect before public approval |
| Recipe POST/PATCH/DELETE | 403, no storage mutation | Validated, bounded, rate-limited |
| Parse/transcribe POST | 403, no provider call | 503 unless separately enabled, then budgets and validation |
| Analytics namespace reads | 403 | Currently 404: no analytics endpoints or tables added |
| Unknown API writes | 403 | 404 after operator guard |
| Unknown API reads | 404, not SPA HTML | 404 |

All current and future API writes inherit the operator guard; analytics
inspection is also guarded for GET/HEAD. Integration scaffold routes for
chat/audio/image are **not mounted**, remain unavailable, and must not be enabled
to bypass these policies. Future analytics must be registered after the guards
and before the API 404 handler. Public event ingestion, if approved later, needs
a narrowly scoped write-only exception with its own strict schema, caps and
quotas; do not exempt an entire analytics namespace or expose raw event records.

## Input, cost and traffic limits

Limits are enforced before database/provider work. Authentication precedes body
parsing on protected routes. Counters also charge rejected/invalid attempts, so
remaining provider capacity may be lower than the maxima below.

| Limit | Value |
| --- | --- |
| Login body | 1 KiB; at most 2 form parameters |
| Recipe/parse JSON | 64 KiB |
| Audio JSON | 6 MiB; decoded audio at most 4 MiB, canonical base64 |
| Compressed request bodies | Rejected (415) |
| Title | 1–200 trimmed characters |
| Ingredients / steps | 1–100 each; item caps 1,000 / 2,000 characters |
| Tags | At most 20, each 1–50 characters |
| Recipe ID | 1–150 letters/digits/colon/underscore/hyphen |
| Cooking time | Integer 0–10,080 minutes |
| Image/source links | HTTP(S), at most 2,048 characters, no embedded credentials |
| Transcript | 1–12,000 trimmed characters |
| AI text output | At most 2,048 completion tokens per call; parsed recipe revalidated |
| Language / audio type | EN/RU/HE; explicit browser audio MIME allowlist |
| All API traffic | 600 requests/minute/process, 120/minute/transport-IP |
| Operator writes | 30/minute/process |
| Login attempts | 5/15 minutes/IP, 20/15 minutes/process |
| AI requests | 5/minute, 20/hour, 40/day/process |
| AI concurrency | 2 requests/process; slot retained until provider work ends |
| Rate-limiter keys | At most 1,000; capacity exhaustion fails closed |
| HTTP request/header timeout | 30 / 10 seconds |

POST and PATCH reject unknown keys. PATCH rejects empty updates. IDs, timestamps
and ownership-like fields cannot be mass-assigned. The database storage class
also validates create/update data before building SQL.

A parse request makes one provider call. A transcription request makes at most
two: transcription and optional transcript correction. Verification failures
return the original transcript, with only a fixed diagnostic logged. An oversized
transcript is rejected before correction. Thus at most 80 provider calls can
result from the 40-request daily allowance in a single uninterrupted process.
This is **not a guaranteed currency spending cap**: audio duration and provider
prices vary. Keep AI disabled for the anonymous pilot; provider-side budget
controls require separate review if operators enable it.

### Important single-process limitations

Counters and sessions are in memory and reset on restart. Multiple instances
would each have separate allowances. This is intentionally a minimal,
AI-disabled pilot safeguard, not a distributed quota or durable billing system.
Keep AI disabled until durable quotas/provider budget settings are separately
approved if hard spending guarantees are required.

`trust proxy` is disabled: arbitrary `X-Forwarded-For` cannot evade limits.
Behind Replit's proxy, visitors may share one transport-IP bucket (conservative
throttling). Validate proxy topology and small-pilot capacity before approving
deployment; never simply trust every forwarded header.

## Logs and error behavior

API access logs contain only method, response status and elapsed time—not URLs,
queries, request bodies, response bodies, credentials, recipes or transcripts.
Failures log fixed operation/status labels, not provider/database error objects.
Clients receive stable generic messages. Malformed JSON, oversized bodies,
provider failures and database errors do not rethrow after responding.
If headers were already sent, the connection closes without dumping error data.
API responses and operator pages use no-store caching; the login page disallows
embedding and third-party resources.

## Verification and isolated preview

Focused checks:

```sh
npm run check:pilot
npm run test:pilot
npm run build
npm run test:pilot-startup
```

The security suite exercises anonymous/operator permissions, safe defaults,
cookie/CSRF/expiry/logout, brute force, body/content/field/base64 bounds,
mass-assignment, AI minute/hour/day/concurrency caps, disabled AI, provider/DB
failures, output validation, log redaction, analytics guards and limiter capacity.
Provider responses are fake; no paid requests are made.

The production startup check launches the actual bundle with an allowlisted
environment containing no database, operator or AI credentials. It proves startup
and fail-closed sensitive-route behavior. It does not publish anything.

The database suite uses the isolation verifier in `script/local-test-database.ts`.
For this work a fresh private cluster was prepared at
`/tmp/tablewise-phase2-pilot/data`, with its private socket at
`/tmp/tablewise-phase2-pilot/socket` and TCP disabled. Server settings were
verified before any schema/seed/test writes. The catalog tests retained exactly
12 reviewed dinners. Permission tests then used the actual `DatabaseStorage`
class and compared the entire before/after catalog; all baseline rows and
timestamps were unchanged after deleting only their own unique fixture.

```sh
# Only after approval/preparation/isolation verification of this local cluster:
npm run test:pilot -- --test-socket /tmp/tablewise-phase2-pilot/socket
npm run dev:test-catalog -- --test-socket /tmp/tablewise-phase2-pilot/socket
```

The preview launcher rechecks both isolation and exact approved catalog content,
requires exactly 12 dinners and no other rows, enables public read access only
for that child process, and explicitly disables operator access and AI. It never
falls back to the application database. This local cluster is disposable; it
does not authorize or configure a production database. See
`docs/phase-2-catalog.md` for new-cluster preparation; keep PostgreSQL in a
persistent background process for the preview.

### Results and remaining gates

- All 17 permission/abuse/database security test groups passed.
- Catalog seed/concurrency/preservation checks passed in the fresh isolated DB.
- Focused security typecheck and production build passed.
- Credential-free production-bundle startup check passed; sensitive endpoints
  stayed closed without database, operator or AI credentials.
- Full-project typecheck still has the seven previously documented errors in
  unmounted chat/image/batch scaffolds; no tables were added or integrations
  enabled just to suppress those errors.
- No production or hosted DB was queried or changed; no actual operator
  credential was provisioned; no paid AI request was made.
- Signed-in operator behavior is covered by HTTP tests. Browser screenshot checks
  cannot authenticate and do not verify signed-in provider integrations.

Deployment approval, appropriate production data review, proxy/capacity checks,
provider budget policy if AI is enabled, and the remaining independently approved
product phases are still required before inviting external customers.
