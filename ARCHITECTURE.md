# TableWise — Architecture

> Source of truth for how the system is built. Product meaning and vocabulary live in [docs/PRODUCT.md](docs/PRODUCT.md).
> Last reviewed: 2026-11-15. Feature-level detail lives in the other files under `docs/`.

## System in one paragraph

One Node.js process serves both a REST API and a React single-page app on port 5000. Data lives in Postgres 16 through Drizzle ORM. There are no user accounts: a visitor is an anonymous **owner** cookie, and a single **operator** token unlocks admin actions. All AI calls go to OpenAI and are gated by environment flags.

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
  recipe-*.ts, cooking-history.ts, grocery-extras.ts, shared-grocery.ts, pilot-analytics.ts   feature logic
shared/                types and schemas used by both sides; schema.ts is the database schema
migrations/            reviewed SQL, applied by hand
db/init/               seed dump for the local Docker database
script/                build, seed, import and all test-* scripts
docs/                  product definition and per-feature notes
```

## Routes

| Route | Page | Purpose |
|---|---|---|
| `/`, `/plan` | redirect | → `/meals` |
| `/meals` | `pages/weekly-meals.tsx` | plan the week |
| `/recipes` | `pages/recipe-list.tsx` | catalog grid |
| `/recipe/:id` | `pages/recipe-detail.tsx` | recipe, cooking mode, cooking history |
| `/import` | `pages/import-recipe.tsx` | typed or dictated recipe (operator) |
| `/my-ideas` | `pages/my-ideas.tsx` | AI recipe ideas |
| `/grocery-list` | `components/grocery-list/grocery-list-screen.tsx` | grocery list |
| `/shared/:token` | `pages/shared-grocery.tsx` | a grocery list opened from a share link |
| `/settings` | `pages/basic-settings.tsx` | Basic Settings |
| `/operator` | server-rendered in `server/security.ts` | operator sign-in |

## Data

Tables are defined in `shared/schema.ts`.

| Table | Purpose | Scope |
|---|---|---|
| `recipes` | catalog | global, shared by all visitors |
| `recipe_nutrition` | cached nutrition | global |
| `recipe_generations` | AI drafts and their status | per owner |
| `cooking_sessions` | "I made it", rating, notes | per owner |
| `cooking_photos` | JPEG and thumbnail as `bytea` | per owner |
| `household_products` | seeded household product suggestions, translated names and aliases | global |
| `grocery_extras` | products a person added by hand, with an optional resized JPEG reference photo | per owner |
| `grocery_notes` | a note on an item of the owner's own grocery list | per owner |
| `shared_grocery_lists` | a share link: a saved copy of a grocery list, its token and role; deleted after 30 days | per owner, readable by link |
| `shared_grocery_items` | the items of a shared copy (text, ticked, note) | per shared list |
| `pilot_events` | funnel events | per anonymous pilot ID |
| `users` | unused leftover | — |

Browser `localStorage` still holds the week plan (`weeklyMealsState`), grocery progress, My Ideas, Basic Settings and filter state. This is legacy, not a pattern to copy.

## Identity and access

- **Owner:** random `tablewise_owner` HttpOnly cookie, one year. Only its SHA-256 is stored. Read it through the helpers in `server/security.ts`; never trust an owner ID from the request body.
- **Operator:** shared token in `TABLEWISE_OPERATOR_TOKEN`. Sessions are in memory, last one hour, and are lost on restart.
- **Anyone may:** read the catalog, plan, use groceries and cooking mode, record their own cooking history.
- **Share link:** a grocery share link carries a role, `view` < `add` (tick, add items, notes) < `edit` (change and remove items). The owner who made it can also change the role and turn the link off. `server/routes.ts` checks the role on every request (`shared/grocery-access.ts`).
- **Operator only:** import, edit and delete recipes; read the analytics summary.

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
2. **Schema changes need a reviewed migration.** Add `migrations/000N_*.sql` with constraint names that match what drizzle-kit generates, apply it to the local Docker database, then run `sh script/db-dump.sh` to refresh `db/init/tablewise.sql.gz`.
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
- `GET /api/recipes` returns the whole catalog; there is no pagination.
- The client ships as one bundle with no lazy-loaded routes.
- The server imports `client/src/lib/planner-filters`; shared logic belongs in `shared/`.
- Two migration files are numbered `0004`.
