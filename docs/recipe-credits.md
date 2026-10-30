# Saved recipe credits — development

**Navigation update:** `/meals` is now the main screen; `/` and the retired
`/plan` redirect there. Earlier references to two planners describe the
previous layout. The current behavior is documented in `docs/meals-home.md`.

The owner approved saved Chef / Mine attribution fields in development.

## Using it

Every recipe card in `/plan`, `/meals` and `/recipes`, including selected dishes and
calendar entries, displays its creator credit. Detail pages display the credit
and an editable **Recipe credit** form.

Open **See full recipe**, choose:

- **Chef / creator** — a name is required.
- **Mine** — the person's name is optional. A blank name displays **Mine**;
  a supplied name displays **Mine — Name**.

Choose **Save credit**. Credits are stored in PostgreSQL and survive reloads.
This is a catalog attribution label, not a user account or a private ownership
permission.

## Honest attribution

The twelve researched recipes have creator names checked against their
existing source pages' Recipe JSON-LD. Some creators are community contributors
or a publisher's team, not necessarily professional chefs. The exact checked
names and evidence are in `server/seeds/recipe-credits.json`; the corresponding
URLs remain in `server/seeds/researched-dinners.json`.

The eight visible synthetic fixtures display **Chef reference (synthetic
recipe)** using their supplied reference names. These are not assertions of
authorship or endorsement. An explicit **Mine** selection takes precedence.
Unknown legacy attribution is shown honestly rather than invented.

## Data and development boundary

- The additive migration adds nullable `credit_kind` and `credit_name` fields.
  A database constraint and shared request validation enforce consistent values.
- All 112 stored recipes remain. The catalog still shows only the selected 20.
- A before/after comparison preserved every pre-existing column of all 112
  records, including ingredients, steps, source links, tags, portions, timing,
  unknown legacy columns and original timestamps. Only the new credit fields
  were added; twelve verified creator credits were populated.
- Saving a credit changes only those two fields. It does not rewrite the
  original recipe timestamp, instructions or timings.
- Existing selected-recipe content updates/deletions remain blocked.
- The separately bounded development-credit endpoint accepts only the two
  credit fields, requires the same origin, and is rate-limited.
- Credit editing is available to people with access to this development
  preview. It is **not authenticated per-user ownership** and must not be used
  as a public-pilot authorization model.
- Editing requires both the explicit curated-development setting and a
  non-production runtime/configuration. Outside that mode the anonymous
  development write permission is unavailable. Existing operator/paid-AI
  protections are unchanged.
- Reads remain compatible with a database that lacks the new columns.

No production database operations or publication were performed. The reviewed
migration is not invoked by application startup, a merge hook or a deployment
hook.

## Verification

`npm run test:recipe-credit -- --test-socket /tmp/tablewise-phase2-credit/socket --browser`
used a new socket-only temporary PostgreSQL cluster and actual HTTP/browser
requests. It verified:

- legacy reads, idempotent migration and the database constraint;
- Mine without a name, Mine with a name, Chef with a required name;
- actual persisted values after reload, including both planners;
- cross-origin, invalid-input and missing-record rejection;
- production-like write rejection and existing recipe-content write protection;
- unchanged original recipe columns and timestamps.

The main-development browser suite checked all 20 detail pages and both
planners for correct creator/Mine/reference rendering and available credit
controls. Its invalid credit request confirmed the real preview proxy's
same-origin path without mutating data.

Ignored full-row baselines before and after this feature are retained under
`generated-artifacts/main-development-before-credits.json` and
`generated-artifacts/main-development-after-credits.json`.
