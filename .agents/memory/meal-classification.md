---
name: Meal classification boundaries
description: Editorial classification and unchanged three-meal planning scope.
---

Use only explicit reviewed tags for meal types and lunchbox suitability in the
default planner. Do not infer categories from titles or default unknown recipes
to dinner. A recipe may belong to several meal types. School lunchbox is an
editorial suitability label, not an allergen, school-policy, or storage guarantee.

**Why:** The user explicitly chose all meal types within the existing
three-recipe workflow, with honest unknown categories rather than fabricated
recipes or inferred metadata.

**How to apply:** Keep category review/proposals separate from database writes.
Adding filters does not authorize metadata writes, new recipe sourcing, changes
to plan documents, or a breakfast/lunch/dinner calendar.
