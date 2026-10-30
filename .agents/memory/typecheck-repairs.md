---
name: Full-project type-check boundaries
description: Optional integration schema boundaries and stale incremental compiler diagnostics.
---

Keep optional AI integration models separate from the active recipe migration
schema when fixing their imports; do not add unrelated schema exports or enable
their routes merely to make type checking pass.

**Why:** The unused chat integration already had its own model. Exporting it
through the recipe schema would expand future migrations without a feature or
schema request.

**How to apply:** Repair direct imports and package API compatibility while
leaving optional routes inactive. Activation needs its own approval and the
existing owner/paid-AI protections.

After changing compiler options, distinguish real diagnostics from obsolete
incremental-cache results.

**Why:** Cached checking continued to report old-target Unicode/Set errors even
though the effective configuration used a modern target; a non-incremental
check passed, and clearing the generated cache restored the ordinary check.

**How to apply:** Inspect the effective compiler configuration and compare one
clean, non-incremental run before rewriting correct application code to satisfy
apparently stale errors.
