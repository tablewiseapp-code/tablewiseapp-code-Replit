# TableWise — Product Definition

> Source of truth for what the product is. If code or another doc disagrees with this file, raise it; do not silently pick one.
> Last reviewed: 2026-11-15.

## What it is

TableWise is a weekly meal planner for households. A person picks dinners for the week, gets one grocery list, cooks with a step-by-step mode, and keeps a private record of what they made.

It is **not** a recipe social network, a recipe scraper, or a general AI chat.

## Who it is for

A person who plans and cooks for a household: several eaters, allergies and dislikes, a fixed set of kitchen devices, a budget, and limited time on weeknights.

## Stage and hypothesis

- **Stage:** gated pilot. No customer accounts, no payments, no marketing site.
- **Hypothesis under test:** people find the plan → groceries → cook loop valuable enough to come back and plan another week.
- **Measure of success:** `next_week_plan_created` following a `plan_completed` for the same person.

## Core loop

1. **Plan** (`/meals`) — search and filter the catalog, pick 1–12 recipes, or use "Fill my week". Lock the week.
2. **Shop** (`/grocery-list`) — one list built from the locked plan, grouped by category, with pantry items marked. Share or export it. Add household products using translated suggestions or a custom name, with an optional private reference picture. Add, change or remove pictures later on any grocery item, including recipe ingredients.
3. **Cook** (`/recipe/:id`) — scale servings, check off ingredients, run cooking mode with per-step timers.
4. **Remember** (My Cooking Experience on the recipe page) — "I made it", rating, notes, photos.

Supporting features: My Ideas (AI recipe ideas), Import (typed or dictated recipe), My Basic Settings (household, allergies, devices, budget, pantry).

## Vocabulary

Use these words in UI copy, code names and docs. Do not introduce synonyms.

| Term | Meaning |
|---|---|
| **Week** | The plan for one calendar week. The nav label is "Week"; the route is `/meals`. |
| **Catalog** | The shared recipe collection every visitor sees. The UI calls it "Recipes". It is not personal. |
| **Recipe** | A catalog entry: title, ingredients, steps, times, credit, tags. |
| **Credit** | Who a recipe is attributed to (TableWise, a named source, or AI-generated). Always shown. |
| **Idea** | An AI-generated recipe suggestion in My Ideas, before it is saved to the catalog. |
| **Draft** | A server-side AI generation awaiting the person's approve / regenerate decision. |
| **Cooking session** | One "I made it" record, with optional rating, notes and photos. Private to its owner. |
| **Owner** | One anonymous visitor, identified by the `tablewise_owner` cookie. Stands in for a user account. |
| **Operator** | The person running the pilot. Signs in at `/operator` with a shared token. Can import, edit and delete recipes. |
| **Basic Settings** | Household preferences that personalise planning and ideas. |
| **Pilot event** | One of five funnel events: `planner_opened`, `meal_selected`, `plan_completed`, `grocery_list_opened`, `next_week_plan_created`. |
| **MVP planner / MVP grocery** | The earlier three-dinner flow (`mvp-planner.tsx`, `/grocery-list?source=mvp`). Legacy; do not extend. |

## Product principles

1. **Calm.** Minimal interface, generous whitespace, no gamification, no streaks, no decorative animation. The interface should disappear while cooking.
2. **Works without AI.** Planning, groceries and cooking must work fully with AI switched off. AI is an addition, never a dependency.
3. **Honest about content.** Every recipe shows its credit. AI-generated and estimated data are labelled as such.
4. **Private by default.** Cooking history, notes and photos are visible only to their owner.
5. **Plain language.** End users never see operator, developer or infrastructure wording ("operator access", "paid AI", "router").
6. **Three languages equally.** English, Russian and Hebrew (right-to-left). No hardcoded English strings.
7. **Phone first.** 44px touch targets, bottom tab bar, safe-area padding.

## Out of scope for the pilot

Do not build these unless the product owner asks: payments or plans, recipe sharing or public recipe pages, SEO, email or push notifications, social features, scraping recipes from links, native apps.

## Known gaps

These are accepted facts today, not features. Do not build on top of them as if they work.

- **The plan is not dated.** Pilot events from `/meals` and the grocery screen use the calendar week they happen in. A week left locked across two weeks records no return; the person must unlock and lock again.
- **No accounts.** A person's data is tied to one browser cookie and does not move across devices.
- **Plan, Ideas and Basic Settings live in browser storage only.** New per-user data must go in Postgres (see ARCHITECTURE.md).
- **Photo and link import do not parse anything.** A photo is attached as an image; a link is stored as the source URL. Only typed and dictated text is turned into a recipe.
- **Four planner filters have no data source:** "With my notes", "Modified by me", "My picks", "Minimum rating".
- **Anonymous visitors can add AI-generated recipes to the shared catalog** without review when public AI is on.
- **Catalog recipes have no images**, and only a few have nutrition data.
- **README.md and replit.md describe an older product** ("recipe manager from photos, links and voice", "Recipe View"). This file supersedes them.

## Decisions waiting for the product owner

- Final one-line positioning and the public name shown in the page title and social preview.
- Whether AI-generated recipes stay in the shared catalog or become private to their owner.
- When to add accounts, and by which sign-in method.
