# TableWise — Product Definition

> Source of truth for what the product is. If code or another doc disagrees with this file, raise it; do not silently pick one.
> Last reviewed: 2026-11-20.

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

1. **Plan** (`/meals`) — the Week calendar: one dated week (Monday–Sunday) with Breakfast, Lunch and Dinner every day, opened as a complete Suggested week of 21 meals, then approved in one action (product owner, 2026-11-19; see Suggested week below). Previous and next week controls open other weeks. "Browse recipes" (`/meals?browse`) searches and filters the catalog and keeps up to 12 picks. The recipe browser is the only place to set recipe filters: Cooking level, Total time (Any or 15–60 min, ≤30 min by default), Dietary (with More dietary options), Kid favourites, Kitchen tools (your devices and No-cook), Source, and More filters (protein, meal type, must include, must exclude, cuisine, My picks with minimum rating, With my notes, Modified by me; restored by the product owner, 2026-11-19). Food deals above the results shows sample offers by food category; Show recipes filters to recipes using that ingredient (product owner, 2026-11-18). Rules: [docs/week-plan-filters.md](week-plan-filters.md).
2. **Shop** (`/grocery-list`) — one list built from the scheduled meals of the Week, scaled to each meal's servings (a recipe that is only shortlisted, declined or replaced adds nothing; 2026-11-19), grouped by category, with pantry items marked. Share or export it. Add household products using translated suggestions or a custom name, with an optional private reference picture. Add products individually or paste a list, review estimated category costs, and record full or partial purchases. Removing a main protein can also remove its meal from the Week. Check the impact before confirming and use Undo to restore removed meals. Purchased quantities stay available under Checked items. "My stores" opens the store picker (see Your household) with the saved choices (2026-11-20).
3. **Cook** (`/recipe/:id`) — scale servings, check off ingredients, run cooking mode with per-step timers. Start cooking opens Zen mode at step 1 by default. In Zen mode, the ingredients the current step uses (with that step's quantities) are listed above its instruction, and they change with Next and Back. A step that uses none shows no ingredient section. A recipe without step-level ingredient data shows "View recipe ingredients" (the full list) instead; ingredients are never guessed (product owner, 2026-11-18).
4. **Remember** (My Cooking Experience on the recipe page) — "I made it", rating, notes, photos.

**Home** (`/`) is the landing page: Today's meals from the Week and Home Tasks, nothing else. Home Tasks starts collapsed, with the number of open tasks beside its title; opening it lists every open task and "View all tasks". On a phone, Home does not scroll while Home Tasks is collapsed (product owner, 2026-11-19). An empty meal's "+ Add breakfast/lunch/dinner" opens the meal generator (a bottom sheet on a phone, a dialog on desktop; product owner, 2026-11-19): an optional free search ("What would you like for breakfast?"), Time (Any time, ≤ 15 min, ≤ 30 min of total time; unknown time never passes), Cooking style (Quick & easy by default) and the household line (servings, restrictions, budget) with Edit for servings and the four marked diets, for this meal only. "Generate breakfast" shows one catalog recipe labelled "Suggested recipe" with time, servings, scaled ingredients and steps; "Try another", "Edit request" and "Choose from my recipes" (Liked and Imported by me) keep the inputs. Only "Add to breakfast" changes the Week (today's weekday, that meal), then Home shows "Added to breakfast" with Undo, which removes only that assignment and only while the slot still holds it. If the slot was filled meanwhile, the person must choose Replace. Allergies, devices and meal rules always apply through `checkEligibility`; Week → Plan filters are not applied, and a locked Week is not changed. No AI is used (`client/src/lib/meal-generator.ts`).

**Sign in** (first visit, at any page except a share link): email and password, or "Continue as guest". There is no separate sign-up: the first sign-in with a new email creates the account with the password typed, and the guest's data becomes the account's. Basic Settings shows who is signed in, with Sign out (product owner, 2026-11-18). A signed-in account can add an optional name and photo there; the photo (or the first letter of the name or email) replaces the Settings icon in the header (2026-11-18).

**Your household** (`/household`, 2026-11-19): after Sign in or "Continue as guest", a first-time person (no saved settings and an empty Week) answers one screen: cooking style (Quick & easy, Everyday cooking, Chef challenge), servings, dietary requirements (only Vegetarian, Vegan, Gluten-free and Dairy-free, the ones the catalog marks explicitly) and allergies (all ten from Basic Settings; Gluten and Milk also need the catalog mark, the other eight are checked by ingredient wording and unclear wording counts as unsafe; product owner, 2026-11-19); nothing is pre-selected, so the person must pick a diet or allergy or choose "None" explicitly before "Suggest my week", kitchen equipment (required, nothing pre-selected; product owner, 2026-11-19), cooking evenings per week (1–7 or "Not sure yet" = three, or more if more fixed days), and optional fixed evenings. Then a weekday (Mon–Fri) total-time limit for each meal, e.g. 10 minutes for breakfast and 40 for dinner (product owner, 2026-11-19), for Chef challenge when the challenge happens, and the Week → Plan recipe filters: the same panel and the same saved state as the Week page, so a filter chosen on either page shows on the other (product owner, 2026-11-19). In Your household the panel leaves out Dietary and Kitchen tools (already asked above), puts Meal type first and shows Cuisine up front as optional. Suggestions, swaps and replacements apply those filters after the restrictions. Every question is a collapsible group whose header shows its answer in small text; choosing something in a group collapses the groups above it. Quick & easy starts with the weekday limits and filters collapsed, Everyday cooking with the filters collapsed, Chef challenge with everything open. "Suggest my week" fills the cooking evenings with catalog dinners (no AI) and opens the Week, where the Suggested week fills the other meals; "Skip for now" goes Home. Returning people and anyone with a Week skip it; it stays reachable from the Week and from the TableWise name in the header (product owner, 2026-11-19). A locked (approved) Week is never changed by it.

**Store picker** ("Where do you buy your groceries?", 2026-11-20): the last section of Your household and Groceries → "My stores". One row per store: its logo, its name and two independent toggles, Delivery and Walk-in. A tap saves at once; turning off a store's last method removes it. The interface language picks five suggested stores (English and Russian: Walmart, Real Canadian Superstore, No Frills, Safeway, FreshCo; Hebrew: שופרסל, רמי לוי, יוחננוף, ויקטורי, אושר עד); saved stores outside those five stay listed below them. "+ Add another store" takes a name and at least one method; the same name in another capitalization or spacing (or a suggested store's name) reuses that entry. Optional: Your household continues with no store. Any number of stores may be saved; the planned limit of one walk-in shop and two deliveries applies only to a future shopping plan, which is not built.

**Suggested week** (`/meals`, "Weekly meals", 2026-11-19): the first time a week is opened unapproved, every empty slot of the 21 gets the best eligible catalog recipe of that meal (no AI), at the household's servings. It prefers a recipe not yet in the week; one repeats only when the eligible ones run out. Restrictions are never relaxed. The Week → Plan filters narrow the choice, except Meal type (the slot decides it); a slot no recipe passes the filters for falls back to the restrictions alone. A slot with no eligible recipe stays empty with "No eligible recipe" and "Choose recipe", and the header counts the meals still needed. The proposal is made once per week: reloads, other pages and other weeks keep it and every edit; an existing partial draft keeps its meals and only its gaps are filled; an approved week is shown exactly as saved. Desktop shows seven day columns with Breakfast, Lunch and Dinner rows; a phone shows a vertical agenda, one day after another. Each card shows the recipe name (opens the recipe; Back returns to the same week), time per the recipe display setting, planned servings and "Swap". Swap opens a picker of eligible alternatives with a name search and replaces only that slot; Cancel keeps the recipe. The card menu has "Change servings" and "Move meal"; moving onto a filled slot trades the two meals. Dragging a card does the same on desktop (long press on touch). No edit regenerates the rest of the week. "Approve week" (enabled only when all 21 meals are filled) locks exactly what is shown; the header then says "Approved", "Create grocery list" is the primary action and "Edit week" unlocks. Groceries use the approved meals and their servings. Fill my week, Finalize week and the separate dinner panel are gone (product owner, 2026-11-19). Home → Today's meals → "Suggest a recipe" shows one eligible dinner for today with "Start cooking" (Zen mode) and "Suggest another"; it changes neither the Week nor Groceries. Every suggestion, swap, replacement and Home pick uses one rule, `checkEligibility` in `client/src/lib/preference-engine.ts`.

Supporting features: My Ideas (AI recipe ideas), Import (typed or dictated recipe), My Basic Settings (household, allergies, devices, budget, pantry, Recipe View).

**Recipe View** (Settings, 2026-11-19): Show nutrition (Off by default); Nutrition per serving (Calories, Protein, Carbs, Fat, Sugars, Fiber, Sodium; Protein and Carbs by default), shown while nutrition is on and kept while it is off; Extra recipe details (Prep time, Cook time, Dietary tags, Main cooking tool; all off). A preview with a complete sample recipe updates on every change. One preference, saved with Basic Settings, applies to every recipe card: Home, Recipes, My Ideas, Week → Plan results, the Week's selected recipes and suggested dinners, and Home's suggestion; the full recipe page adds the nutrition line (it always shows times, tools and tags). Week → Plan's "Show nutrition" switch is the same setting. A card shows name, optional thumbnail, total time and servings, then the selected nutrition on one line ("Est. per serving · Protein 32 g · Carbs 45 g"), then the selected details; a row with nothing to show is left out. Units: kcal, mg for sodium, g otherwise. Dietary tags are no longer shown on cards unless chosen here.

**Home Tasks** (`/home-tasks`, previewed on Home at `/`): add a household task by name in seconds, with suggestions from a seeded catalog, an optional due date, a priority (High, Normal, Low) and one optional photo. Open tasks are grouped Overdue, Today, Upcoming, Anytime; completed tasks are collapsed. Complete, Move to tomorrow and Delete all offer Undo. Home shows the open-task count and, when opened, the open tasks in the same order (changed by the product owner, 2026-11-19). Not in this release: recurring tasks, reminders, assigning to family members, automatic expiry, calendar integration.

## Vocabulary

Use these words in UI copy, code names and docs. Do not introduce synonyms.

| Term | Meaning |
|---|---|
| **Home** | The landing page at `/`. Shows today's meals and a collapsed Home Tasks section with the open-task count. Today means today's weekday in the Week, because the plan is not dated. |
| **Home task** | One private household to-do: name, optional due date, priority, optional photo, created and completed times. The nav label is "Home Tasks" ("Tasks" in the phone bottom bar). |
| **Phone bottom bar** | Home, Groceries, Tasks, in that order. Recipes, Week and Ideas are in the phone Menu (product owner, 2026-11-18). |
| **Step ingredients** | The ingredients one cooking step uses, written with that step's quantity ("1 tbsp oil"). Optional recipe data; most recipes have none yet. |
| **Week** | The plan for one calendar week, Monday to Sunday: 21 slots (Breakfast, Lunch, Dinner × 7 days). The nav label is "Week", the page title "Weekly meals"; the route is `/meals` (`?week=` names another week by its Monday). |
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
| **Recipe View** | The Settings section that chooses which nutrition values and extra details recipe cards show. Part of Basic Settings. (Not the older README's name for the recipe page.) |
| **Basic Settings** | Household preferences that personalise planning and ideas. Stored per owner on the server (2026-11-19). |
| **Your household** | The first-visit questions at `/household` that produce a suggested week. Its answers are part of Basic Settings. |
| **Cooking style** | Quick & easy, Everyday cooking or Chef challenge. Changes the order of suggestions, never what is allowed. |
| **Suggested week** | The complete proposal placed once on an unapproved Week (21 meals; Your household's "Suggest my week" places its dinners first). "Swap", "Change servings" and "Move meal" change one slot; "Approve week" locks it; "Edit week" unlocks. |
| **Weekday limit** | A total-time limit per meal (Breakfast, Lunch, Dinner) on Mon–Fri from Your household; the chosen chef challenge evening's dinner is exempt. Applies to suggestions and the Home pickers. Unknown time never passes it. |
| **Pilot event** | One of five funnel events: `planner_opened`, `meal_selected`, `plan_completed`, `grocery_list_opened`, `next_week_plan_created`. |
| **My stores** | The stores a person buys groceries at, each with Delivery, Walk-in or both. Part of Basic Settings. Chosen in the store picker (Your household, Groceries). |
| **Food deals** | Offers shown above the results on Week → Plan, grouped by food category. Today they are hardcoded and labelled "Sample deals". |
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

- **Weeks are dated, grocery progress is not.** Each week is its own plan (2026-11-19); plans saved earlier became the week the change shipped in. Checked grocery items and purchases are kept per browser, not per week. The grocery screen's own pilot event still uses the calendar week it happens in.
- **Accounts are minimal.** Email and password only: no password reset (there is no email), no email verification, no Google sign-in yet. A forgotten password loses the account. Grocery progress and My Ideas stay in browser storage and do not follow the account; Basic Settings do (2026-11-19). Signing in on a browser that already has guest data leaves that data with the guest; it is not merged. A guest's data is still tied to one browser.
- **Ideas live in browser storage only.** The Week (2026-11-18; per owner and week since 2026-11-19) and Basic Settings (2026-11-19) are stored in Postgres per owner. New per-user data must go in Postgres (see ARCHITECTURE.md).
- **Photo and link import do not parse anything.** A photo is attached as an image; a link is stored as the source URL. Only typed and dictated text is turned into a recipe.
- **Several Week → Plan filters have no catalog data yet** and match nothing until recipes are tagged: Cooking level, Keto, Paleo, Low-sodium, Low added sugar, Egg-free, Peanut-free, Tree-nut-free, Soy-free, Kosher, Halal. High-protein, Low-carb, Lower-calorie and High-fibre match only the few recipes with nutrition data. The earlier filters were restored on 2026-11-19, but four have no data and always show no recipes: My picks and Minimum rating (nothing records a pick or rating any more; the heart is "Liked"), With my notes and Modified by me (never recorded). Source "Trusted authors" and "Personal" also match nothing; only "My recipes" and "Imported" do.
- **Recipe View nutrition is thin.** Only recipes with an AI nutrition estimate and a single serving count (not a range such as "4–6" or a yield such as "12 muffins") show values, always labelled "Est. per serving". Sodium is never analysed, so it shows nowhere except the Settings preview. Nothing stores per-serving values yet.
- **The store catalog is mock data.** Ten stores with bundled logos (`client/src/lib/grocery-stores.ts`, `client/public/store-logos/`, from Wikimedia); the language, not the person's location, picks the suggestions. Stores are saved but nothing uses them yet: no promotions, prices or shopping plan.
- **Food deals are sample data.** There is no deals source; added categories last for the visit only.
- **Anonymous visitors can add AI-generated recipes to the shared catalog** without review when public AI is on.
- **Any signed-in account can add a typed or pasted recipe to the shared catalog** without review (opened 2026-11-17; guests see the import page with saving disabled and a note to sign in, product owner, 2026-11-18). Only the operator can remove it.
- **"Imported by me" starts on 2026-11-18.** Recipes imported earlier have no recorded importer and appear only under "All recipes".
- **Catalog recipes have no images**, and only a few have nutrition data.
- **No recipe has step ingredients yet.** The data field exists (2026-11-18), but nothing fills it: import and AI generation do not write it, and there is no editor. Until it is filled, Zen mode shows "View recipe ingredients" for every recipe.
- **Suggestions rely on thin catalog data.** Only Vegetarian, Vegan, Gluten-free and Dairy-free are explicit catalog tags; a strict diet or the Gluten or Milk allergy needs that tag and clean ingredient wording, so untagged recipes (imports, AI recipes) are never suggested to those households. Other allergies (eggs, nuts, soy, fish, shellfish, sesame, mustard) rely on ingredient wording only; Your household offers them with that caveat. There is no difficulty data: "how involved" is estimated from steps, ingredient lines and total time, for ranking only. Not built for lack of data: hands-on time, technique, pantry use, familiar-versus-new, cooking extra portions. With a strict restriction the catalog has few dinners (about 6 vegan, 38–46 dairy- or gluten-free).
- **Sign in has no separate "Create account" button.** The request for Create account / Sign in / Continue as guest is met by the existing screen: the first sign-in with a new email creates the account.
- **The meal generator only searches the catalog.** Free search matches English words in recipe titles, ingredients and tags; other words (and other languages) find nothing and say so. It never calls AI or creates a recipe. It does not show nutrition.
- **README.md and replit.md describe an older product** ("recipe manager from photos, links and voice", "Recipe View"). This file supersedes them.

## Decisions waiting for the product owner

- Final one-line positioning and the public name shown in the page title and social preview.
- Whether AI-generated recipes stay in the shared catalog or become private to their owner.
- When to add Google sign-in (email and password was chosen for the pilot, 2026-11-18).
