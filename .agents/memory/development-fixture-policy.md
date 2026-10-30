---
name: Development fixture authorization
description: Owner-approved synthetic recipe import boundaries and explicit rebuild authorization.
---

The owner approved adding the supplied 100 synthetic recipes to the current
working development preview, not a substitute catalog or production. They
subsequently authorized rebuilding the unavailable importer with the existing
safeguards instead of requiring recovery.

**Why:** The owner wants to test the expanded preview with their supplied recipe
list. This is development test data, not a reversal of the requirement for real,
source-checked recipes when evaluating the MVP.

**How to apply:** Preserve supplied text and unrelated records, keep missing
metadata unknown, and distinguish synthetic provenance from chef authorship or
source verification. Prove development isolation before application writes.
Rehearsals do not constitute the main import, and main apply must follow code
integration; never use an automatic import hook to bridge task isolation.

The current development catalog must show only 20 recipes, each with portions,
preparation time and tools. The owner chose to hide the other recipes and keep
them stored, not delete them.

**Why:** The user said all remaining development recipes must include these
fields and explicitly selected hiding over deletion.

**How to apply:** Keep the full pinned imported dataset unchanged. Use the
development-only curated presentation for the visible subset; clearly label
synthetic portion/time/tool values as development estimates, not source-verified
facts. Apply the same metadata in both planners and detail views.

Do not present fixed fixture estimates as editable persisted data.

**Why:** Edits would alter the pinned original but disappear behind the
estimate on reload; clearing mandatory timings could also make the complete
catalog unavailable.

**How to apply:** A curated read-only presentation must block selected-record
ingredient, instruction, timing and deletion mutations in the API as well as
the page. The owner separately approved saved Chef / Mine credit metadata in
development; that bounded exception must not rewrite recipe contents or
timestamps. Re-enable other editing only with a consistent, tested write model
that preserves required metadata.
