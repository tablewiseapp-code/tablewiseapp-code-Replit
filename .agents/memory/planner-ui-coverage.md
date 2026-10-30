---
name: Planner UI coverage
description: Meals is the canonical home; recipe navigation must cover its active card and planning placements.
---

Use `/meals` as the main planning screen. `/` and the retired `/plan` redirect
there; do not reintroduce the Three dinners page as the home screen.

**Why:** The user explicitly requested making `/meals` the main screen and
removing `/plan`.

**How to apply:** Keep desktop/mobile navigation and recipe/grocery return
links directed at `/meals`. Do not delete or automatically migrate saved data
when retiring a screen.

Provide **See full recipe** navigation from available and selected dishes,
trays and calendar placements on the active meals screen.

**Why:** The user reported the button missing in production after it had been
implemented only in the advanced planner. A working advanced-only control did
not satisfy the entry-page workflow.

**How to apply:** For recipe navigation changes, check the main `/meals` entry
flow and its alternate planning placements; ensure opening a recipe preserves
saved choices.

Keep the recipe library and existing recipe tools available alongside the
current meals workflow; retiring `/plan` is not permission to remove those
destinations or their data.

**Why:** The user explicitly requires the legacy reference to remain available.

**How to apply:** Preserve separate destinations for the meals planner and
legacy recipe library when changing shared recipe-detail navigation.
