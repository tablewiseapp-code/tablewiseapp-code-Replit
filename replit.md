# Recipe View Application

## Overview

A calm, professional cooking workspace application designed for focus and clarity. The app displays recipes with a minimalist interface inspired by Steve Jobs' design philosophy - simplicity, restraint, and letting the interface "disappear while cooking." Features include ingredient scaling by servings, unit conversion (grams/ml/cups), step-by-step cooking guidance, and state persistence via localStorage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React hooks with localStorage persistence for recipe state (servings, units, active step, completed ingredients/steps)
- **Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom warm gray color palette designed for low contrast, calm aesthetics

### Design System
- Off-white/warm gray background (#F7F6F3)
- Dark gray text (#2E2E2E) with muted secondary text (#7A7A7A)
- System font stack for native feel
- Minimal shadows, hairline dividers, generous whitespace
- No animations, no gamification elements

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful routes prefixed with `/api`
- **Build**: esbuild for server bundling, Vite for client

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` - defines users table with id, username, password
- **Storage Interface**: Abstract `IStorage` interface in `server/storage.ts` with in-memory implementation (MemStorage) that can be swapped for database-backed storage
- **Client Persistence**: localStorage for recipe UI state

### Project Structure
```
client/           # React frontend
  src/
    components/ui/  # shadcn/ui components
    pages/          # Route components
    hooks/          # Custom React hooks
    lib/            # Utilities and query client
server/           # Express backend
  index.ts        # Entry point
  routes.ts       # API route registration
  storage.ts      # Data access layer
  static.ts       # Static file serving (production)
  vite.ts         # Vite dev server integration
shared/           # Shared types and schema
  schema.ts       # Drizzle schema and Zod validation
```

## External Dependencies

### Database
- **PostgreSQL**: Primary database configured via `DATABASE_URL` environment variable
- **Drizzle Kit**: Schema migrations stored in `/migrations` directory

### UI Libraries
- **Radix UI**: Comprehensive primitive components (dialog, dropdown, tabs, etc.)
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management
- **cmdk**: Command menu component
- **embla-carousel-react**: Carousel functionality
- **react-day-picker**: Calendar/date picker
- **vaul**: Drawer component
- **react-resizable-panels**: Resizable panel layouts

### Build & Development
- **Vite**: Development server and production builds
- **@replit/vite-plugin-runtime-error-modal**: Error overlay for development
- **@replit/vite-plugin-cartographer**: Replit-specific tooling
- **tailwindcss**: CSS framework with `@tailwindcss/vite` plugin

### Form & Validation
- **react-hook-form**: Form state management
- **@hookform/resolvers**: Validation resolvers
- **zod**: Schema validation
- **drizzle-zod**: Drizzle to Zod schema generation

### Session Management
- **connect-pg-simple**: PostgreSQL session store (available for auth implementation)
- **express-session**: Session middleware (dependency available)