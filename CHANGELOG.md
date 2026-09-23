# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Planned
- Backend API and real multi-tenant data (replaces the local demo store).
- Student / parent mobile app surface.
- Native projects: Capacitor (Android/iOS) and Tauri (desktop) — see `frontend/docs/PLATFORMS.md`.

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
