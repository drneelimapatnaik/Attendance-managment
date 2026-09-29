# EduTrack API

Multi-tenant backend for the EduTrack tuition suite: one deployment serves many
institutes, each with its own students, staff, batches, fees and branding.

**Node 20+ · TypeScript (strict) · NestJS 10 · Prisma 5 · PostgreSQL 16**

> Status: **foundation + roles & staff**. Tenancy, authentication, authorisation
> (institute-defined roles), staff management, health, docs and the full database
> schema are in place. The remaining domain CRUD modules (students, batches,
> attendance, fees, reports) are the next wave — see
> [Adding a module](#adding-a-module).

---

## Quick start

```bash
cd backend
cp .env.example .env            # then edit: set the two JWT secrets
docker compose up -d            # PostgreSQL 16 on :5432, Adminer on :8080
npm install
npm run prisma:migrate          # creates the schema (first run: `-- --name init`)
npm run db:seed                 # demo tenant "Apex Academy" + printed credentials
npm run dev                     # http://localhost:3000
```

Then:

| URL | What |
|---|---|
| `http://localhost:3000/health` | liveness + database readiness |
| `http://localhost:3000/docs` | Swagger UI (disabled in production unless `SWAGGER_ENABLED=true`) |
| `http://localhost:3000/api/v1/…` | the API itself |
| `http://localhost:8080` | Adminer (server `db`, user/password/database `edutrack`) |

Generate the JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Connecting the web app

Point the frontend at the API and it works with no translation layer — the JSON
matches `frontend/src/types/domain.ts` (camelCase, `YYYY-MM-DD` calendar dates,
money as plain numbers):

```bash
# frontend/.env
VITE_API_URL=http://localhost:3000/api/v1
```

`frontend/src/services/http.ts` already sends `Authorization: Bearer …` and
`X-Tenant: APEX`, and `services/auth.ts` posts to `/auth/login` — an alias of
`/auth/staff/login` that this API keeps for exactly that reason.

### Running everything in Docker

```bash
docker compose --profile app up -d --build     # database + Adminer + API
docker compose exec api npx prisma migrate deploy
```

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with reload |
| `npm run build` | Compile to `dist/` (Nest build + path-alias rewrite) |
| `npm start` | Run the compiled server |
| `npm run lint` / `npm run format` | ESLint / Prettier (single quotes, width 140, trailing commas) |
| `npm run typecheck` | `tsc --noEmit` over src, prisma and tests |
| `npm test` | Unit tests (no database needed) |
| `npm run test:e2e` | End-to-end tests — **skipped automatically** when no database is reachable |
| `npm run prisma:migrate` | Create/apply a migration in development |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run prisma:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:seed` | Rebuild the demo tenant and print its credentials |
| `npm run db:reset` | Drop, re-migrate and re-seed the database |

---

## Environment

Every variable is validated at boot (`src/config/env.validation.ts`); the process
exits with a readable list if anything is missing or malformed. `.env.example` is
the full, commented list — the essentials:

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` disables Swagger and dev code echoes |
| `PORT` | `3000` | |
| `DATABASE_URL` | — | **required**; matches `docker-compose.yml` out of the box |
| `JWT_ACCESS_SECRET` | — | **required**, ≥ 32 chars |
| `JWT_REFRESH_SECRET` | — | **required**, ≥ 32 chars, different from the access secret |
| `JWT_ACCESS_TTL` | `15m` | Access-token lifetime |
| `JWT_REFRESH_TTL_DAYS` | `30` | Refresh-token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated; `*` allows any (dev only) |
| `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_LENGTH` | `5` / `5` / `6` | Parent sign-in codes |
| `RESET_TOKEN_TTL_MINUTES` | `60` | Password-reset links |
| `ACTIVATION_TOKEN_TTL_HOURS` | `168` | Invitation links |
| `THROTTLE_TTL_SECONDS` / `THROTTLE_LIMIT` | `60` / `120` | Global rate limit; auth routes are tighter |
| `SWAGGER_ENABLED` | on outside production | Must be set explicitly to serve `/docs` in production |
| `WEB_APP_URL` | `http://localhost:5173` | Used to build reset/activation links |
| `SEED_*` | see `.env.example` | Demo passwords used by `npm run db:seed` only |

Secrets come from the environment only. `.env` is git-ignored; `.env.example`
holds placeholders.

---

## How it fits together

```
src/
  main.ts                  bootstrap: helmet, compression, CORS, /api/v1, Swagger
  app.module.ts            composition root (middleware → guards → pipe → filter)
  config/                  env validation + the typed AppConfig object
  tenancy/                 AsyncLocalStorage tenant context, middleware, tenant lookup
  prisma/                  PrismaService + the tenant-scoping client extension
  auth/                    sign-in flows, tokens, OTP, password policy, senders
  roles/                   /roles CRUD + the /permissions catalogue
  staff/                   /staff roster, invitations, role changes
  common/
    authz/                 the capability catalogue, the built-in roles, the pure
                           role rules, and the DB-backed permission resolver
    decorators/            @Public, @Permissions, @PortalStudentScope, @CurrentUser
    guards/                JWT, permissions, portal scope, OTP throttling
    filters/               one error shape for the whole API
    logging/               pino configuration and redaction
    serialization/         wire-format helpers (enums, money, dates)
    errors/                AppError and the stable error codes
  domain/                  pure business rules ported from frontend/src/domain
  health/                  liveness and database readiness
prisma/
  schema.prisma            the whole data model
  migrations/              generated SQL
  seed.ts                  the "Apex Academy" demo tenant
test/                      e2e suite, Jest bootstrap, in-memory Prisma fakes
```

### Multi-tenancy

1. `TenantContextMiddleware` opens an `AsyncLocalStorage` store per request and
   records the `X-Tenant` institute code (a *hint*, since the request is not yet
   authenticated) and a request id.
2. `JwtAuthGuard` verifies the bearer token, refuses a request whose header
   disagrees with the token's tenant claim, and writes the authoritative tenant
   and principal into the store.
3. The Prisma client extension (`src/prisma/tenant-scope.ts`) rewrites **every**
   query on a tenant-owned table: `where.tenantId` injected on reads and updates,
   `data.tenantId` on inserts. A missing tenant or a mismatched one throws before
   the query is sent. Which tables are tenant-owned is read from the Prisma DMMF,
   so a new table in `schema.prisma` is protected automatically.

Two clients are exported: `PrismaService` (raw — only for the `Tenant` table and
health checks) and `TENANT_PRISMA` (scoped — what every feature module injects).

Unauthenticated flows (sign-in, OTP) resolve the institute code first and then
run inside `tenantContext.runWithTenant(...)`. Genuinely global work uses
`runAsSystem(...)`; never call it with a value that came from a request body.

> Caveat: raw queries (`$queryRaw`) and nested writes are not rewritten. Scope raw
> SQL by hand; create child rows with their own tenant-scoped calls.

### Roles and authorisation

Every buyer runs their own deployment with their own database, and **how they
organise their team is theirs**. So roles are data, not an enum:

- **Four role kinds are built in and always exist.** `admin` and `faculty` are
  staff roles — rows in the tenant's `roles` table with `isSystem = true`.
  `student` and `parent` are portal logins (`PortalAccount`), nothing to do with
  staff roles.
- **Every other staff role is created by the institute itself** — "Accountant",
  "Front Desk", "Counsellor", "Branch Head" — each with a permission set chosen
  from the fixed capability catalogue in `src/common/authz/permissions.ts`. The
  catalogue is the product's (institutes choose from it, they never extend it); the
  roles are theirs.
- A new institute is bootstrapped with **Administrator** (`admin`, all 14
  capabilities, protected from deletion and from losing `faculty.manage` /
  `settings.manage`) and **Faculty** (`faculty`, the teaching subset, pre-selected
  in the invite form). See `src/common/authz/system-roles.ts` and
  `RolesService.ensureSystemRoles()`.
- A role's `key` is a stable slug code may branch on; its `name` is the institute's
  label and may be renamed freely, system roles included.
- **`Staff.isOwner`** marks the account that set the institute up. It holds every
  capability whatever its role row says, and is protected from deletion, demotion
  and deactivation.

How it is enforced:

- **Staff**: `@Permissions('fees.collect')` on a route; `PermissionsGuard` asks
  `PermissionResolverService`, which reads the signed-in member's role row from the
  database and caches it in the per-request tenant context. Editing a role
  therefore takes effect immediately — an access token issued a minute ago is
  already subject to the new rules — and an account deleted or deactivated since
  its token was issued is refused.
- **Students and parents**: `@PortalStudentScope('studentId')`; `PortalScopeGuard`
  allows the request only if the student id belongs to that login — a parent sees
  their own children and nobody else's.
- **Nobody raises their own authority.** A non-owner cannot grant a role a
  capability they do not hold, cannot edit or delete the role they are standing on,
  cannot change their own role, and cannot assign a role stronger than theirs.
- **The institute always keeps at least one active administrator** — an Active
  member who is the owner or whose role holds both `faculty.manage` and
  `settings.manage`. Every mutation that could reduce that count is checked against
  the post-change roster (`src/common/authz/role-rules.ts`, pure and unit-tested).

The management endpoints are `/api/v1/roles` (CRUD, `faculty.manage`),
`/api/v1/permissions` (the catalogue, for the picker) and `/api/v1/staff`
(roster, invitations, role changes) — all documented in `docs/API.md`.

### Errors

Every failure has the same shape, so the client never has to guess:

```json
{ "statusCode": 401, "message": "Those sign-in details are not correct.", "code": "INVALID_CREDENTIALS", "requestId": "…" }
```

`message` is safe to show a user; `code` is the stable key to branch on. See
`docs/API.md` for the full list.

---

## Adding a module

Domain modules (students, batches, attendance, fees, reports) all follow the same
shape. To add one — say `students`:

```
src/students/
  students.module.ts
  students.controller.ts       routes, @Permissions(...), Swagger decorators
  students.service.ts          business logic; injects TENANT_PRISMA
  dto/create-student.dto.ts    class-validator input contracts
  dto/student.dto.ts           response shape (must match frontend/src/types/domain.ts)
  students.mapper.ts           row → DTO (dateToWire, toMoney, wire enums)
  students.service.spec.ts     unit tests
```

1. Inject the scoped client: `@Inject(TENANT_PRISMA) private readonly db: TenantPrisma`.
   Never filter by `tenantId` yourself — the extension does it, and doing it twice
   is how mistakes creep in. (Prisma's `create` types *do* require `tenantId`:
   pass `this.context.requireTenantId()` and the extension verifies it matches.)
2. Guard every route with `@Permissions(...)`; add `@PortalStudentScope()` on any
   route a student or parent may also call.
3. Convert at the edge with `src/common/serialization/wire.ts`: `Decimal` → number,
   `@db.Date` → `YYYY-MM-DD`, Prisma enum → the client's spelling (`OnLeave` →
   `'On Leave'`).
4. Put business rules in `src/domain/*` as pure functions with tests, not in the
   service — the frontend has the same rules and they must not drift.
5. Register the module in `AppModule.imports`.

---

## Testing

```bash
npm test          # unit: tenant isolation, permissions, auth services, domain rules
npm run test:e2e  # end-to-end against a real database (auto-skips without one)
```

Unit tests never touch a database: the Prisma client is replaced by a small
in-memory fake (`test/fakes/` — a handful of query shapes plus a fake institute
with roles and staff wired together), and tenant scoping and the role rules are
tested as pure functions. The e2e suite boots the real application (same guards,
pipe and filter as production), creates two throwaway tenants, exercises the role
and invitation flows against them, and deletes them afterwards. It replaces the
throttler's storage so the sign-in budget does not cap the number of sessions the
suite legitimately needs; every other guard runs exactly as in production.

Jest may print *"A worker process has failed to exit gracefully"* — that is
argon2's native thread pool, not a leak in the application code.

---

## Production notes

- `Dockerfile` is multi-stage and runs as the unprivileged `node` user.
- Run `npx prisma migrate deploy` on release; never `migrate dev`.
- Set `SWAGGER_ENABLED=false` unless the docs are meant to be public.
- Put the API behind TLS; it trusts one proxy hop in production so rate limiting
  sees real client IPs.
- Wire real providers for `SMS_SENDER` and `MAIL_SENDER` in `auth.module.ts`; the
  development implementations only log, and refuse to print codes when
  `NODE_ENV=production`.
