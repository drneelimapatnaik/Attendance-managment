# EduTrack — Tuition Attendance & Institute Management

A multi-tenant platform for small and mid-sized tuition centres and coaching
institutes: live class attendance, batches and timetables, syllabus coverage,
fees and receipts, and performance analytics. Each institute that buys the
software gets its own branded, isolated workspace and links its own students.

One codebase runs on **web (PWA), Android, iOS, Windows, macOS and Linux**.

> Status: frontend complete on a local demo data store. The backend and final
> requirements are next — see `frontend/docs/ARCHITECTURE.md › Connecting the backend`.

## Repository layout

```
frontend/          React + TypeScript app (all platforms)
  docs/ARCHITECTURE.md   structure, data flow, UI conventions
  docs/PLATFORMS.md      building for web, Android/iOS (Capacitor), desktop (Tauri)
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
