---
name: Planner UI coverage
description: Recipe navigation must cover the default planner, not only the advanced meals page.
---

Provide **See full recipe** navigation from available and selected dishes in
the default Three dinners planner as well as the advanced planner.

**Why:** The user reported the button missing in production after it had been
implemented only in the advanced planner. A working advanced-only control did
not satisfy the entry-page workflow.

**How to apply:** For recipe navigation changes, check the default planning
entry flow as well as `/meals`; ensure opening a recipe preserves saved choices.
