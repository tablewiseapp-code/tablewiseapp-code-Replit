# TableWise — Architecture Document

> Senior Architect Reference | Last updated: March 2026

---

## 1. System Overview

TableWise is a full-stack recipe management and weekly meal planning application. It runs as a monolithic Node.js server that serves both a REST API and a React single-page application from a single process and port.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React SPA (Vite / Tailwind)              │  │
│  │                                                       │  │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐   │  │
│  │  │  Wouter  │  │ TanStack │  │  localStorage       │   │  │
│  │  │ (routes) │  │  Query   │  │  (UI state, i18n,   │   │  │
│  │  │         │  │ (server  │  │   meal plan, user   │   │  │
│  │  │         │  │  state)  │  │   meta)             │   │  │
│  │  └─────────┘  └────┬─────┘  └────────────────────┘   │  │
│  │                     │                                  │  │
│  └─────────────────────┼──────────────────────────────────┘  │
│                        │  fetch("/api/...")                   │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express Server (:5000)                     │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │   REST API        │  │  Static / Vite   │                │
│  │   /api/*          │  │  (SPA serving)   │                │
│  └────────┬─────────┘  └──────────────────┘                 │
│           │                                                  │
│  ┌────────▼─────────┐  ┌──────────────────┐                 │
│  │  Storage Layer    │  │   OpenAI SDK     │                │
│  │  (Drizzle ORM)    │  │  (Whisper +      │                │
│  │                   │  │   GPT-4o)        │                │
│  └────────┬─────────┘  └──────────────────┘                 │
│           │                                                  │
└───────────┼──────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────┐
│    PostgreSQL        │
│    (DATABASE_URL)    │
│                      │
│  ┌───────────────┐   │
│  │  users         │   │
│  │  recipes       │   │
│  └───────────────┘   │
└─────────────────────┘
```

### Key architectural decisions

| Decision | Rationale |
|----------|-----------|
| Single-process server (API + SPA) | Simplicity; one port, no CORS, Replit-friendly |
| PostgreSQL via Drizzle ORM | Type-safe queries, simple migrations with `drizzle-kit push` |
| localStorage for UI state | Meal plan, user meta (ratings, picks) stay client-side; no auth required |
| OpenAI for voice import | Whisper transcription + GPT-4o structured parsing in a two-step pipeline |
| Tailwind CSS v4 | Utility-first, minimal custom CSS, consistent design tokens |
| No authentication | Single-user app; `users` table exists but is unused |

---

## 2. Technology Stack

### Backend
| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | — |
| Framework | Express | 4.x |
| Language | TypeScript (ESM) | 5.6.3 |
| ORM | Drizzle ORM | 0.39.x |
| Database | PostgreSQL | — |
| AI | OpenAI SDK | 6.x |
| Dev runner | tsx | 4.x |
| Prod bundler | esbuild | 0.25.x |

### Frontend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 19.x |
| Build tool | Vite | 7.x |
| Routing | Wouter | 3.x |
| Server state | TanStack React Query | 5.x |
| UI primitives | Radix UI + shadcn/ui | — |
| Styling | Tailwind CSS | 4.x |
| Drag & drop | @dnd-kit/core | 6.x |
| Icons | Lucide React | — |
| Validation | Zod | 3.x |

---

## 3. Project Structure

```
/
├── client/                      # React frontend
│   ├── index.html               # Entry HTML (meta tags, SPA root)
│   └── src/
│       ├── main.tsx             # React DOM render entry
│       ├── App.tsx              # Root component: providers, nav, router
│       ├── pages/               # Route-level page components
│       │   ├── main.tsx         # /           Landing page
│       │   ├── recipe-view.tsx  # /recipe-view  Redirect to first recipe
│       │   ├── recipe-list.tsx  # /recipes      Grid of all saved recipes
│       │   ├── recipe-detail.tsx# /recipe/:id   Single recipe view
│       │   ├── weekly-meals.tsx # /meals        Meal planner (1485 lines)
│       │   ├── import-recipe.tsx# /import       Manual + voice recipe import
│       │   ├── grocery-list.tsx # /grocery-list  Shopping list from plan
│       │   └── not-found.tsx    # *             404 page
│       ├── components/
│       │   ├── layout/          # App shell components
│       │   │   ├── app-header.tsx
│       │   │   ├── page-container.tsx
│       │   │   └── mobile-nav-sheet.tsx
│       │   └── ui/              # ~50 shadcn/ui components
│       ├── hooks/
│       │   ├── use-local-storage-state.ts
│       │   └── use-recipe-user-meta.ts
│       └── lib/
│           ├── queryClient.ts   # TanStack Query config + apiRequest helper
│           ├── storage.ts       # Frontend API client (fetch wrappers)
│           ├── i18n.tsx         # I18n context, translations, RTL
│           ├── planner-recipes.ts # StoredRecipe → PlannerRecipe transform
│           └── utils.ts         # cn() helper
│
├── server/                      # Express backend
│   ├── index.ts                 # App bootstrap, middleware, listen
│   ├── routes.ts                # API route handlers + OpenAI integration
│   ├── storage.ts               # IStorage interface + DatabaseStorage impl
│   ├── db.ts                    # Drizzle + pg.Pool connection
│   ├── static.ts                # Production static file serving
│   └── vite.ts                  # Development Vite middleware
│
├── shared/                      # Shared between client and server
│   └── schema.ts                # Drizzle tables + Zod schemas + types
│
├── migrations/                  # Drizzle-kit generated SQL migrations
├── drizzle.config.ts            # Drizzle-kit config
├── vite.config.ts               # Vite build config
├── tsconfig.json                # TypeScript config
└── package.json                 # Dependencies and scripts
```

---

## 4. Database Layer

### 4.1 Connection

```
server/db.ts
  └── pg.Pool({ connectionString: process.env.DATABASE_URL })
       └── drizzle(pool, { schema })
```

A single `pg.Pool` manages connection pooling. The pool is created once at module load and shared across all requests via the exported `db` instance.

### 4.2 Schema (`shared/schema.ts`)

#### `users` table
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PK, default `gen_random_uuid()` | UUID |
| username | text | NOT NULL, UNIQUE | — |
| password | text | NOT NULL | — |

> The `users` table exists in schema but is **not used** — no authentication is implemented.

#### `recipes` table
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PK, default `gen_random_uuid()` | UUID |
| title | text | NOT NULL | Recipe name |
| ingredients | text[] | NOT NULL | Array of ingredient strings |
| steps | text[] | NOT NULL | Array of step strings |
| image | text | nullable | Base64 data URL or null |
| source_url | text | nullable | Original recipe URL |
| cook_time | integer | nullable | Minutes |
| servings | text | nullable | e.g. "3-4" |
| tags | text[] | nullable | e.g. ["vegetarian", "kidFriendly"] |
| created_at | timestamp | NOT NULL, default now() | — |
| updated_at | timestamp | NOT NULL, default now() | — |

### 4.3 Zod Schemas

```
insertRecipeSchema = createInsertSchema(recipes).omit({ id, createdAt, updatedAt })
insertUserSchema   = createInsertSchema(users).pick({ username, password })
```

These are used for request body validation in API routes.

### 4.4 Storage Interface (`server/storage.ts`)

```typescript
interface IStorage {
  // User operations (unused)
  getUser(id: string): Promise<User | undefined>
  getUserByUsername(username: string): Promise<User | undefined>
  createUser(user: InsertUser): Promise<User>

  // Recipe CRUD
  getAllRecipes(): Promise<Recipe[]>           // ORDER BY created_at DESC
  getRecipe(id: string): Promise<Recipe | undefined>
  createRecipe(recipe: InsertRecipe): Promise<Recipe>
  updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined>
  deleteRecipe(id: string): Promise<boolean>
}
```

`DatabaseStorage` implements this interface using Drizzle query builders. `updateRecipe` also sets `updatedAt = new Date()` on every update.

---

## 5. API Layer

### 5.1 Server Bootstrap (`server/index.ts`)

```
1. Create Express app + HTTP server
2. Configure middleware:
   - express.json({ limit: "50mb" })    ← large payloads for base64 images/audio
   - express.urlencoded({ extended: false })
   - Request logger (logs API calls with method, path, status, duration, response body)
3. Register API routes (server/routes.ts)
4. Register error handler
5. In development: attach Vite dev server middleware
   In production: serve static files from dist/public
6. Listen on process.env.PORT (default 5000)
```

### 5.2 REST Endpoints

All routes are prefixed with `/api`.

#### Recipe CRUD

| Method | Path | Request Body | Response | Status Codes |
|--------|------|-------------|----------|-------------|
| GET | `/api/recipes` | — | `Recipe[]` | 200, 500 |
| GET | `/api/recipes/:id` | — | `Recipe` | 200, 404, 500 |
| POST | `/api/recipes` | `InsertRecipe` (Zod-validated) | `Recipe` | 201, 400, 500 |
| PATCH | `/api/recipes/:id` | `Partial<InsertRecipe>` | `Recipe` | 200, 404, 500 |
| DELETE | `/api/recipes/:id` | — | `{ success: true }` | 200, 404, 500 |

#### AI / Voice Endpoints

| Method | Path | Request Body | Response | Status Codes |
|--------|------|-------------|----------|-------------|
| POST | `/api/transcribe-audio` | `{ audio: base64, mimeType?, language?, verifyText? }` | `{ transcript, rawTranscript }` | 200, 400, 500 |
| POST | `/api/parse-recipe` | `{ transcript: string }` | `{ title, ingredients[], steps[], cookTime?, servings?, tags[] }` | 200, 400, 500 |

### 5.3 OpenAI Integration

The server initializes one `OpenAI` client using `OPENAI_API_KEY` or `OPEN_API_KEY` from environment.

#### Audio Transcription Pipeline (`/api/transcribe-audio`)

```
Client (base64 audio blob)
  │
  ▼
1. Decode base64 → Buffer
2. Infer file extension from mimeType
   (webm, mp3, mp4, wav, ogg → defaults to webm)
3. Call OpenAI Whisper:
   openai.audio.transcriptions.create({
     model: "gpt-4o-mini-transcribe",
     file: audioBuffer,
     language?: "en" | "ru" | "he"
   })
4. If verifyText !== false, clean up transcript:
   openai.chat.completions.create({
     model: "gpt-4o-mini",
     system: "Fix spelling/grammar, preserve meaning and language"
   })
5. Return { transcript (cleaned), rawTranscript (original) }
```

#### Recipe Parsing Pipeline (`/api/parse-recipe`)

```
Client (transcript text)
  │
  ▼
1. Validate non-empty string
2. Call GPT-4o:
   openai.chat.completions.create({
     model: "gpt-4o",
     response_format: { type: "json_object" },
     system: "Parse spoken recipe into structured JSON",
     user: transcript
   })
3. Parse JSON response
4. Return structured recipe object:
   { title, ingredients[], steps[], cookTime, servings, tags[] }
```

Tags are limited to: `kidFriendly`, `vegetarian`, `glutenFree`.

---

## 6. Frontend Architecture

### 6.1 Provider Hierarchy (`App.tsx`)

```
<QueryClientProvider>
  <TooltipProvider>
    <I18nProvider>
      <Toaster />
      <DevNav />        ← Top navigation bar
      <Router />        ← Wouter Switch
    </I18nProvider>
  </TooltipProvider>
</QueryClientProvider>
```

### 6.2 Routing Table

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `MainPage` | Landing page (placeholder) |
| `/recipe-view` | `RecipeView` | Fetches recipes, redirects to first recipe's detail page |
| `/recipes` | `RecipeList` | Grid of all saved recipes with tags |
| `/recipe/:id` | `RecipeDetail` | Full recipe view with ingredients, steps, delete |
| `/meals` | `WeeklyMeals` | Complex meal planner with filters + drag-and-drop |
| `/import` | `ImportRecipe` | Manual entry + voice/AI recipe import |
| `/grocery-list` | `GroceryList` | Auto-generated shopping list from meal plan |
| `*` | `NotFound` | 404 fallback |

### 6.3 Navigation

Two navigation modes based on screen width:

**Desktop (sm+):** Horizontal pill-style nav bar with language selector dropdown.

**Mobile (<640px):** Compact top bar with language toggle pills + hamburger "Menu" button that opens a full-screen `Sheet` (slide-out panel) with nav links and language options.

The `DevNav` component renders both variants, toggled by Tailwind's `sm:hidden` / `hidden sm:flex`.

### 6.4 Layout Components

| Component | Purpose |
|-----------|---------|
| `PageContainer` | Responsive max-width wrapper (`md`=max-w-3xl, `lg`=max-w-5xl, `xl`=max-w-7xl) with app-container padding |
| `AppHeader` | Branded header with TW logo, title/subtitle, desktop actions slot, mobile menu slot |
| `MobileNavSheet` | Radix Sheet wrapper for slide-out mobile navigation |

### 6.5 Data Fetching (`client/src/lib/`)

#### `queryClient.ts`
- TanStack Query configured with `staleTime: Infinity`, no refetch on window focus, no retry
- `apiRequest(method, url, data)` — generic fetch wrapper with JSON serialization and error throwing
- `getQueryFn` — factory for query functions with configurable 401 handling

#### `storage.ts` — Frontend API Client
| Function | Endpoint | Returns |
|----------|----------|---------|
| `fetchRecipes()` | GET `/api/recipes` | `Recipe[]` |
| `fetchRecipe(id)` | GET `/api/recipes/:id` | `Recipe` |
| `createRecipe(data)` | POST `/api/recipes` | `Recipe` |
| `updateRecipe(id, data)` | PATCH `/api/recipes/:id` | `Recipe` |
| `deleteRecipe(id)` | DELETE `/api/recipes/:id` | `void` |

---

## 7. Data Flows

### 7.1 Recipe CRUD Flow

```
┌───────────┐     POST /api/recipes      ┌───────────┐     INSERT INTO     ┌────────────┐
│  Import    │ ──────────────────────────▶│  Express   │ ──────────────────▶│ PostgreSQL │
│  Recipe    │     { title, ingredients,  │  Route     │   recipes          │            │
│  Page      │       steps, image, ... }  │  Handler   │                    │            │
└───────────┘                             └─────┬─────┘                    └────────────┘
                                                │
                                                │ 201 { id, title, ... }
                                                ▼
                                          setLocation(`/recipe/${id}`)
                                                │
                                                ▼
                                          ┌───────────┐
                                          │  Recipe    │
                                          │  Detail    │
                                          │  Page      │
                                          └───────────┘
```

### 7.2 Voice Import Pipeline (End-to-End)

```
┌──────────────────────────────────────────────────────────┐
│  ImportRecipe Page                                        │
│                                                          │
│  1. User taps "Start dictation"                          │
│     └─▶ navigator.mediaDevices.getUserMedia({ audio })   │
│     └─▶ new MediaRecorder(stream)                        │
│     └─▶ recorder.start(250)   ← 250ms chunk interval    │
│                                                          │
│  2. User taps "Stop"                                     │
│     └─▶ recorder.stop()                                  │
│     └─▶ Blob assembled from chunks                       │
│     └─▶ voiceStatus = "ready"                            │
│                                                          │
│  3. User taps "Generate recipe with AI"                  │
│     └─▶ blobToBase64(audioBlob)                          │
│     └─▶ POST /api/transcribe-audio                       │
│         { audio: base64, mimeType, language }            │
│         Server: Whisper → gpt-4o-mini cleanup            │
│         Response: { transcript, rawTranscript }          │
│                                                          │
│  4. Transcript received                                  │
│     └─▶ POST /api/parse-recipe                           │
│         { transcript }                                   │
│         Server: GPT-4o → structured JSON                 │
│         Response: { title, ingredients[], steps[], ... } │
│                                                          │
│  5. Form fields auto-populated                           │
│     └─▶ setTitle(parsed.title)                           │
│     └─▶ setIngredients(parsed.ingredients.join("\n"))    │
│     └─▶ setSteps(parsed.steps.join("\n"))                │
│                                                          │
│  6. User taps "Save & open"                              │
│     └─▶ POST /api/recipes                                │
│     └─▶ Redirect to /recipe/:id                          │
└──────────────────────────────────────────────────────────┘
```

### 7.3 Weekly Meal Planning Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  WeeklyMeals Page                                                   │
│                                                                     │
│  STEP 1 — Load & Transform                                         │
│    fetchRecipes() → toPlannerRecipes()                              │
│    StoredRecipe → PlannerRecipe (infer: mealType, tools,            │
│                                  proteinType, servingsRange,        │
│                                  minutes, sourceType)               │
│                                                                     │
│  STEP 2 — Filter & Select (sidebar + main area)                    │
│    Filters: maxMinutes, dietary[], mealType[], cookingMethod[],     │
│             source[], proteinType[], myPicks, minRating,            │
│             servings, mustInclude[], mustExclude[],                 │
│             withNotes, modifiedByMe                                 │
│    Selection: up to 12 recipes                                      │
│                                                                     │
│  STEP 3 — Plan (drag-and-drop grid)                                │
│    ┌──────┬─────┬─────┬─────┬─────┬─────┬─────┐                    │
│    │      │ Sun │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │               │
│    ├──────┼─────┼─────┼─────┼─────┼─────┼─────┤                    │
│    │Break │     │     │     │     │     │     │     │               │
│    ├──────┼─────┼─────┼─────┼─────┼─────┼─────┤                    │
│    │Lunch │     │     │     │     │     │     │     │               │
│    ├──────┼─────┼─────┼─────┼─────┼─────┼─────┤                    │
│    │Dinner│     │     │     │     │     │     │     │               │
│    └──────┴─────┴─────┴─────┴─────┴─────┴─────┘                    │
│                                                                     │
│    DnD: @dnd-kit/core                                               │
│    - DraggableRecipe (sidebar) → DroppableCell (grid)               │
│    - DraggableRecipeSmall (tray) → DroppableCell (grid)             │
│    - Grid cells are both droppable AND draggable (for rearranging)  │
│    - Assignments support multi-day spans (+/− buttons)              │
│    - Week can be locked/unlocked (disables all DnD)                 │
│                                                                     │
│  STATE SHAPE (stored in localStorage as "weeklyMealsState"):        │
│    {                                                                │
│      filters: Filters,                                              │
│      selectedIds: string[],                                         │
│      expandedSections: string[],                                    │
│      showMoreFilters: boolean,                                      │
│      planAssignments: PlanAssignment[]                              │
│    }                                                                │
│                                                                     │
│    PlanAssignment = {                                               │
│      recipeId: string,                                              │
│      mealType: "Breakfast" | "Lunch" | "Dinner",                   │
│      startDay: number (0=Sun, 6=Sat),                              │
│      spanDays: number (1-7)                                        │
│    }                                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.4 Grocery List Generation Flow

```
GroceryList Page
  │
  ├─▶ Load localStorage("weeklyMealsState")
  │     └─▶ Extract planAssignments[]
  │
  ├─▶ fetchRecipes() → toPlannerRecipes()
  │     └─▶ Filter to only recipes in planAssignments
  │
  ├─▶ Aggregate all ingredients from used recipes
  │     └─▶ Deduplicate by lowercase key
  │     └─▶ Track which recipes use each ingredient
  │
  ├─▶ Categorize each ingredient
  │     └─▶ Keyword matching against category dictionaries:
  │         - Produce (broccoli, bell pepper, carrot, ...)
  │         - Meat & Poultry (chicken, beef, bacon, ...)
  │         - Seafood (salmon, shrimp, ...)
  │         - Dairy & Eggs (eggs, cheese, butter, ...)
  │         - Grains & Pasta (rice, pasta, flour, ...)
  │         - Canned & Jarred (soy sauce, olive oil, ...)
  │         - Spices & Seasonings (cumin, black pepper, ...)
  │         - Other (fallback)
  │
  └─▶ Render categorized checklist
        └─▶ Checked state is component-local (useState<Set<string>>)
        └─▶ NOT persisted to localStorage
```

### 7.5 Recipe Data Transformation (`planner-recipes.ts`)

When recipes move from the database to the weekly planner, they are enriched:

```
StoredRecipe (from API)          PlannerRecipe (for planner)
─────────────────────            ──────────────────────────
title                    ──────▶ title
cookTime (nullable)      ──────▶ minutes (inferred if null: steps.length * 10, min 10)
tags[]                   ──────▶ tags[] (normalized: "kid friendly" → "kidFriendly")
                         ──────▶ mealType (inferred from tags/title keywords)
steps[]                  ──────▶ tools[] (inferred: "bake" → Oven, "fry" → Stovetop, etc.)
sourceUrl                ──────▶ sourceType ("Imported" if URL, else "My recipes")
ingredients[]            ──────▶ proteinType (inferred: chicken/beef/seafood/plant-based)
servings                 ──────▶ servingsRange (e.g. "3-4" or "5+")
                         ──────▶ hasNotes: false (hardcoded)
                         ──────▶ modifiedByMe: false (hardcoded)
```

---

## 8. State Management

### 8.1 Server State (PostgreSQL via API)

All recipe data lives in PostgreSQL. Pages fetch it via the `storage.ts` API client. Most pages use raw `useState` + `useEffect` for fetching rather than TanStack Query's `useQuery` (only `queryClient.ts` sets up the QueryClient; the pages call `fetchRecipes()` directly).

### 8.2 Client State (localStorage)

| Key | Shape | Used By | Purpose |
|-----|-------|---------|---------|
| `weeklyMealsState` | `WeeklyMealsState` | `weekly-meals.tsx`, `grocery-list.tsx` | Filters, selected recipe IDs, plan assignments, UI state |
| `week_locked_v1` | `boolean` | `weekly-meals.tsx` | Whether the weekly plan is locked for editing |
| `recipe_user_meta_{recipeId}` | `RecipeUserMeta` | `use-recipe-user-meta.ts` | Per-recipe: isMyPick (boolean), rating (1-5), ratedAt |
| `tablewise_language` | `"en" \| "ru" \| "he"` | `i18n.tsx` | Selected UI language |

### 8.3 Cross-Page State Sharing

The **grocery list** page reads `weeklyMealsState` from localStorage to determine which recipes are in the weekly plan. This is the only cross-page state dependency:

```
WeeklyMeals ──(writes)──▶ localStorage["weeklyMealsState"]
                                    │
GroceryList ──(reads)───────────────┘
```

### 8.4 Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useLocalStorageState<T>(key, initial)` | `use-local-storage-state.ts` | Generic localStorage-backed useState with JSON serialization |
| `useRecipeUserMeta(recipeId)` | `use-recipe-user-meta.ts` | Returns `{ meta, toggleMyPick, setRating }` for a given recipe |
| `getRecipeUserMeta(recipeId)` | `use-recipe-user-meta.ts` | Non-hook version for reading meta in loops (WeeklyMeals) |

---

## 9. Internationalization (i18n)

### 9.1 System Design

```
I18nProvider (React Context)
  │
  ├── State: lang ("en" | "ru" | "he")
  │
  ├── On mount: detect browser language or load from localStorage
  │     └── navigator.language → match to supported → fallback "en"
  │
  ├── On lang change:
  │     └── Save to localStorage("tablewise_language")
  │     └── Set document.documentElement.dir = "rtl" | "ltr"
  │     └── Set document.documentElement.lang = lang
  │
  └── Provides: { lang, setLang, t(key, params?) }
```

### 9.2 Languages

| Code | Language | Direction | Native Label |
|------|----------|-----------|-------------|
| `en` | English | LTR | English |
| `ru` | Russian | LTR | Русский |
| `he` | Hebrew | RTL | עברית |

### 9.3 Translation Structure

~150+ translation keys organized by feature namespace:

| Namespace | Example Keys |
|-----------|-------------|
| `nav.*` | `nav.recipeView`, `nav.myRecipes`, `nav.weeklyMeals` |
| `recipes.*` | `recipes.title`, `recipes.empty`, `recipes.importFirst` |
| `recipeDetail.*` | `recipeDetail.backToRecipes`, `recipeDetail.delete` |
| `recipe.*` | `recipe.servings`, `recipe.stepOf`, `recipe.timer` |
| `meals.*` | `meals.weeklyPlan`, `meals.filters`, `meals.dropHere` |
| `import.*` | `import.title`, `import.voiceAi`, `import.saveAndOpen` |
| `grocery.*` | `grocery.title`, `grocery.produce`, `grocery.checked` |
| `notFound.*` | `notFound.title`, `notFound.message` |

### 9.4 Interpolation

The `t()` function supports parameter interpolation:
```
t("recipe.stepOf", { current: 2, total: 5 })
// → "Step 2 of 5" (en) / "Шаг 2 из 5" (ru) / "שלב 2 מתוך 5" (he)
```

### 9.5 RTL Handling

- Hebrew (`he`) sets `document.documentElement.dir = "rtl"`
- CSS uses logical properties: `text-start`, `text-end`, `ps-*`, `pe-*` (Tailwind v4)
- Arrow directions in translation strings are reversed: `←` (LTR) vs `→` (RTL)

---

## 10. Build & Development Toolchain

### 10.1 Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `cross-env NODE_ENV=development tsx server/index.ts` | Start dev server with Vite HMR |
| `build` | `tsx script/build.ts` | Production build (esbuild + Vite) |
| `start` | `cross-env NODE_ENV=production node dist/index.cjs` | Start production server |
| `check` | `tsc` | TypeScript type checking |
| `db:push` | `drizzle-kit push` | Push schema changes to database |

### 10.2 Vite Configuration

```
Plugins:
  - @vitejs/plugin-react
  - @replit/vite-plugin-runtime-error-modal
  - @tailwindcss/vite
  - metaImagesPlugin (custom)
  - @replit/vite-plugin-cartographer (dev only)
  - @replit/vite-plugin-dev-banner (dev only)

Path Aliases:
  "@"       → client/src/
  "@shared" → shared/
  "@assets" → attached_assets/

Build Output: dist/public/
Root: client/
```

### 10.3 Development Mode

In development, the Express server attaches Vite as middleware:
```
server/vite.ts → createViteServer({ middlewareMode: true, hmr: { server, path: "/vite-hmr" } })
```

This gives React HMR through the same server/port. The catch-all route transforms `client/index.html` through Vite's pipeline on every request.

### 10.4 Production Mode

In production, `server/static.ts` serves the pre-built files from `dist/public/` using `express.static()` with a fallback to `index.html` for SPA routing.

---

## 11. Design System

### 11.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#F7F6F3` | Page backgrounds |
| Foreground | `#2E2E2E` | Primary text, buttons |
| Muted foreground | `#7A7A7A` | Secondary text, labels |
| Accent green | `#7A9E7E` / `#6B8E6F` | Primary actions, success states |
| Card surface | `#FAFAF8` | Cards, panels, hover states |
| Subtle surface | `#F0EFEC` | Tags, pills |
| DevNav | `#2E2E2E` | Dark navigation bar |

### 11.2 Typography

- System font stack (no custom fonts loaded)
- Heading scale: `text-xl` (mobile) → `text-2xl` / `text-3xl` (desktop)
- Body: `text-sm` (14px)
- Labels: `text-xs uppercase tracking-wide` (11px)
- Micro text: `text-[10px]` for tags, metadata

### 11.3 Component Patterns

| Pattern | Implementation |
|---------|---------------|
| Buttons | Rounded-full pills with `min-h-11` (44px touch target) |
| Cards | `rounded-xl border hairline` with `hover:bg-[#FAFAF8]` |
| Inputs | `px-4 py-3 text-sm border hairline rounded-lg` |
| Tags/pills | `text-[10px] px-2 py-0.5 rounded-full bg-foreground/5` |
| Sections | `text-xs uppercase tracking-wide text-muted-foreground` headers |
| Dividers | `border hairline` (1px, subtle) |
| Shadows | Minimal (`shadow-sm` on select cards only) |
| Spacing | Generous; `space-y-6` between form sections, `gap-3` in grids |

### 11.4 Responsive Breakpoints

| Breakpoint | Tailwind | Usage |
|-----------|----------|-------|
| Mobile | default (< 640px) | Single column, full-width nav sheet, compact cards |
| Small | `sm:` (640px+) | Horizontal nav, 2-column grids, inline forms |
| Medium | `md:` (768px+) | 2-column grocery grid, larger headings |
| Large | `lg:` (1024px+) | 3-column recipe grid, sidebar layouts |
| X-Large | `xl:` (1280px+) | 3-column grocery grid, 2-column recipe cards |

---

## 12. Page-Level Architecture Details

### 12.1 `MainPage` (`/`)
Simple placeholder landing page with centered title text. No data fetching.

### 12.2 `RecipeView` (`/recipe-view`)
Fetches all recipes and immediately redirects to `/recipe/:id` for the first recipe found. Shows import prompt if no recipes exist. Acts as an entry point / redirect hub.

### 12.3 `RecipeList` (`/recipes`)
Fetches all recipes via `fetchRecipes()`. Renders a responsive grid (`1 col → sm:2 → lg:3`). Each card shows image thumbnail, title, ingredient/step count, cook time, and tags. Links to `/recipe/:id`.

### 12.4 `RecipeDetail` (`/recipe/:id`)
Fetches single recipe by URL param. Displays hero image, title, metadata (cook time, servings, source link), tags, ingredient list, numbered step list. Has delete button with confirmation dialog that redirects to `/recipes`.

### 12.5 `ImportRecipe` (`/import`)
Complex form with three input methods:
1. **Photo upload** — file input with `capture="environment"`, stored as base64 data URL
2. **Voice/AI** — MediaRecorder → base64 → `/api/transcribe-audio` → `/api/parse-recipe` → auto-fill form
3. **Manual entry** — title, ingredients (textarea), steps (textarea)

Also accepts optional source URL with validation. On save, calls `createRecipe()` and redirects to `/recipe/:id`.

### 12.6 `WeeklyMeals` (`/meals`)
The largest page (1485 lines). Three-phase workflow:
1. **Filter panel** (sidebar on desktop, sheet on mobile) — 13+ filter types
2. **Recipe selection** — browse filtered recipes, select up to 12
3. **Week grid** — drag-and-drop 7×3 grid (7 days × 3 meals) with multi-day spanning

Uses `@dnd-kit/core` with custom `DraggableRecipe`, `DraggableRecipeSmall`, and `DroppableCell` components. All state persisted to localStorage.

### 12.7 `GroceryList` (`/grocery-list`)
Reads meal plan from localStorage, fetches recipes, aggregates and categorizes all ingredients. Renders a categorized checklist with checkbox toggles and recipe attribution. Check state is ephemeral (not persisted).

---

## 13. Security Considerations

| Area | Status |
|------|--------|
| Authentication | Not implemented. `users` table exists but unused. |
| API validation | POST `/api/recipes` validates body with Zod. PATCH does not validate. |
| CORS | Not needed (same-origin, single server). |
| Rate limiting | None. OpenAI endpoints are unprotected. |
| Input sanitization | No explicit XSS protection beyond React's default escaping. |
| Image storage | Base64 in database. No size limit beyond Express's 50MB body limit. |
| Secrets | `OPENAI_API_KEY` / `OPEN_API_KEY` via environment variables. `DATABASE_URL` auto-provisioned. |

---

## 14. Dependency Graph (Module Level)

```
shared/schema.ts
  ▲
  │
  ├── server/db.ts
  │     ▲
  │     └── server/storage.ts
  │           ▲
  │           └── server/routes.ts ◀── openai (external)
  │                 ▲
  │                 └── server/index.ts
  │                       ├── server/static.ts (prod)
  │                       └── server/vite.ts (dev) ◀── vite.config.ts
  │
  └── client/src/lib/storage.ts (type only, via API)
        ▲
        ├── client/src/pages/*.tsx
        │     ▲
        │     └── client/src/App.tsx
        │           ▲
        │           └── client/src/main.tsx
        │
        └── client/src/lib/planner-recipes.ts
              ▲
              ├── client/src/pages/weekly-meals.tsx
              └── client/src/pages/grocery-list.tsx
```

---

*This document reflects the codebase as of March 2026. Update when architectural changes are made.*
