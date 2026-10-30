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
