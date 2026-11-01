---
name: Nutrition estimates
description: User nutrition requirements, honest yield semantics and AI-analysis provenance.
---

When Nutrition details is enabled, show recipe nutrition near portions/preparation, including sugar. The user
emphasized people who go to gyms or follow diets, and approved analyzing and
saving AI nutrition estimates in development.

**Why:** Explicit user request and approval; production and publishing remain
separate approvals.

**How to apply:** Label results as estimates, preserve original recipe contents,
and show assumptions. Total sugar includes naturally occurring sugar, not just
added sugar. A yield of twelve muffins is not twelve people: label per muffin;
for unknown yields, show explicitly labeled whole-recipe values.

Do not equate one-time AI-assisted development analysis with a validated app
provider integration.

**Why:** Initial application inference returned HTTP 429. The first catalog
estimates were instead produced by a separate ingredient-level AI-assisted run.
Calling those application OpenAI results would misrepresent their provenance.

**How to apply:** Preserve the actual method metadata, keep reads free of paid
inference, and test a working provider before claiming automatic analysis for
new imports. Never replace missing estimates with plausible-looking constants.

Verify frontend nutrition rendering in the running Vite/browser app, not through
an ad hoc CLI server-renderer.

**Why:** CLI JSX transformation in this workspace differed from Vite and failed
on existing components even with an attempted test-config override.

**How to apply:** Use pure calculation/cache tests and real browser UI checks;
do not change unrelated app imports to satisfy an incompatible one-off renderer.
