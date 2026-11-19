# TableWise — Architecture

> Source of truth for how the system is built. Product meaning and vocabulary live in [docs/PRODUCT.md](docs/PRODUCT.md).
> Last reviewed: 2026-11-18. Feature-level detail lives in the other files under `docs/`.

## System in one paragraph

One Node.js process serves both a REST API and a React single-page app on port 5000. Data lives in Postgres 16 through Drizzle ORM. A visitor's private data belongs to an **owner**: an anonymous cookie for a guest, or the owner kept by an email and password **account**. A single **operator** token unlocks admin actions. All AI calls go to OpenAI and are gated by environment flags.

## Stack

| Layer | Choice |
|---|---|
| Client | React 19, Vite 7, Tailwind 4, shadcn/Radix UI, wouter (routing), TanStack Query (server state) |
| Server | Express 4, TypeScript, ESM |
| Data | Postgres 16, Drizzle ORM, Zod validation |
| AI | OpenAI SDK |
| Build | `script/build.ts`: Vite for the client, esbuild for the server → `dist/index.cjs` |
| Local | `compose.yaml`: `postgres:16` seeded from `db/init/tablewise.sql.gz`, plus a `node:20` app container |
| Production | Replit deployment (Cloud Run target) built from `main`; see `.replit` |

## Layout

```
client/src/
  App.tsx              routes
  pages/               one file per route
  components/          feature components; components/ui is shadcn; components/layout/app-nav.tsx is the only nav
  hooks/               React hooks
  lib/                 pure logic (filters, grocery engine, i18n, storage, copy dictionaries)
server/
  index.ts             entry point
  routes.ts            every API route
  security.ts          operator sessions, owner cookie, access gates, rate limits, AI budget
  storage.ts           data access (Drizzle)
  request-schemas.ts   Zod schemas for request bodies
  accounts.ts          sign in, sign out, sessions; sets the request's owner for a signed-in account
  recipe-*.ts, cooking-history.ts, grocery-extras.ts, home-tasks.ts, week-plans.ts, shared-grocery.ts, pilot-analytics.ts   feature logic
shared/                types and schemas used by both sides; schema.ts is the database schema
migrations/            reviewed SQL, applied by hand
db/init/               seed dump for the local Docker database
script/                build, seed, import and all test-* scripts
docs/                  product definition and per-feature notes
```

## Routes

| Route | Page | Purpose |
|---|---|---|
| (first visit) | `pages/sign-in.tsx` | shown in place of any page until the person signs in or picks "Continue as guest" (remembered in `localStorage` `tablewise_guest_v1`); never on `/shared/:token` |
| `/` | `pages/home.tsx` | Home: today's meals and collapsed Home Tasks |
| `/plan` | redirect | → `/meals` |
| `/home-tasks` | `pages/home-tasks.tsx` | Home Tasks |
| `/meals` | `pages/weekly-meals.tsx` | plan the week |
| `/recipes` | `pages/recipe-list.tsx` | catalog grid |
| `/recipe/:id` | `pages/recipe-detail.tsx` | recipe, cooking mode, cooking history |
| `/import` | `pages/import-recipe.tsx` | typed or dictated recipe (signed-in accounts; guests see it with saving disabled) |
| `/my-ideas` | `pages/my-ideas.tsx` | AI recipe ideas |
| `/grocery-list` | `components/grocery-list/grocery-list-screen.tsx` | grocery list; `?add` opens the add-item form |
| `/shared/:token` | `pages/shared-grocery.tsx` | a grocery list opened from a share link |
| `/settings` | `pages/basic-settings.tsx` | Basic Settings |
| `/operator` | server-rendered in `server/security.ts` | operator sign-in |

## Data

Tables are defined in `shared/schema.ts`.

| Table | Purpose | Scope |
|---|---|---|
| `recipes` | catalog; `ingredient_parts` holds parsed quantity/unit per ingredient line for manually imported recipes (NULL for older ones); `step_ingredients` holds one list per step of the ingredient lines that step uses (`[]` = none, NULL = no data; dropped when steps change without it) | global, shared by all visitors |
| `recipe_nutrition` | cached nutrition | global |
| `recipe_generations` | AI drafts and their status | per owner |
| `cooking_sessions` | "I made it", rating, notes | per owner |
| `cooking_photos` | JPEG and thumbnail as `bytea` | per owner |
| `household_products` | seeded household product suggestions, translated names and aliases | global |
| `grocery_extras` | products a person added by hand, with an optional category and resized JPEG reference photo | per owner |
| `grocery_item_photos` | reference pictures on any grocery row, including recipe ingredients; a null image hides a legacy extra picture | per owner |
| `grocery_shopping_items` | grocery item exclusions and quantity-specific CAD price estimates | per owner |
| `grocery_notes` | a note on an item of the owner's own grocery list | per owner |
| `shared_grocery_lists` | a share link: a saved copy of a grocery list, its token and role; deleted after 30 days | per owner, readable by link |
| `shared_grocery_items` | the items of a shared copy (text, ticked, note) | per shared list |
| `recipe_sources` | where an imported recipe came from (YouTube link, video id, status `mock` until real extraction exists); one per recipe, one per owner and video | per owner (operator-only writes, like recipes) |
| `home_tasks` | Home tasks: name, due date (calendar date), priority, optional resized JPEG photo, completed and created times; id is client-generated so Undo after Delete restores the same task | per owner |
| `household_tasks` | seeded suggested task names in three languages | global |
| `week_plans` | the Week: shortlisted recipe ids, slot assignments and the lock; one row per owner, replaced whole on each save (`GET`/`PUT /api/week-plan`) | per owner |
| `recipe_marks` | recipes an owner liked or imported (`kind` `liked` or `imported`); `GET /api/my-recipes`, `PUT`/`DELETE /api/recipe-likes/:id` | per owner |
| `accounts` | email (lowercase, unique), scrypt `password_hash` (nullable, for a future Google-only account), the `owner_id` every owner-scoped table uses, optional `display_name` and `photo` (resized JPEG data URL) with a `photo_version` for its cacheable link | per account |
| `account_sessions` | SHA-256 of a session cookie, its account and expiry (30 days) | per account |
| `pilot_events` | funnel events | per anonymous pilot ID |
| `users` | unused leftover | — |

The Week is stored in `week_plans`. The browser keeps a synchronous copy in `localStorage` (`weeklyMealsState`, `week_locked_v1`): `App.tsx` loads the server copy before rendering pages (a browser plan with no server copy is uploaded once), and every change is written through by `pushWeekPlan` in `client/src/lib/meal-plan.ts`. Browser `localStorage` alone still holds grocery progress (including recorded purchase quantities), My Ideas, Basic Settings and planner filter state. This is legacy, not a pattern to copy.

## Identity and access

- **Owner:** random `tablewise_owner` HttpOnly cookie, one year. Only its SHA-256 is stored. Read it through the helpers in `server/security.ts`; never trust an owner ID from the request body.
- **Account:** `POST /api/auth/sign-in` (same-origin, budgeted, 10 attempts per email per 15 minutes) finds the account by email or, for a new email, creates it with the guest's owner and drops the guest cookie. It sets a `tablewise_session` HttpOnly cookie; only its SHA-256 is stored. Middleware in `server/accounts.ts` puts the session's owner in `res.locals.accountOwner`, and `owner()` prefers it over the guest cookie, so feature routes need no change. `POST /api/auth/sign-out` ends that session; `GET /api/auth/me` returns the email (null for a guest), name and a versioned photo link (`GET /api/auth/photo?v=N`). `PUT /api/auth/profile` (same-origin, budgeted; a guest gets 401) changes the name or photo. On sign-in and sign-out the client drops the Week's browser copy and reloads.
- **Google sign-in (not built):** add a `google_sub` column and two routes, one redirecting to Google and one callback that verifies the ID token, finds or creates the account by verified email, then starts a session the same way. The callback is a cross-site redirect, so the session cookie would need `SameSite=Lax`.
- **Operator:** shared token in `TABLEWISE_OPERATOR_TOKEN`. Sessions are in memory, last one hour, and are lost on restart.
- **Anyone may:** read the catalog, plan, use groceries and cooking mode, record their own cooking history, keep their own Home tasks (`PUT`/`DELETE /api/home-tasks/:id`, same-origin) and Week plan (`PUT /api/week-plan`, same-origin), and like a recipe (`PUT`/`DELETE /api/recipe-likes/:id`, same-origin).
- **Signed-in account (or operator) only:** save a typed or pasted recipe (`POST /api/import-recipe`, same-origin, 10 a minute and 200 a day across all visitors; a guest gets 401). The import is recorded in `recipe_marks` for "Imported by me".
- **Share link:** a grocery share link carries a role, `view` < `add` (tick, add items, notes) < `edit` (change and remove items). The owner who made it can also change the role and turn the link off. `server/routes.ts` checks the role on every request (`shared/grocery-access.ts`).
- **Operator only:** YouTube import, edit and delete recipes; read the analytics summary.

## Environment flags

Names only. Never print or commit values. Production secrets are set in the Replit deployment, separately from `.env.local`, and need a redeploy to take effect.

| Variable | Effect |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `TABLEWISE_OPERATOR_TOKEN` | enables operator sign-in |
| `TABLEWISE_PUBLIC_CATALOG_REVIEWED` | when not `true`, catalog reads return 503 |
| `TABLEWISE_AI_ENABLED` | when not `true`, AI routes return 503 |
| `TABLEWISE_PUBLIC_AI` | when `true`, anonymous visitors may use AI generation |
| `OPENAI_API_KEY` | OpenAI key |
| `TABLEWISE_RECIPE_MODEL` | overrides the recipe generation model |
| `TABLEWISE_ANALYTICS_ENABLED` | enables pilot event collection |
| `TABLEWISE_DEV_CURATED_CATALOG` | development catalog fixtures |

## AI

Every call goes through `getAI` in `server/routes.ts`. Uses: recipe generation (`server/recipe-generation.ts`), voice transcription and transcript-to-recipe (`server/routes.ts`), step timing (`server/recipe-analysis.ts`). Personalisation is rule-based and makes no AI call.

Spend is capped in `server/security.ts` (a global budget per minute, hour and day, plus a per-owner daily limit). The counters are in process memory. Any new AI route must go through the same gate and budget.

## Rules for changes

1. **Per-user data goes in Postgres**, scoped by owner. Do not add new `localStorage` stores for user data.
2. **Schema changes need a reviewed migration.** Add `migrations/000N_*.sql` with constraint names that match what drizzle-kit generates, apply it to the local Docker database, then run `sh script/db-dump.sh` to refresh `db/init/tablewise.sql.gz`. Also apply it to the Replit development database (`psql "$DATABASE_URL" -f migrations/000N_*.sql` in the Replit Shell) before publishing: Replit's publish makes the production schema match the development database, so a table or column missing there is dropped from production with its data. If the publish screen lists any DROP under "Development database changes detected", cancel it.
3. **Validate every request body** with a Zod schema in `server/request-schemas.ts`.
4. **Every user-facing string goes through i18n** in English, Russian and Hebrew (`client/src/lib/i18n.tsx` or the feature's `*-copy.ts`). Check right-to-left layout.
5. **Use the design tokens** in `client/src/index.css`. No hardcoded hex colours.
6. **The app must work with AI off.** Hide or disable AI controls rather than letting them fail.
7. **Do not extend legacy code:** `pages/mvp-planner.tsx`, `pages/mvp-grocery.tsx`, `pages/main.tsx`, `server/replit_integrations/`, `client/replit_integrations/`, the `users` table.
8. **Do not add dependencies** for what the standard library, the platform or an installed package already does.

## Running and testing

- **Local:** `docker compose up`. `node_modules` exist only inside the app container, so run commands with `docker compose exec app …`.
- **Type check:** `npm run check`.
- **Full validation:** `npm run validate` (type checks plus the main test suites).
- **Tests:** `script/test-*` files using `node:assert`; browser tests drive headless Chrome. Each has an `npm run test:<name>` script. There is no CI, so run `validate` before merging.
- **Warning:** the app container runs `drizzle-kit push --force` on start. A schema that is out of step with the database can drop columns.

## Known technical limits

- Rate limits, the AI budget and operator sessions are per process and reset on restart.
- The API rate limit is shared across all visitors, not per visitor.
- `GET /api/recipes` returns the whole catalog; there is no pagination. Uploaded recipe photos are replaced in that list by a cacheable link, `/api/recipes/:id/image?v=<hash>`; `GET /api/recipes/:id` still returns the full image.
- The client ships as one bundle with no lazy-loaded routes.
- The server imports `client/src/lib/planner-filters`; shared logic belongs in `shared/`.
- Two migration files are numbered `0004`.
