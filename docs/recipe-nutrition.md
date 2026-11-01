# Development nutrition estimates

The owner approved paid AI nutrition analysis and saved development estimates.
Production access and publishing remain out of scope.

## Visible behavior

Nutrition display is now optional and defaults off. The Nutrition details switch
shows/hides both these summaries and ingredient food-group headings, while
clearly labelled mock CAD prices remain visible. See `docs/recipe-display-modes.md`.

The twenty visible development recipes have saved AI-assisted estimates for:
calories (kcal), protein, total carbohydrate, fat, fiber and **total sugar** (g).
The summary appears next to portions/preparation on meal cards and other active
planning placements, and on full recipe details.

- Numeric servings display per portion.
- Serving ranges such as 2–3 display a corresponding per-portion nutrient range.
- Explicit yields such as 10 quesadillas or 12 muffins display **per quesadilla**
  or **per muffin**, not per person.
- Unrecognized serving descriptions display whole-recipe values with an
  explicit unknown-serving-size label. They are not guessed or divided by one
  while being presented as per-portion values.
- Missing, stale or invalid analyses display “Nutrition not analyzed,” never
  fabricated zero nutrition. Unavailable storage is a separate visible state.
- English, Russian and Hebrew labels are supported.
- Estimate details show assumptions, date and analysis method. These are not
  verified food-label, laboratory or medical nutrition values.

## Analysis provenance and limitation

The configured application OpenAI service returned HTTP 429 on its first
bounded request. No result from that request was saved and it was not retried.

The current twenty estimates instead came from an actual one-time AI-assisted
development analysis. Ingredient-level outputs were checked for complete,
unique ingredient coverage and nonnegative values, then summed programmatically
into recipe totals. Optional unquantified serving sides were excluded with
assumptions. Synthetic recipes explicitly retain development-fixture notices.

The stored method identifier `replit-assisted-analysis` denotes that workflow,
not a claimed underlying model name and not a successful application OpenAI
request. This does **not** establish that automatic application inference is
working. Future direct OpenAI generation still needs a usable account/quota.

The source inputs, ingredient-level outputs and validated import payload are
under ignored `generated-artifacts/nutrition-*.json` for development audit.

## Storage and safety

Nutrition is saved independently in `recipe_nutrition`. Its reviewed development
setup is `migrations/0004_recipe_nutrition.sql`. No startup, merge or publish hook
runs that SQL. Shared Drizzle schema describes the table for normal tooling.

All 112 existing recipe records—including their ingredients, timing, credits
and timestamps—remained unchanged. Full-row database digests matched before
setup, after analysis import and during final read-only verification.

The cache fingerprint includes title, ingredient quantities, instructions,
servings and analysis version. Stale results are not served. Credit-only changes
do not invalidate nutrition. Reads never call AI or perform writes.

Saved reads are enabled only in the explicitly curated development preview.
Production configuration cannot enable this reader. Custom storage adapters
must provide their own nutrition reader. There is no new public paid-AI or
nutrition-write endpoint; the existing AI protection remains unchanged.

## Operator workflow

`nutrition:analyze:development` requires the explicitly curated development
configuration and independently verified database identity and recipe count.
It does not create tables or modify source recipes.

- `--expected-system-id <verified-id> --expected-recipes <verified-count>`
  are required; a mismatch stops before analysis or writes.
- Without `--apply`, it only reports cached/pending counts.
- `--export-inputs generated-artifacts/nutrition-inputs.json` exports bounded
  source inputs and their fingerprints.
- `--apply --allow-paid-ai` can analyze missing/stale entries with the configured
  application OpenAI account. At most twenty sequential requests; 45-second
  timeout per request, no automatic retries.
- `--apply --import-ai-results generated-artifacts/nutrition-ai-estimates.json`
  imports externally AI-analyzed, locally validated results. All twenty IDs and
  fingerprints must match the current inputs before any import writes.
- `--limit 1` limits an initial paid analysis to one recipe.
- An unchanged repeat run found all twenty current: **zero paid requests and
  zero writes**.

Original source-row digests are checked before each save and after processing.
Provider failures are logged only as sanitized status information, not key
fragments, request bodies or private provider error text.

New or changed recipes require explicit reanalysis; no background billing or
page-load-triggered analysis was introduced.

## Verification

- `npm run validate` includes offline nutrition tests: serving/range/item yield
  calculations, sugar/fiber bounds, stale/missing/invalid cache, unavailable
  storage and parameterized reads.
- `npm run build`.
- `test:curated-development-browser` checks real saved values for all six
  nutrients on all twenty cards and twenty full-recipe pages, including ranges,
  per-item yields, original metadata, grouping, protected content and mobile
  navigation.
- `test:meals-timing-browser` covers selections, calendar/tray/sidebar metadata,
  time preferences, saved-state preservation and 320/390px Russian/Hebrew views.

No production database operations or publishing were performed.
