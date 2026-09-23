# EduTrack frontend — architecture & conventions

EduTrack is a multi-tenant tuition-centre management app (attendance, batches,
syllabus coverage, fees, performance). One React codebase ships to:

| Target | How |
|---|---|
| Web / PWA | `npm run build` → static `dist/` behind any CDN |
| Android / iOS | Capacitor wraps `dist/` (see `docs/PLATFORMS.md`) |
| Windows / macOS / Linux | Tauri wraps `dist/` (see `docs/PLATFORMS.md`) |

## Stack

React 18 · TypeScript (strict) · Vite 5 · Tailwind CSS 3 (design tokens as CSS
variables) · React Router 6 (data router) · Zustand (state, persisted locally).
Fonts and icons (Plus Jakarta Sans, Material Symbols) are bundled, so the app
works fully offline inside native shells.

## Folder structure

```
src/
  app/            App root, router, error boundary, global modal host
  components/
    ui/           Design-system primitives (Button, DataTable, Modal, …) — import from '@/components/ui'
    charts/       SVG charts (LineChart, ColumnChart, BarList, StackedBar, Sparkline)
    domain/       Domain-aware shared widgets (status badges, PersonCell, BatchTags, RequirePermission)
    layout/       App shell: sidebar, top bar, mobile nav
  config/         env, navigation map, role permissions, brand themes
  data/           Demo tenant seed (used until the backend exists)
  domain/         Pure business rules (fees, attendance, academics) — no React
  features/<area>/ One folder per product area: pages, feature components, modals, hooks
  hooks/          useTenant (data access), ui (media queries, pagination, selection…)
  lib/            Generic helpers (dates, formatting, CSV export, ids, platform)
  services/       HTTP client + auth (backend integration point)
  store/          Zustand stores: dataStore (tenant data + actions), sessionStore, uiStore
  styles/         Global CSS + design tokens
  types/          Domain model (types/domain.ts)
```

## Data flow

```
dataStore (entities + actions)  ──►  hooks/useTenant.ts  ──►  feature pages
          ▲                          useScopedData()          (compose UI from
          │                          useLookups()              components/ui +
   actions only                      useFeeIndex()             components/domain)
 (addStudent, saveSession,           useMoney() / useCan()
  recordPayment, …)                  + domain/* pure helpers
```

- **Read** tenant data through `useScopedData()` (filtered to the campus picked
  in the top bar), `useLookups()` (id → entity maps), `useFeeIndex()`
  (per-student fee summaries) and `useSettings()`.
- **Derive** with `src/domain/*` (attendance %, fee status, occupancy, coverage,
  assessment stats). Never store derived values.
- **Write** only via `useDataStore` actions. Each action logs to the activity
  feed and is the single place the backend call will be added.
- **Permissions**: `const can = useCan(); can('fees.collect')`. Routes are
  guarded in `app/router.tsx`; hide buttons the role can't use.
- **Global modals**: `useUiStore(s => s.openModal)({ type: 'record-payment', studentId })`.
- **Toasts**: `const toast = useToast(); toast({ title, description, tone, action })`.

## UI conventions

- Every file starts with a short header comment saying what it is for;
  comment non-obvious logic inline. No commented-out code.
- Page skeleton: `<div className="flex flex-col gap-space-lg">` → `<PageHeader eyebrow title actions />`
  → content cards (`card` class / `<Card>`). Call `useDocumentTitle('…')`.
- Typography: always pair family + size tokens, e.g. `font-title-md text-title-md`,
  `font-label-sm text-label-sm uppercase tracking-wider` (section labels),
  `font-body-sm text-body-sm text-secondary` (meta text).
- Colour: only token classes (`bg-surface-container-low`, `text-on-surface`,
  `text-primary`, `bg-error-container`…). No raw hex in features. Status
  colours (`success`/`warning`/`danger`) are reserved for state and always
  paired with an icon or text.
- Spacing: `space-*` tokens (`gap-space-md`, `p-space-md`); 16px mobile gutters.
- Numbers in columns: `tnum` class (tabular figures).
- Money: `useMoney().format(n)`. Dates: `@/lib/date` (`formatDate`, `today()`, never `new Date('YYYY-MM-DD')`).
- Tables: `DataTable` with `mobileCard` so phones get stacked cards.
- Touch: interactive controls ≥ 44px tall below `md` (built into Button, fields, SegmentedControl).
- Charts: `@/components/charts`. Single series uses the brand colour; multiple
  series use `SERIES_COLORS` in fixed order (max 3); legend for ≥ 2 series.
- Filters that define a view belong in the URL (`useSearchParams`) so views are shareable;
  URL-backed search boxes use `DebouncedSearch` from `@/components/ui`.
- Menus/popovers (`Menu`) render in a portal, so they are safe inside tables and modals.
- Empty, loading and no-permission states are part of every screen.

## Connecting the backend

1. Set `VITE_API_URL` (see `.env.example`).
2. `services/http.ts` already sends the bearer token and `X-Tenant` header.
3. In `store/dataStore.ts`, make each action call the API (optimistic update,
   then reconcile). Replace the seed with an initial fetch per tenant.
4. `services/auth.ts` switches to `POST /auth/login` automatically when
   `VITE_API_URL` is set.

## Tests

Pure rules live in `src/domain`, `src/lib` and feature helpers; their tests sit
next to them as `*.test.ts` (Vitest, Node environment). Add a test whenever a
business rule changes (fee status, attendance %, billing dates).

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` ·
`npm run format` · `npm test`
