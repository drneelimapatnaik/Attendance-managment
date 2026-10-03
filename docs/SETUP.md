# Setting up EduTrack

Everything you need to get this repository running on a development machine,
from "just show me the app" to the full stack with a real database.

| I want to… | Go to | Needs |
|---|---|---|
| See and work on the UI | [Path 1 — the web app alone](#path-1--the-web-app-alone) | Node 20+ |
| Work on the API, auth or the database | [Path 2 — the full stack](#path-2--the-full-stack) | Node 20+, Docker |
| Build for Android, iOS or desktop | [Mobile and desktop](#mobile-and-desktop) | see that section |
| Provision a real paying client | [`../backend/docs/OPERATIONS.md`](../backend/docs/OPERATIONS.md) | operator access |

> **Read [What talks to the API today](#what-talks-to-the-api-today) before
> Path 2.** The API's sign-in endpoints are live, but the domain endpoints
> (students, attendance, fees…) are not written yet, so pointing the web app at
> the backend today gives you real authentication and an otherwise empty app.
> That is expected, not a broken setup.

---

## Prerequisites

| | Version | Needed for | Check |
|---|---|---|---|
| **Node.js** | 20 or newer | everything | `node -v` |
| **npm** | 10+ (ships with Node 20) | everything | `npm -v` |
| **Git** | any recent | everything | `git --version` |
| **Docker Desktop** | any recent | Path 2 (runs PostgreSQL) | `docker --version` |

Instead of Docker you may use a local **PostgreSQL 16** server — just point
`DATABASE_URL` at it. Nothing else in the stack cares where Postgres came from.

Optional, only for native builds: **JDK 17 + Android Studio** (Android),
**Xcode 15+ on macOS** (iOS), **Rust via `rustup`** (desktop).

### Clone

```bash
git clone https://github.com/drneelimapatnaik/Attendance-managment.git
cd Attendance-managment
```

`main` holds the whole product. The `frontend` and `backend` branches are where
each half is developed — see [Branches](#branches).

---

## Path 1 — the web app alone

The fastest way in. No backend, no database: the app generates a demo institute
and keeps it in device storage.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Sign in with institute code **`APEX`**. The login screen lists a one-click demo
account per role — Owner, Administrator, Faculty, Accountant and Front Desk — so
you can see exactly what each role is allowed to do. The demo institute (Apex
Academy, 248 students, 14 batches) is generated on first run and saved locally;
reset it from **Institute Settings → Data & privacy**.

No `.env` file is required. `frontend/.env.example` documents the two variables
that exist if you want them.

---

## Path 2 — the full stack

Four steps: database, API, web app, verify. All commands run from the repository
root unless shown otherwise.

### 1. The database

```bash
cd backend
docker compose up -d
```

That starts **PostgreSQL 16** on `localhost:5432` (user, password and database
all `edutrack`) and **Adminer**, a database UI, on <http://localhost:8080>
(server `db`). Data lives in the named volume `edutrack_pgdata`, so
`docker compose down` keeps your database — use `docker compose down -v` to wipe
it.

### 2. The API

```bash
# still in backend/
cp .env.example .env
```

Now edit `.env` and set the two JWT secrets. They must be at least 32
characters and must differ from each other:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice, once for `JWT_ACCESS_SECRET` and once for `JWT_REFRESH_SECRET`.
Every other default in `.env.example` already matches `docker-compose.yml`.
Every variable is validated at boot, so a missing or malformed one stops the
process with a readable list rather than failing later.

```bash
npm install
npm run prisma:migrate   # create the schema
npm run db:seed          # demo tenant "Apex Academy" — prints its credentials
npm run dev              # http://localhost:3000
```

**Keep the `db:seed` output.** It prints the institute code and a working
credential for every sign-in path: staff by email, a student by student ID, a
parent by mobile with a password, a parent by one-time code, plus single-use
activation tokens for the invited student and invited staff member.

| URL | What |
|---|---|
| <http://localhost:3000/health> | liveness + database readiness |
| <http://localhost:3000/docs> | Swagger UI — the live API reference |
| `http://localhost:3000/api/v1/…` | the API itself |

### 3. The web app

```bash
cd ../frontend
npm install
```

Create `frontend/.env`:

```ini
VITE_API_URL=http://localhost:3000/api/v1
VITE_DEMO_DATA=true
```

`VITE_DEMO_DATA=true` is the pragmatic choice while the domain endpoints are
missing: sign-in goes to the real API, and the rest of the app still has data to
show. Drop it once those endpoints exist. See
[Demo data, or an empty institute](#demo-data-or-an-empty-institute).

```bash
npm run dev          # http://localhost:5173
```

### 4. Verify

1. `curl http://localhost:3000/health` → status ok, database reachable.
2. Open <http://localhost:3000/docs> and expand `POST /api/v1/auth/staff/login`.
3. Open <http://localhost:5173>, sign in with institute code `APEX` and the
   owner's email and password from the `db:seed` output.
4. Check the API's terminal: you should see the request logged with a request
   id. That is the proof the browser reached the backend rather than the local
   store.

---

## Demo data, or an empty institute

A real client's instance must never ship with demo data — their institute starts
empty and the owner is taken through the first-run setup wizard. That is what
`VITE_DEMO_DATA` controls:

| `VITE_DEMO_DATA` | First run gives you | Use for |
|---|---|---|
| unset | Follows `VITE_API_URL`: demo data with no backend, **empty** with one | the default |
| `true` | Always the Apex Academy demo tenant | UI work, sales demos, screenshots |
| `false` | An **empty** institute: two built-in roles, the owner's staff record, nothing else → the `/setup` wizard | testing what a real client sees |

So with no `.env` at all you get demo data (Path 1), and the moment you set
`VITE_API_URL` you get an empty institute unless you ask for demo data
explicitly. Set `VITE_DEMO_DATA=false` when you want to exercise the onboarding
wizard.

On the API side the equivalent is `npm run db:seed`, which builds the demo
tenant in the database. Never run it against a client's database;
`client:create` is the command that provisions a real institute, and it loads no
demo data unless explicitly told to.

---

## What talks to the API today

Being precise about this saves an afternoon of debugging an app that is working
as designed.

| Area | Where its data comes from |
|---|---|
| Staff sign-in, refresh, sign-out | **The API** |
| Student / parent portal sign-in, activation, password recovery | **The API** |
| Roles, staff roster, bulk student import | **The API** (endpoints exist; the UI still reads the local store) |
| Students, batches, attendance, fees, assessments, topics, settings, portal screens | The local Zustand store in the browser |

The backend has the whole database schema, tenant isolation, authentication and
authorisation in place; what it does not yet have is the domain CRUD endpoints.
Until they land, `frontend/src/store/dataStore.ts` is the source of truth for
everything the screens show. Each of its actions keeps its signature when the
API arrives, so the change is additive —
[`../frontend/docs/ARCHITECTURE.md`](../frontend/docs/ARCHITECTURE.md) and
[`../backend/README.md`](../backend/README.md) › Adding a module describe the two
sides of that work.

---

## Everything in Docker

To run the API as a container too, rather than on the host:

```bash
cd backend
docker compose --profile app up -d --build
docker compose exec api npx prisma migrate deploy
```

The API container is a production build, so it reaches the database as `db`
rather than `localhost` and serves `/docs` only because the compose file asks it
to. Day to day, running the API on the host against the containerised database
(Path 2) gives you reload and better stack traces.

---

## Running the tests

```bash
cd frontend && npm test     # 84 unit tests — business rules, dates, demo data, permissions
cd backend  && npm test     # 278 unit tests — tenancy, authz, auth services, domain rules
cd backend  && npm run test:e2e   # end-to-end; needs a database
```

Neither unit suite needs a database: the backend replaces Prisma with a small
in-memory fake and tests tenant scoping and the role rules as pure functions.
The e2e suite **skips itself automatically** when no database is reachable, so it
is safe to run anywhere; with a database it boots the real application, creates
two throwaway tenants, exercises the role and invitation flows and deletes them
afterwards.

Jest may print *"A worker process has failed to exit gracefully"*. That is
argon2's native thread pool, not a leak.

Before pushing, both halves should be clean:

```bash
npm run lint && npm run typecheck && npm test   # in frontend/ and in backend/
```

---

## Mobile and desktop

The same frontend builds for Android, iOS, Windows, macOS and Linux. Full
instructions, including white-label builds for one institute, are in
[`../frontend/docs/PLATFORMS.md`](../frontend/docs/PLATFORMS.md). In short:

```bash
cd frontend
npm run build
npx cap add android && npx cap sync && npx cap open android   # Android Studio
npm install -D @tauri-apps/cli@2 && npx tauri dev             # desktop window
```

The native projects are not generated in this repository yet — `cap add` and
`tauri init` create them. Once created, **commit `android/` and `ios/`**: signing
config, icons and splash screens get customised in them. Their build output is
already git-ignored.

---

## Command reference

### `frontend/`

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload on :5173 |
| `npm run build` | Type-check, then production build to `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` / `lint` / `format` | Code quality |
| `npm test` | Unit tests |

### `backend/`

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with reload on :3000 |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run prisma:migrate` | Create and apply a migration (development) |
| `npm run prisma:deploy` | Apply migrations (production) |
| `npm run prisma:generate` | Regenerate the Prisma client after a schema change |
| `npm run prisma:studio` | Browse the database |
| `npm run db:seed` / `npm run db:reset` | Rebuild the demo tenant / drop, re-migrate and re-seed |
| `npm run typecheck` / `lint` / `format` | Code quality |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |

Operator commands (`client:create`, `client:list`, `clients:migrate`,
`client:drop`, the load test) are a different job and are documented in
[`../backend/docs/OPERATIONS.md`](../backend/docs/OPERATIONS.md). They need
`ADMIN_DATABASE_URL` and must never run on a client's instance.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| API exits at boot listing variables | Env validation. Read the list: usually the two JWT secrets are missing, too short (< 32 chars) or identical. |
| `Can't reach database server at localhost:5432` | Postgres is not up. `docker compose ps`, then `docker compose up -d`. Give it a few seconds — the health check waits for it. |
| `prisma migrate` hangs or errors on first run | It connected before Postgres finished initialising. Wait for `docker compose ps` to show `healthy`, then retry. |
| `Port 5432 is already allocated` | Another Postgres is running locally. Stop it, or change the host port in `docker-compose.yml` and in `DATABASE_URL`. |
| Port 5173 or 3000 in use | Something else has it. `npm run dev -- --port 5174` for Vite; `PORT=3001` in `backend/.env` for the API. |
| Browser console: CORS error | The API's `CORS_ORIGINS` must list the exact origin the browser uses, e.g. `http://localhost:5173`. Restart the API after editing `.env`. |
| Sign-in works, but the app is empty | Expected — see [What talks to the API today](#what-talks-to-the-api-today). Set `VITE_DEMO_DATA=true`. |
| Changing `.env` in `frontend/` does nothing | Vite reads env at startup. Restart `npm run dev`; only `VITE_`-prefixed variables reach the browser. |
| Prisma types out of date after editing `schema.prisma` | `npm run prisma:generate`. |
| `Migration … started and never finished` | A migration failed partway. [`../backend/docs/OPERATIONS.md`](../backend/docs/OPERATIONS.md) › When a migration fails halfway. |
| Stale UI after a big change | The store persists to device storage. Institute Settings → Data & privacy → reset, or clear site data. |
| `npm install` fails on Windows building argon2 | Install the Visual Studio C++ Build Tools, or run the API in Docker (`--profile app`). |
| Odd file locks or duplicated files | This working copy is inside OneDrive. Pause syncing while installing dependencies, or move the clone outside the synced folder. |

---

## Branches

| Branch | What |
|---|---|
| `main` | Integration. The whole product: `frontend/`, `backend/`, `docs/`. |
| `frontend` | Web/mobile/desktop app development. |
| `backend` | API development. Carries an older snapshot of `frontend/`; ignore it and read `main`'s. |

---

## Where to read next

| Document | What it covers |
|---|---|
| [`HOSTING.md`](HOSTING.md) | How each client's copy is isolated, who runs it, the scale target |
| [`../frontend/docs/ARCHITECTURE.md`](../frontend/docs/ARCHITECTURE.md) | Frontend structure, data flow, UI conventions |
| [`../frontend/docs/PLATFORMS.md`](../frontend/docs/PLATFORMS.md) | Web, Android/iOS, desktop builds |
| [`../backend/README.md`](../backend/README.md) | API internals: tenancy, roles, errors, adding a module |
| [`../backend/docs/API.md`](../backend/docs/API.md) | Auth flows, error shape, tenancy and permission contracts |
| [`../backend/docs/OPERATIONS.md`](../backend/docs/OPERATIONS.md) | Provisioning, releases, backups, offboarding |
| [`../backend/docs/PERFORMANCE.md`](../backend/docs/PERFORMANCE.md) | Measured query timings at full scale |
| [`../CHANGELOG.md`](../CHANGELOG.md) | What changed, per release |
