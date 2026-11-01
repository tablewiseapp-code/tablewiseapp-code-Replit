---
name: Recipe timing semantics
description: Current display is Preparation / Total Time; stored preparation and cooking remain separate durations.
---

Preparation and cooking/oven time remain independent stored durations.
The current user-requested toggle is **Preparation / Total Time**.

**Why:** The user originally chose preparation 10 / oven 50, then explicitly
changed the display labels to “Preparation, Total Time.” This supersedes the
earlier display choice without changing the meaning of the saved stage values.

**How to apply:** Show preparation 10 / total 60 for that example. Derive total
from preparation plus cooking only when both values are known; otherwise show
total as unspecified. Do not overwrite cooking with total or infer missing
preparation by subtraction. Explicit zero is valid.

Interactive step timing is an import-only analysis scope: estimates and
consistency warnings are not source/authorship/food-safety verification.
Never use this work as permission to backfill existing recipes or alter the
pinned synthetic catalog.

**Why:** The user supplied an inconsistent synthetic recipe as a regression
example, explicitly not as permission to correct that saved recipe.

**How to apply:** Exercise mismatches in isolated import drafts; preserve the
supplied title, ingredients and instructions and keep warnings non-destructive.

Additive schema compatibility needs real generated-SQL verification for writes,
not just reads or chain-shaped storage mocks.

**Why:** Drizzle emits omitted insert columns as `DEFAULT`, so adding a nullable
column can still break ordinary creates before the separate migration is applied.

**How to apply:** Keep legacy inserts independent of unapplied columns and test
pre-migration creation against a proven isolated PostgreSQL instance.
