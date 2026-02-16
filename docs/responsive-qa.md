# Responsive QA Checklist

## Scope
- Mobile-first responsiveness hardening with no visual redesign.
- Focus pages: `/`, `/recipe-view`, `/recipes`, `/recipe/:id`, `/import`, `/meals`, `/grocery-list`.

## Baseline (Out of Scope)
`npm run check` has pre-existing server TypeScript failures unrelated to responsive changes:
- `server/replit_integrations/batch/utils.ts:110` `AbortError` missing on `p-retry`.
- `server/replit_integrations/batch/utils.ts:159` `AbortError` missing on `p-retry`.
- `server/replit_integrations/chat/storage.ts:2` missing `conversations` export in `@shared/schema`.
- `server/replit_integrations/chat/storage.ts:2` missing `messages` export in `@shared/schema`.
- `server/replit_integrations/image/client.ts:23` `response.data` possibly undefined.
- `server/replit_integrations/image/client.ts:50` `response.data` possibly undefined.
- `server/replit_integrations/image/routes.ts:20` `response.data` possibly undefined.

## Validation Results
- `npm run build`: PASS
- `npm run check`: FAIL (baseline errors above, unchanged scope)

## Responsive Implementation Checklist
- [x] Added shared responsive container primitive (`PageContainer`).
- [x] Added shared responsive header primitive (`AppHeader`).
- [x] Added shared mobile drawer primitive (`MobileNavSheet`).
- [x] Updated viewport meta to allow zoom (`maximum-scale=1` removed).
- [x] Added global responsive utilities (`app-container`, section spacing, readable microtext helper).
- [x] Added mobile drawer nav for global DevNav.
- [x] Migrated `/grocery-list` to shared header/container with mobile menu.
- [x] Migrated `/recipe-list` to shared container and improved wrapping.
- [x] Migrated `/recipe/:id` to shared container and improved wrapping/readability.
- [x] Updated `/import` action rows to wrap and improved tap target sizing.
- [x] Updated `/recipe-view` to mobile-first shell, responsive paddings, wrapped action rows, mobile in-flow image.
- [x] Updated `/meals` generated-plan layout to responsive header/actions, mobile recipe drawer, and horizontal scroll grid.
- [x] Updated `/meals` selection layout to responsive header/container and mobile-safe card/action wrapping.
- [x] Added local metadata memoization in `/meals` to reduce repeated `localStorage` reads in heavy render paths.

## Responsive Acceptance Matrix
Status key:
- `Done`: implemented and statically verified in code paths.
- `Needs Manual Browser Pass`: UI should be manually verified in an interactive browser viewport.

| Page | 360 | 390 | 768 | 1024 | 1280 |
|---|---|---|---|---|---|
| `/` | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/recipe-view` | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/recipes` | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/recipe/:id` | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/import` | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/meals` selection | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/meals` generated | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |
| `/grocery-list` | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass | Needs Manual Browser Pass |

## Interaction Checks
- [x] Mobile drawer navigation opens/closes from global DevNav.
- [x] `/meals` generated mode mobile recipe tray is accessible through drawer.
- [x] `/meals` generated 7-day plan is inside horizontal scroll container with minimum width guard.
- [x] `/recipe-view` primary actions wrap on small widths.
- [x] `/import` voice/save action rows wrap on small widths.

## Known Follow-Ups
- Manual browser QA pass is still required for final visual confirmation across viewports and EN/RU/HE strings.
- Vite reports one large client chunk warning after build (`>500 kB`), unrelated to responsiveness scope.

## Sign-off Summary
- Responsive architecture foundations and major page-level fixes are implemented.
- Build is green.
- Typecheck failures remain baseline server issues outside responsiveness scope.
