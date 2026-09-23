# EduTrack — Tuition Attendance & Institute Management

A multi-tenant platform for small and mid-sized tuition centres and coaching
institutes: live class attendance, batches and timetables, syllabus coverage,
fees and receipts, and performance analytics. Each institute that buys the
software gets its own branded, isolated workspace and links its own students.

One codebase runs on **web (PWA), Android, iOS, Windows, macOS and Linux**.

> Status: frontend complete on a local demo data store; the backend foundation
> (multi-tenancy, authentication, authorisation, full database schema) is in
> place. Domain endpoints are the next wave — see `backend/README.md`.

## Repository layout

```
frontend/          React + TypeScript app (all platforms)
  docs/ARCHITECTURE.md   structure, data flow, UI conventions
  docs/PLATFORMS.md      building for web, Android/iOS (Capacitor), desktop (Tauri)
backend/           NestJS + Prisma + PostgreSQL API (multi-tenant)
  docs/API.md            auth flows, error shape, tenancy and permissions
CHANGELOG.md       what changed, per release
```

## Quick start

Requires Node.js 20+.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Sign in with institute code **APEX** and any demo account on the login screen
(one per role: Owner, Administrator, Faculty, Accountant, Front Desk). Data is
generated on first run and saved on the device; reset it from
*Institute Settings → Data & privacy*.

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run typecheck` / `npm run lint` / `npm run format` | Code quality |
| `npm test` | Unit tests (business rules, dates, demo data integrity) |

## Backend

The API lives in `backend/`: **NestJS 10 · Prisma 5 · PostgreSQL 16**, one
deployment serving many institutes. Full instructions are in
[`backend/README.md`](backend/README.md); the auth contract is in
[`backend/docs/API.md`](backend/docs/API.md).

```bash
cd backend
cp .env.example .env     # set the two JWT secrets
docker compose up -d     # PostgreSQL on :5432, Adminer on :8080
npm install
npm run prisma:migrate   # create the schema
npm run db:seed          # demo tenant "Apex Academy" — prints its credentials
npm run dev              # http://localhost:3000  (docs at /docs, health at /health)
```

To point the web app at it, set `VITE_API_URL=http://localhost:3000/api/v1` in
`frontend/.env` — the JSON matches `frontend/src/types/domain.ts`, so no
translation layer is needed.

What the foundation provides:

- **Tenant isolation in the data layer.** The tenant comes from the JWT claim
  (with the `X-Tenant` institute-code header for sign-in), is held in
  `AsyncLocalStorage`, and is injected into every Prisma query by a client
  extension — a query with no tenant, or someone else's tenant, throws before it
  reaches the database.
- **Three kinds of sign-in.** Staff (email + password), students (student ID +
  password) and parents (mobile + SMS code, or a password), plus invitation
  activation and password recovery by email. 15-minute access tokens with
  rotating, revocable 30-day refresh tokens; argon2id hashing throughout.
- **Server-side permissions.** The same role → permission matrix the UI uses, and
  a portal guard that limits students and parents to their own records.
- **The whole domain schema**, mirroring `frontend/src/types/domain.ts`, with
  tenant-scoped uniqueness, money as `Decimal(12,2)` and calendar dates as `date`.
- Consistent error shape, request-id logging, rate limiting, health checks,
  OpenAPI docs, and unit + e2e tests.

## Features

- **Class Attendance** — live roll call with Present / Late / Absent / Excused
  toggles, topics taught, parent absence alerts, offline-first saving.
- **Students Roster** — admissions, batch assignment, fee status at a glance,
  ID card printing, CSV export, bulk actions.
- **Batches & Classes** — capacity, schedule, faculty, weekly timetable.
- **Topic Coverage** — syllabus per subject/grade, per-batch progress and pace.
- **Fee Management** — monthly invoicing, payments, receipts, dues and reminders.
- **Reports** — attendance trends and registers, assessment analytics.
- **Faculty & Roles** — staff invitations and role-based access control.
- **Institute Settings** — branding (per-tenant theme), campuses, attendance and
  billing rules, notification channels.
