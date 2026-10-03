# EduTrack — Tuition Attendance & Institute Management

A multi-tenant platform for small and mid-sized tuition centres and coaching
institutes: live class attendance, batches and timetables, syllabus coverage,
fees and receipts, and performance analytics. Each institute that buys the
software gets its own branded, isolated workspace and links its own students.

One codebase runs on **web (PWA), Android, iOS, Windows, macOS and Linux**.

**→ [docs/SETUP.md](docs/SETUP.md) is the setup guide.** Or, for the app alone:
`cd frontend && npm install && npm run dev`, then sign in with institute code
`APEX`.

## Status

| Part | State |
|---|---|
| **Frontend** | Complete. Every screen, 84 unit tests, lint and typecheck clean. Runs on a local data store. |
| **Backend — foundation** | Complete. Multi-tenancy with tenant isolation in the data layer, three kinds of sign-in, server-side permissions, the full database schema, 278 unit tests plus an e2e suite. |
| **Backend — endpoints** | Auth, roles, staff and bulk student import only. **Students, batches, attendance, fees, assessments, topics, settings and the portal endpoints are not written yet.** |
| **Frontend ↔ API** | Sign-in and the portal auth flows go to the API. Everything else still reads the local store, because the endpoints above do not exist. |
| **Operations** | Client provisioning, fleet migration, backups and offboarding are scripted and documented. |
| **Native builds** | Configured but not generated — `cap add` / `tauri init` create the projects. |

So: the product is demonstrable end to end today, and the remaining work is the
domain endpoints plus swapping each store action over to them. See
[docs/SETUP.md › What talks to the API today](docs/SETUP.md#what-talks-to-the-api-today).

## Repository layout

```
frontend/              React 18 + TypeScript + Vite + Tailwind — all platforms
  docs/ARCHITECTURE.md     structure, data flow, UI conventions
  docs/PLATFORMS.md        building for web, Android/iOS (Capacitor), desktop (Tauri)
backend/               NestJS 10 + Prisma 5 + PostgreSQL 16 — multi-tenant API
  docs/API.md              auth flows, error shape, tenancy and permissions
  docs/OPERATIONS.md       provisioning, releases, backups, offboarding
  docs/PERFORMANCE.md      measured query timings at full scale
docs/SETUP.md          how to run all of this locally
docs/HOSTING.md        how each client's copy is isolated, and who runs it
CHANGELOG.md           what changed, per release
```

## Features

- **Class Attendance** — live roll call with Present / Late / Absent / Excused
  toggles, topics taught, parent absence alerts, offline-first saving.
- **Students Roster** — admissions, batch assignment, fee status at a glance,
  ID card printing, CSV export, bulk actions.
- **Batches & Classes** — capacity, schedule, faculty, weekly timetable.
- **Topic Coverage** — syllabus per subject/grade, per-batch progress and pace.
- **Fee Management** — monthly invoicing, payments, receipts, dues and reminders.
- **Reports** — attendance trends and registers, assessment analytics.
- **Faculty & Roles** — staff invitations, and roles the institute defines
  itself from a fixed capability catalogue.
- **Student & parent app** (`/portal`) — separate but linked logins: students by
  student ID, parents by mobile with a one-time code or a password. Phone-first,
  written for families rather than staff.
- **First-run setup wizard** — a new institute starts empty and its owner is
  walked through branding, campuses, academics, rules and team.
- **Institute Settings** — branding (per-tenant theme), campuses, attendance and
  billing rules, notification channels, data export and reset.

## How a client gets it

**One client = one deployment = one database.** Nothing is shared between
institutes — not a table, not a row, not a connection — so no query can ever
show one client another's students. We host each client's instance at their own
subdomain; provisioning is a single scripted command.

The reasoning is in [docs/HOSTING.md](docs/HOSTING.md); the runbook is
[backend/docs/OPERATIONS.md](backend/docs/OPERATIONS.md).

## Branches

| Branch | What |
|---|---|
| `main` | Integration — the whole product. Read this one. |
| `frontend` | Web/mobile/desktop app development. |
| `backend` | API development. Carries an older snapshot of `frontend/`; ignore it. |

## Quality

Both halves keep lint, typecheck and tests green:

```bash
cd frontend && npm run lint && npm run typecheck && npm test   #  84 tests
cd backend  && npm run lint && npm run typecheck && npm test   # 278 tests
```

The backend's unit tests need no database; its e2e suite skips itself when none
is reachable. Business rules that both halves implement — fee status, attendance
percentages, role constraints — are pure functions with tests on each side, so
they cannot drift silently.
