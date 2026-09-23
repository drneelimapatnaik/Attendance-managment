# EduTrack API — authentication & conventions

Base URL: `/api/v1` (health checks live outside it, at `/health`).
Interactive docs: `/docs` (Swagger UI, off in production unless `SWAGGER_ENABLED=true`).

Everything below is what the foundation ships. Domain endpoints (students,
batches, attendance, fees, reports) arrive in the next wave and will follow the
same conventions.

---

## 1. Conventions

### Wire format

The JSON matches `frontend/src/types/domain.ts` field for field, so the client
needs no translation layer:

| Kind | Form | Example |
|---|---|---|
| Keys | camelCase | `instituteCode`, `lastActiveAt` |
| Calendar date | `YYYY-MM-DD` | `"joinedOn": "2019-04-01"` |
| Instant | full ISO 8601 (UTC) | `"lastActiveAt": "2026-09-23T09:15:00.000Z"` |
| Time of day | `HH:mm`, 24h | `"startTime": "16:30"` |
| Money | plain number, institute currency major unit | `"amount": 2500` |
| Enums | the client's spelling | `"On Leave"`, `"Bank Transfer"`, `"Not Started"` |

### Tenancy

Every request carries the institute twice:

- **`X-Tenant: APEX`** — the institute code. Required on unauthenticated routes
  in the sense that the body carries it (`instituteCode`); the header is what the
  client sends on every request, and it is checked against the token.
- **The bearer token's tenant claim** — authoritative. If the header names a
  different institute the request is refused with `403 TENANT_MISMATCH`.

Server-side, the resolved tenant is held in an `AsyncLocalStorage` store and
injected into every database query by a Prisma client extension, so no endpoint
can read or write another institute's rows even if it forgets to filter.

### Authentication

```
Authorization: Bearer <access token>
```

- Access token: JWT, **15 minutes**, not stored server-side.
- Refresh token: **30 days**, one row per session, stored as an argon2 hash of a
  random secret. Every refresh **rotates** it.
- Reusing a rotated refresh token is treated as a leak: every session for that
  principal is revoked and the call fails with `REFRESH_TOKEN_REUSED`.

### Permissions

Staff routes are guarded by the same matrix the UI uses
(`frontend/src/config/permissions.ts`):

| Role | Permissions |
|---|---|
| `owner` | all 14 |
| `admin` | all except `settings.manage` |
| `faculty` | `dashboard.view`, `attendance.mark`, `attendance.reports`, `students.view`, `batches.view`, `topics.manage`, `performance.view`, `performance.manage` |
| `accountant` | `dashboard.view`, `students.view`, `batches.view`, `fees.view`, `fees.collect`, `attendance.reports` |
| `front_desk` | `dashboard.view`, `students.view`, `students.manage`, `batches.view`, `fees.view`, `attendance.mark` |

A missing permission returns `403 PERMISSION_DENIED` with the required and
missing permissions in `details`.

Student and parent logins are not staff: they never pass a permission check.
Instead they are limited to the students linked to their account — a parent may
read their own children and nothing else (`403 PORTAL_SCOPE_DENIED`).

### Errors

Every error, from validation to rate limiting, has one shape:

```json
{
  "statusCode": 400,
  "message": "Enter a valid email address.",
  "code": "VALIDATION_FAILED",
  "details": { "errors": ["Enter a valid email address."] },
  "requestId": "0f5b7c3e-…"
}
```

`message` is safe to show a user. `code` is stable — branch on it, never on the
text. `requestId` also comes back as the `X-Request-Id` response header and
appears in the server logs.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Body failed validation, or carried unknown properties |
| `WEAK_PASSWORD` | 400 | Password rejected by the policy |
| `OTP_INVALID` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` / `OTP_NOT_REQUESTED` | 400 | Parent sign-in code problems |
| `UNAUTHORIZED` | 401 | Missing or unusable bearer token |
| `INVALID_CREDENTIALS` | 401 | Wrong sign-in details (never says which part) |
| `ACCOUNT_NOT_ACTIVATED` | 401 | Invitation not yet accepted |
| `TOKEN_EXPIRED` | 401 | Access token, reset link or invitation expired |
| `INVALID_TOKEN` | 401 | Refresh/reset/invitation token unusable |
| `REFRESH_TOKEN_REUSED` | 401 | A rotated refresh token was presented again |
| `ACCOUNT_INACTIVE` | 403 | Account deactivated or disabled |
| `PERMISSION_DENIED` | 403 | Role does not grant the required permission |
| `PORTAL_SCOPE_DENIED` | 403 | Student/parent asked for someone else's records |
| `TENANT_MISMATCH` | 403 | `X-Tenant` disagrees with the token |
| `TENANT_SUSPENDED` | 403 | Institute is not active |
| `TENANT_NOT_FOUND` | 404 | No institute with that code |
| `NOT_FOUND` | 404 | No such record |
| `CONFLICT` | 409 | Unique constraint or a record still referenced |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL` | 500 | Something unexpected — details are logged, not returned |

### Rate limits

Global: 120 requests/minute per IP (configurable). Auth routes are tighter:

| Route | Limit |
|---|---|
| `/auth/*/login`, `/auth/login` | 10/min |
| `/auth/parent/otp/request` | 3/min **per IP + phone number** |
| `/auth/parent/otp/verify` | 10/min per IP + phone number |
| `/auth/password/forgot`, `/auth/password/reset`, `/auth/portal/activate` | 5/min |
| `/auth/refresh` | 30/min |

---

## 2. Auth endpoints

### `POST /auth/staff/login`

Also available as **`POST /auth/login`** (alias for the existing web client).

```http
POST /api/v1/auth/staff/login
Content-Type: application/json
X-Tenant: APEX

{ "instituteCode": "APEX", "email": "neelima@apexacademy.in", "password": "Apex@2026" }
```

`200 OK`

```json
{
  "token": "eyJhbGciOi…",
  "accessToken": "eyJhbGciOi…",
  "refreshToken": "9f1c0a6e-….s3cr3t…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresAt": "2026-10-23T09:15:00.000Z",
  "principal": "staff",
  "institute": { "id": "…", "code": "APEX", "name": "Apex Academy" },
  "user": {
    "id": "…", "name": "Dr. Neelima Patnaik", "email": "neelima@apexacademy.in",
    "phone": "+91 98450 11223", "role": "owner", "title": "Director · Senior Faculty (Physics)",
    "subjectIds": ["…"], "status": "Active", "joinedOn": "2019-04-01",
    "lastActiveAt": "2026-09-23T09:15:00.000Z"
  },
  "permissions": ["dashboard.view", "attendance.mark", "…"]
}
```

`token` is a copy of `accessToken` so `frontend/src/services/auth.ts` works
unchanged. `user` is exactly the client's `Staff` type.

Failures: `401 INVALID_CREDENTIALS` (wrong password *or* unknown email — the two
are indistinguishable, including in response time), `401 ACCOUNT_NOT_ACTIVATED`,
`403 ACCOUNT_INACTIVE`, `404 TENANT_NOT_FOUND`.

### `POST /auth/student/login`

```json
{ "instituteCode": "APEX", "studentId": "STU-1042", "password": "student123" }
```

`200 OK` — same envelope, with `principal: "student"` and a portal `user`:

```json
{
  "principal": "student",
  "user": {
    "id": "…", "role": "student", "name": "Aarav Patel", "loginId": "STU-1042",
    "email": "aarav.patel@student.apexacademy.in", "emailVerified": true,
    "authMethod": "password", "status": "Active",
    "studentIds": ["…"],
    "students": [{ "id": "…", "studentCode": "STU-1042", "name": "Aarav Patel", "grade": "Grade 10" }],
    "notify": { "attendance": true, "fees": true, "results": true }
  }
}
```

### `POST /auth/parent/otp/request`

```json
{ "instituteCode": "APEX", "phone": "+91 98765 43211" }
```

`200 OK`

```json
{ "sent": true, "expiresInSeconds": 300, "sentTo": "••••• 43211", "devCode": "049705" }
```

- The response is **identical** whether or not the number is registered — the
  endpoint cannot be used to discover parents.
- `devCode` is present only when `NODE_ENV !== 'production'`, so the demo works
  without an SMS gateway. The development `SmsSender` also logs the message.
- The number is matched on its last 10 digits, so `+91 98765 43211`,
  `098765 43211` and `9876543211` are the same account.
- Requesting a new code invalidates the previous one.

### `POST /auth/parent/otp/verify`

```json
{ "instituteCode": "APEX", "phone": "+91 98765 43211", "code": "049705" }
```

`200 OK` — the standard session envelope with `principal: "parent"` and every
linked child in `user.students`.

The code expires after 5 minutes and allows 5 attempts; the fifth wrong attempt
burns it (`OTP_ATTEMPTS_EXCEEDED`), and it is single-use. Verifying a code also
activates a parent account that was still `Invited` — possession of the number is
the proof.

### `POST /auth/parent/login`

For parents who chose a password instead of codes.

```json
{ "instituteCode": "APEX", "phone": "+91 98765 43210", "password": "parent123" }
```

### `POST /auth/portal/activate`

Turns an invitation into a usable login. Works for portal accounts **and** staff
invitations (both are issued as activation tokens).

```json
{ "token": "Q4JRAKb2DQ11--3qQL64lMPBQ6s0X2m9a2IG377otTM", "password": "Devansh#2026", "email": "optional@example.com" }
```

`200 OK` — signs the account in and returns the standard session envelope.

- The token is single-use and valid for 7 days (`ACTIVATION_TOKEN_TTL_HOURS`).
- A rejected password (`400 WEAK_PASSWORD`) does **not** consume the token.
- Parents must end up with an email on file; students may leave it blank.

### `POST /auth/password/forgot`

```json
{ "instituteCode": "APEX", "identifier": "neelima@apexacademy.in" }
```

`identifier` is whatever that principal signs in with: a staff email, a student
ID (`STU-1042`) or a parent mobile number.

`202 Accepted` — **always**, whether or not the account exists, whether or not it
has an email:

```json
{
  "accepted": true,
  "message": "If that account exists, we have sent a recovery link to the email on file.",
  "devResetUrl": "http://localhost:5173/reset-password?token=…"
}
```

`devResetUrl` is present only outside production.

### `POST /auth/password/reset`

```json
{ "token": "…", "password": "NewParent#2026" }
```

`200 OK` → `{ "ok": true }`. The link is single-use and valid for 60 minutes
(`RESET_TOKEN_TTL_MINUTES`). Resetting a password **revokes every existing
session** for that account. A rejected password does not consume the link.

### `POST /auth/refresh`

```json
{ "refreshToken": "9f1c0a6e-….s3cr3t…" }
```

`200 OK` — a new session envelope, including a **new** refresh token. The
presented token is revoked and linked to its replacement, and the principal is
re-read from the database, so a role change or a deactivated account takes effect
at the next refresh rather than 30 days later.

Presenting a token that was already rotated returns `401 REFRESH_TOKEN_REUSED`
and revokes every session for that principal.

### `POST /auth/logout`

```json
{ "refreshToken": "9f1c0a6e-….s3cr3t…" }
```

`204 No Content`, always — unknown, malformed and already-revoked tokens included.

### `GET /auth/me`

Requires a bearer token.

```json
{
  "principal": "staff",
  "institute": { "id": "…", "code": "APEX", "name": "Apex Academy" },
  "user": { "…": "Staff or PortalAccount shape" },
  "permissions": ["dashboard.view", "…"]
}
```

Rebuilt from the database, not from the token: it reflects the account as it is
now. `permissions` is present for staff only.

---

## 3. Health

| Route | Purpose |
|---|---|
| `GET /health` | Liveness **and** database readiness (`SELECT 1`, 3s timeout) + heap check |
| `GET /health/live` | Process is up — `{ "status": "ok", "uptime": 412 }` |
| `GET /health/ready` | Database answers |

```json
{ "status": "ok", "info": { "database": { "status": "up", "responseTimeMs": 39 }, "memory_heap": { "status": "up" } }, "error": {}, "details": { … } }
```

Unhealthy checks return `503` with the same structure.

---

## 4. Security notes

- Passwords are argon2id (19 MiB, 2 passes). A sign-in attempt against an unknown
  account still performs a verification, so timing does not reveal who exists.
- Password policy: at least 8 characters, not a known-weak password, not a single
  repeated character or a simple sequence, and not the account's own email,
  student ID or phone number.
- OTPs are stored as argon2 hashes; activation and reset links as SHA-256 hashes
  of 32 random bytes. Nothing logs a code, a token or a password — the logger
  redacts `authorization`, `cookie`, `password`, `code`, `token`, `refreshToken`
  and every `*Hash` field.
- Validation runs with `whitelist` + `forbidNonWhitelisted`: unknown properties
  are a `400`, not silently ignored.
- `helmet`, `compression` and a configurable CORS allow-list are applied globally.
