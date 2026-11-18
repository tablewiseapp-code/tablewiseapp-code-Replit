# TableWise — Product Definition

> Source of truth for what the product is. If code or another doc disagrees with this file, raise it; do not silently pick one.
> Last reviewed: 2026-11-18.

## What it is

TableWise is a weekly meal planner for households. A person picks dinners for the week, gets one grocery list, cooks with a step-by-step mode, and keeps a private record of what they made. Home Tasks, a short private to-do list for the house, sits beside the meal loop (added by the product owner, 2026-11-17).

It is **not** a recipe social network, a recipe scraper, or a general AI chat.

## Who it is for

A person who plans and cooks for a household: several eaters, allergies and dislikes, a fixed set of kitchen devices, a budget, and limited time on weeknights.

## Stage and hypothesis

- **Stage:** gated pilot. Optional email and password accounts (guests need none), no payments, no marketing site.
- **Hypothesis under test:** people find the plan → groceries → cook loop valuable enough to come back and plan another week.
- **Measure of success:** `next_week_plan_created` following a `plan_completed` for the same person.

## Core loop

1. **Plan** (`/meals`) — search and filter the catalog, pick 1–12 recipes, or use "Fill my week". Lock the week.
2. **Shop** (`/grocery-list`) — one list built from the locked plan, grouped by category, with pantry items marked. Share or export it. Add household products using translated suggestions or a custom name, with an optional private reference picture. Add products individually or paste a list, review estimated category costs, and record full or partial purchases. Removing a main protein can also remove its meal from the Week. Check the impact before confirming and use Undo to restore removed meals. Purchased quantities stay available under Checked items.
3. **Cook** (`/recipe/:id`) — scale servings, check off ingredients, run cooking mode with per-step timers. Start cooking opens Zen mode at step 1 by default. In Zen mode, the ingredients the current step uses (with that step's quantities) are listed above its instruction, and they change with Next and Back. A step that uses none shows no ingredient section. A recipe without step-level ingredient data shows "View recipe ingredients" (the full list) instead; ingredients are never guessed (product owner, 2026-11-18).
4. **Remember** (My Cooking Experience on the recipe page) — "I made it", rating, notes, photos.

**Home** (`/`) is the landing page: today's meals from the Week and how many grocery items are left, with links into each step. On a phone, Today's meals, a Tasks preview and the bottom tabs fit on one screen. The preview shows only the task rows that fit, with "View all tasks" when more exist. With enlarged text, Home scrolls instead (product owner, 2026-11-18).

**Sign in** (first visit, at any page except a share link): email and password, or "Continue as guest". There is no separate sign-up: the first sign-in with a new email creates the account with the password typed, and the guest's data becomes the account's. Basic Settings shows who is signed in, with Sign out (product owner, 2026-11-18). A signed-in account can add an optional name and photo there; the photo (or the first letter of the name or email) replaces the Settings icon in the header (2026-11-18).

Supporting features: My Ideas (AI recipe ideas), Import (typed or dictated recipe), My Basic Settings (household, allergies, devices, budget, pantry).

**Home Tasks** (`/home-tasks`, previewed on Home at `/`): add a household task by name in seconds, with suggestions from a seeded catalog, an optional due date, a priority (High, Normal, Low) and one optional photo. Open tasks are grouped Overdue, Today, Upcoming, Anytime; completed tasks are collapsed. Complete, Move to tomorrow and Delete all offer Undo. Home shows open tasks in the same order, as many as fit on the screen (changed by the product owner, 2026-11-18). Not in this release: recurring tasks, reminders, assigning to family members, automatic expiry, calendar integration.

## Vocabulary

Use these words in UI copy, code names and docs. Do not introduce synonyms.

| Term | Meaning |
|---|---|
| **Home** | The landing page at `/`. Shows today's meals, the grocery count and the open Home tasks that fit on the screen. Today means today's weekday in the Week, because the plan is not dated. |
| **Home task** | One private household to-do: name, optional due date, priority, optional photo, created and completed times. The nav label is "Home Tasks" ("Tasks" in the phone bottom bar). |
| **Phone bottom bar** | Home, Groceries, Tasks, in that order. Recipes, Week and Ideas are in the phone Menu (product owner, 2026-11-18). |
| **Step ingredients** | The ingredients one cooking step uses, written with that step's quantity ("1 tbsp oil"). Optional recipe data; most recipes have none yet. |
| **Week** | The plan for one calendar week. The nav label is "Week"; the route is `/meals`. |
| **Catalog** | The shared recipe collection every visitor sees. The UI calls it "Recipes". It is not personal. |
| **Liked recipe** | A catalog recipe the person marked with the heart. Private to its owner. On Recipes, "Liked" and "Imported by me" sit above "All recipes" (product owner, 2026-11-18). |
| **Recipe** | A catalog entry: title, ingredients, steps, times, credit, tags. |
| **Credit** | Who a recipe is attributed to (TableWise, a named source, or AI-generated). Always shown. |
| **Idea** | An AI-generated recipe suggestion in My Ideas, before it is saved to the catalog. |
| **Draft** | A server-side AI generation awaiting the person's approve / regenerate decision. |
| **Cooking session** | One "I made it" record, with optional rating, notes and photos. Private to its owner. |
| **Owner** | The scope of one person's private data. A guest's owner comes from the `tablewise_owner` cookie; an account keeps the owner of the guest who created it. |
| **Account** | An email and password that opens the same owner from any browser, with an optional name and photo. UI words: "Sign in", "Sign out" (not "Login", "Register"). |
| **Guest** | A person using TableWise without signing in. Their data is tied to one browser. |
| **Operator** | The person running the pilot. Signs in at `/operator` with a shared token. Can edit and delete recipes and use YouTube import. |
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
7. **Phone first.** 44px touch targets, bottom tab bar (Home, Groceries, Tasks), safe-area padding.

## Out of scope for the pilot

Do not build these unless the product owner asks: payments or plans, recipe sharing or public recipe pages, SEO, email or push notifications, social features, scraping recipes from links, native apps.

## Known gaps

These are accepted facts today, not features. Do not build on top of them as if they work.

- **The plan is not dated.** Pilot events from `/meals` and the grocery screen use the calendar week they happen in. A week left locked across two weeks records no return; the person must unlock and lock again.
- **Accounts are minimal.** Email and password only: no password reset (there is no email), no email verification, no Google sign-in yet. A forgotten password loses the account. Grocery progress, My Ideas and Basic Settings stay in browser storage and do not follow the account. Signing in on a browser that already has guest data leaves that data with the guest; it is not merged. A guest's data is still tied to one browser.
- **Ideas and Basic Settings live in browser storage only.** The Week is stored in Postgres per owner (2026-11-18). New per-user data must go in Postgres (see ARCHITECTURE.md).
- **Photo and link import do not parse anything.** A photo is attached as an image; a link is stored as the source URL. Only typed and dictated text is turned into a recipe.
- **Four planner filters have no data source:** "With my notes", "Modified by me", "My picks", "Minimum rating".
- **Anonymous visitors can add AI-generated recipes to the shared catalog** without review when public AI is on.
- **Any signed-in account can add a typed or pasted recipe to the shared catalog** without review (opened 2026-11-17; guests see the import page with saving disabled and a note to sign in, product owner, 2026-11-18). Only the operator can remove it.
- **"Imported by me" starts on 2026-11-18.** Recipes imported earlier have no recorded importer and appear only under "All recipes".
- **Catalog recipes have no images**, and only a few have nutrition data.
- **No recipe has step ingredients yet.** The data field exists (2026-11-18), but nothing fills it: import and AI generation do not write it, and there is no editor. Until it is filled, Zen mode shows "View recipe ingredients" for every recipe.
- **README.md and replit.md describe an older product** ("recipe manager from photos, links and voice", "Recipe View"). This file supersedes them.

## Decisions waiting for the product owner

- Final one-line positioning and the public name shown in the page title and social preview.
- Whether AI-generated recipes stay in the shared catalog or become private to their owner.
- When to add Google sign-in (email and password was chosen for the pilot, 2026-11-18).
