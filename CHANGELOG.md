# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Backend** (`backend/`): a multi-tenant API — **NestJS 10 · Prisma 5 ·
  PostgreSQL 16**, strict TypeScript, 278 unit tests plus an end-to-end suite.
  - *Tenant isolation in the data layer.* The tenant comes from the JWT claim
    (with `X-Tenant` for sign-in), is held in `AsyncLocalStorage`, and is
    injected into every Prisma query by a client extension — a query with no
    tenant, or someone else's, throws before it reaches the database. Which
    tables are tenant-owned is read from the Prisma DMMF, so a new table is
    protected automatically.
  - *Three kinds of sign-in.* Staff (email + password), students (student ID +
    password) and parents (mobile + SMS code, or a password), plus invitation
    activation and password recovery by email. 15-minute access tokens with
    rotating, revocable 30-day refresh tokens; argon2id throughout.
  - *Server-side permissions,* from the same capability catalogue the UI uses,
    resolved from the database per request — so editing a role takes effect
    immediately, and a token issued a minute ago is already subject to it. A
    portal guard limits students and parents to their own records.
  - *The whole domain schema,* mirroring `frontend/src/types/domain.ts`, with
    tenant-scoped uniqueness, money as `Decimal(12,2)` and calendar dates as
    `date`.
  - *Endpoints so far:* `/auth/*` (all sign-in flows), `/roles`, `/permissions`,
    `/staff` and `POST /students/import`. One error shape for the whole API,
    request-id logging, rate limiting, health checks and OpenAPI docs at `/docs`.
- **Institute-defined staff roles.** Roles are data, not an enum: every buyer
  runs their own deployment, so how they organise their team is theirs. Four
  kinds are built in (`admin`, `faculty` as staff roles; `student`, `parent` as
  portal logins) and every other role — "Accountant", "Front Desk",
  "Counsellor" — is created by the institute from a fixed capability catalogue.
  Nobody can raise their own authority, and an institute always keeps at least
  one active administrator; the rules are pure functions, tested on both sides.
- **First-run setup wizard** (`/setup`). A real client's institute starts
  **empty** — the two built-in roles, the owner's staff record and nothing else
  — and its owner is walked through institute details, branding, campuses,
  academics, rules and team, with progress saved as they go. Demo data is now a
  deliberate switch (`VITE_DEMO_DATA`) rather than the only behaviour.
- **Student & parent app** (`/portal`): separate but linked logins — students
  sign in with their student ID and a password, parents with their registered
  mobile and either a one-time code or a password. Email is required on parent
  accounts and optional on student accounts, and drives invite activation and
  password recovery. A parent with several children switches between them in
  the app.
- Portal screens, phone-first and written for families rather than staff:
  home (today's classes, attendance, latest result, fees, syllabus progress and
  a recent-updates feed), attendance (month calendar, per-subject breakdown,
  class history), results (trend against the class average, per-subject
  breakdown, every assessment), syllabus coverage, weekly timetable, fees
  (bills, receipts, how fees work — parents only) and account settings
  (password, recovery email, notification preferences, linked children).
- Staff can invite, re-invite, disable and re-enable those logins from a
  student's profile.
- **Operations.** Client provisioning is scripted end to end: `client:create`
  (database, least-privilege role, migrations, institute bootstrap, owner
  invitation, registry entry, handover summary), `client:list`,
  `clients:migrate` (roll a release across every client database, continuing
  past a failure and recording each one's version) and `client:drop` (back up,
  then offboard). The client registry is an operator-side JSON file, never a
  shared database.
- **Scale work** for the ~5,000-students-per-institute target: composite indexes
  on the hot paths, pagination and filtering in the database rather than in
  memory, batched bulk imports, and a load test that builds a full-size
  synthetic institute and times the queries behind the real screens with
  `EXPLAIN (ANALYZE, BUFFERS)` — results in `backend/docs/PERFORMANCE.md`.
- **Documentation.** `docs/SETUP.md` (how to run all of this, and what is wired
  to the API today), `docs/HOSTING.md` (one client = one deployment = one
  database, and why), `backend/docs/API.md`, `backend/docs/OPERATIONS.md` and a
  repository-root `.gitignore`.

### Fixed
- `normalizePhone` stripped the letter "D" instead of non-digits, so the same
  mobile written differently would not have matched a login (now covered by tests).
- Collections added to the store were dropped on reload, because the persistence
  layer listed fields by hand; it now saves all data automatically.

### Planned
- The remaining domain endpoints: students, batches, attendance, fees,
  assessments, topics, settings and the portal reads.
- Switching each `dataStore` action over to those endpoints (optimistic update →
  server confirm), which is what replaces the local store.
- Native projects: Capacitor (Android/iOS) and Tauri (desktop) — see
  `frontend/docs/PLATFORMS.md`.

## [0.1.0] — 2026-09-22

First complete frontend, built from the "Students & Batch Roster" design and `DESIGN.md`.

### Added
- **Foundation** (`frontend/`): React 18 + TypeScript (strict) + Vite 5 + Tailwind 3.
  - Design tokens are runtime CSS variables, with five per-tenant brand themes.
  - Plus Jakarta Sans and Material Symbols are bundled, so the app works offline.
  - Responsive shell: collapsible sidebar, top bar with campus switcher, global search (Ctrl/⌘ K), notifications and a "New Entry" menu; phones get a bottom tab bar and a drawer.
  - Role-based access control for Owner, Administrator, Faculty, Accountant and Front Desk. Routes and actions are gated per role.
  - Zustand stores with local persistence and a deterministic demo tenant (Apex Academy, 248 students, 14 batches).
  - HTTP client and auth service ready for the backend (`VITE_API_URL`).
  - Design-system components: buttons, form controls, sortable/paginated DataTable with phone card layout, modals that become bottom sheets on phones, menus, tabs, toasts, stat cards and progress meters.
  - SVG charts: line, column, bar list, stacked bar and sparkline. Each has hover tooltips and a screen-reader table; the palette was validated for colour-blind safety.
- **Screens**
  - Login (institute code + email, with one-click demo accounts per role).
  - Dashboard.
  - Class Attendance: live roll call with P/L/A/E toggles, keyboard shortcuts, topics taught, and an unsaved-changes guard.
  - Attendance Reports: summary and register views.
  - Students Roster (the design mock-up), Student Profile, and the add/edit student form.
  - Batches: grid, list and timetable views; batch detail; create/edit batch form with clash warnings.
  - Topic Coverage: per-batch progress with a pace indicator, plus a syllabus master.
  - Fee Management: dues, invoices, payments, monthly invoicing, record payment and printable receipts (amount in words).
  - Performance analytics, and an assessment form with score entry.
  - Faculty & Roles: staff directory, permission matrix, workload.
  - Institute Settings: profile, branding, campuses, attendance and billing rules, notifications, working days, subscription, and data export/reset.
- **Quality**
  - ESLint (flat config) and Prettier.
  - 24 Vitest unit tests covering fee rules, attendance maths, dates, amount-in-words and demo-data integrity.
  - Docs: `README.md`, `frontend/docs/ARCHITECTURE.md`, `frontend/docs/PLATFORMS.md`.
  - PWA manifest and `capacitor.config.ts`.
