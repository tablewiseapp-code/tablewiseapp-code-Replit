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
