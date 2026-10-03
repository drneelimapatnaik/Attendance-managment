# EduTrack API — authentication & conventions

Base URL: `/api/v1` (health checks live outside it, at `/health`).
Interactive docs: `/docs` (Swagger UI, off in production unless `SWAGGER_ENABLED=true`).

Everything below is what the API ships today: tenancy, authentication, roles and
staff. The remaining domain endpoints (students, batches, attendance, fees,
reports) arrive in the next wave and will follow the same conventions.

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

### Roles and permissions

**Four role kinds are built in and always exist:** `admin` and `faculty` (staff)
plus `student` and `parent` (portal logins — see `PortalAccount`, unrelated to
staff roles). **Every other staff role is created by the institute itself** —
"Accountant", "Front Desk", "Counsellor", "Branch Head" — each with a permission
set chosen from the fixed capability catalogue.

So there is no role → permission matrix in the API. A role is a row:

```json
{
  "id": "…", "key": "accountant", "name": "Accountant",
  "description": "Handles fees and receipts.",
  "permissions": ["dashboard.view", "students.view", "fees.view", "fees.collect"],
  "isSystem": false
}
```

- `key` is a stable slug (`admin`, `faculty`, `accountant`). Code may branch on it.
- `name` is the institute's label and may be renamed at any time, system roles
  included.
- `permissions` holds catalogue keys only. `GET /permissions` is the catalogue.
- `isSystem` is true for `admin` and `faculty`: they cannot be deleted, and `admin`
  can never lose `faculty.manage` or `settings.manage`.

A staff member carries `roleId` (plus `roleKey` and `roleName` for convenience) and
`isOwner`. **The owner** — the account that set the institute up — holds every
capability whatever their role row says, and cannot be demoted, deactivated or
deleted.

`PermissionsGuard` and `GET /auth/me` read the signed-in member's role row on every
request (cached per request), so editing a role takes effect immediately: an access
token issued a minute ago is already subject to the new rules. A missing permission
returns `403 PERMISSION_DENIED` with the required and missing permissions in
`details`. An account deleted or deactivated since its token was issued is refused
too (`401 UNAUTHORIZED` / `403 ACCOUNT_INACTIVE`).

The 14 capabilities, by area:

| Area | Capabilities |
|---|---|
| Dashboard | `dashboard.view` |
| Attendance | `attendance.mark`, `attendance.reports` |
| Students | `students.view`, `students.manage` |
| Batches | `batches.view`, `batches.manage` |
| Syllabus | `topics.manage` |
| Fees | `fees.view`, `fees.collect` |
| Performance | `performance.view`, `performance.manage` |
| Staff & roles | `faculty.manage` |
| Institute settings | `settings.manage` |

A fresh institute starts with **Administrator** (`admin`, all 14) and **Faculty**
(`faculty`: `dashboard.view`, `attendance.mark`, `attendance.reports`,
`students.view`, `batches.view`, `topics.manage`, `performance.view`,
`performance.manage`, and pre-selected in the invite form).

Student and parent logins are not staff: they never pass a permission check.
Instead they are limited to the students linked to their account — a parent may
read their own children and nothing else (`403 PORTAL_SCOPE_DENIED`).

### The privilege-escalation rule

Nobody may raise their own authority. Enforced server-side on every role and staff
write, and reported as `403 PRIVILEGE_ESCALATION`:

1. **You cannot grant what you do not hold.** A non-owner creating or editing a
   role may only *add* capabilities they hold themselves. `details.escalated` names
   the ones refused. Leaving a capability a role already had in place is not
   granting it, so an accountant may rename the Administrator role without holding
   `settings.manage`.
2. **You cannot edit or delete your own role.** A non-owner may not `PATCH` or
   `DELETE` the role they are assigned to — that is the same loophole by another
   door. Ask another administrator, or the owner.
3. **You cannot change your own role, nor assign a role stronger than yours.**
   `PATCH /staff/:id` with a `roleId` is refused when the target is yourself (for a
   non-owner), and when the role grants a capability the caller lacks — the same
   check applies to `POST /staff`.

The owner is exempt from all three: they already hold everything.

Separately, **the institute must always keep at least one active administrator**
(`409 ROLE_LAST_ADMIN`). "Administrator" here means an Active staff member who is
the owner, or whose role holds both `faculty.manage` and `settings.manage` — so an
institute's own "Branch Head" role with full rights satisfies the rule, and
renaming Administrator changes nothing. Every mutation that could reduce that count
is checked: editing a role's permissions, deleting a role with reassignment,
changing or deactivating a staff member, and deleting one.

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
| `PRIVILEGE_ESCALATION` | 403 | Tried to grant more than you hold, or to edit your own role |
| `OWNER_PROTECTED` | 403 | The owner cannot be demoted, deactivated or deleted |
| `PORTAL_SCOPE_DENIED` | 403 | Student/parent asked for someone else's records |
| `TENANT_MISMATCH` | 403 | `X-Tenant` disagrees with the token |
| `TENANT_SUSPENDED` | 403 | Institute is not active |
| `TENANT_NOT_FOUND` | 404 | No institute with that code |
| `NOT_FOUND` | 404 | No such record |
| `CONFLICT` | 409 | Unique constraint or a record still referenced |
| `ROLE_NAME_TAKEN` / `ROLE_KEY_TAKEN` | 409 | Another role of this institute uses that name or key |
| `ROLE_KEY_RESERVED` | 409 | `admin`, `faculty`, `student`, `parent` and `owner` belong to the product |
| `ROLE_SYSTEM_PROTECTED` | 409 | Built-in role: cannot be deleted, and `admin` cannot lose its two markers |
| `ROLE_IN_USE` | 409 | Role still assigned — `details.staffCount`; retry with `?reassignTo=` |
| `ROLE_LAST_ADMIN` | 409 | Would leave the institute with no active administrator |
| `STAFF_EMAIL_TAKEN` | 409 | Another staff member uses that email |
| `STAFF_TEACHES_ACTIVE_BATCH` | 409 | Still the faculty of a live batch — `details.batches` |
| `STAFF_HAS_HISTORY` | 409 | Attendance/receipts/archived batches must be kept — deactivate instead |
| `STAFF_SELF_DELETE` | 409 | You cannot remove your own account |
| `STAFF_ALREADY_ACTIVE` | 409 | Cannot resend an invitation to somebody who has a password |
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
now — including `permissions`, which is read from the staff member's role row, and
`role`, a trimmed `Role` object. Both are present for staff only.

```json
{
  "principal": "staff",
  "user": { "…": "Staff", "roleId": "…", "roleKey": "admin", "isOwner": true },
  "permissions": ["dashboard.view", "…"],
  "role": { "id": "…", "key": "admin", "name": "Administrator", "permissions": ["…"] }
}
```

`permissions` is what the account may do (everything, for an owner); `role.permissions`
is what the role itself grants.

---

## 3. Roles

Reads need any staff session. Writes need `faculty.manage`.

### `GET /permissions`

The capability catalogue, so the permission picker hardcodes nothing.

```json
{
  "groups": [
    {
      "area": "fees",
      "label": "Fees",
      "permissions": [
        { "key": "fees.view", "label": "View fees", "description": "Read invoices, dues and collection reports." },
        { "key": "fees.collect", "label": "Collect fees & issue receipts", "description": "Record a payment and issue a receipt." }
      ]
    }
  ],
  "all": ["dashboard.view", "attendance.mark", "…"]
}
```

Groups and the capabilities inside them are in a stable order — the reading order
of the picker is part of the contract.

### `GET /roles`

Every role of the institute: system roles first, then the institute's own, each
alphabetical, each with `staffCount`.

```json
[
  { "id": "…", "key": "admin", "name": "Administrator", "description": "…", "permissions": ["…14 keys…"], "isSystem": true, "isDefault": false, "staffCount": 2 },
  { "id": "…", "key": "faculty", "name": "Faculty", "description": "…", "permissions": ["…8 keys…"], "isSystem": true, "isDefault": true, "staffCount": 5 },
  { "id": "…", "key": "accountant", "name": "Accountant", "description": "…", "permissions": ["…"], "isSystem": false, "isDefault": false, "staffCount": 1 }
]
```

The two built-in roles are created on the fly if they are missing, so an institute
always has them however its tenant row was created.

### `GET /roles/:id`

One role. Another institute's role id is `404 NOT_FOUND` — never a 403, which would
confirm it exists.

### `POST /roles` → `201`

```json
{
  "name": "Front Desk",
  "description": "Admissions and the daily roster.",
  "permissions": ["dashboard.view", "students.view", "students.manage", "attendance.mark"],
  "isDefault": false
}
```

- `key` is optional and derived from the name (`Front Desk` → `front_desk`). Send it
  explicitly to choose the slug, or when the name yields none (`400 VALIDATION_FAILED`).
- `permissions` must be catalogue keys; unknown ones are `400 VALIDATION_FAILED` with
  `details.unknown`.
- `isDefault: true` moves the flag: at most one role per institute is the default.
- New roles are always `isSystem: false`.
- Failures: `400 VALIDATION_FAILED`, `403 PRIVILEGE_ESCALATION`, `409 ROLE_NAME_TAKEN`,
  `409 ROLE_KEY_TAKEN`, `409 ROLE_KEY_RESERVED`.

### `PATCH /roles/:id`

Any of `name`, `description`, `permissions`, `isDefault`. `key` and `isSystem` are
not editable.

- A **system role may be renamed** — the label belongs to the institute — but not
  into a clash (`409 ROLE_NAME_TAKEN`).
- The **`admin` role may never lose** `faculty.manage` or `settings.manage`
  (`409 ROLE_SYSTEM_PROTECTED`, with `details.stripped`). Other capabilities may be
  removed from it.
- A permission change that would leave no active administrator is
  `409 ROLE_LAST_ADMIN`.
- A non-owner editing their own role, or adding a capability they do not hold, is
  `403 PRIVILEGE_ESCALATION`.

### `DELETE /roles/:id`

`200` → `{ "deleted": true, "reassigned": 0 }`

- A system role is never deleted (`409 ROLE_SYSTEM_PROTECTED`).
- A role somebody still holds is refused with the count:

  ```json
  { "statusCode": 409, "code": "ROLE_IN_USE", "message": "1 person holds this role. Pass ?reassignTo=<roleId> to move them to another role first.", "details": { "staffCount": 1, "roleId": "…" } }
  ```

  Repeat with **`?reassignTo=<roleId>`** and the holders are moved first, then the
  role is deleted: `{ "deleted": true, "reassigned": 1 }`. The target must be a
  different role of the same institute.
- A non-owner cannot delete their own role (`403 PRIVILEGE_ESCALATION`), and no
  delete may leave the institute without an active administrator
  (`409 ROLE_LAST_ADMIN`).

---

## 4. Staff

`GET` needs any staff session — batch and attendance screens list colleagues.
Everything else needs `faculty.manage`.

### `GET /staff`

| Query | Meaning |
|---|---|
| `roleId` | uuid — only holders of that role |
| `roleKey` | the same filter by slug, e.g. `faculty` |
| `status` | `Active` \| `Inactive` \| `Invited` |
| `search` | case-insensitive match on name, email, phone or title |
| `page` / `pageSize` | default `1` / `25`, max page size `200` |

```json
{
  "items": [
    {
      "id": "…", "name": "Ms. Kavya Nair", "email": "accounts@apexacademy.in", "phone": "+91 98457 88990",
      "roleId": "…", "roleKey": "accountant", "roleName": "Accountant", "isOwner": false,
      "title": "Accounts Executive", "subjectIds": [], "status": "Active",
      "joinedOn": "2021-08-16", "lastActiveAt": "2026-09-29T09:15:00.000Z"
    }
  ],
  "total": 9, "page": 1, "pageSize": 25
}
```

### `GET /staff/:id`

One staff member, same shape as an item above.

### `POST /staff` → `201`

Invites somebody: creates an `Invited` member **with no password** and emails a
single-use activation link.

```json
{ "name": "Ms. Kavya Nair", "email": "accounts@apexacademy.in", "phone": "+91 98457 88990", "roleId": "…", "title": "Accounts Executive", "subjectIds": ["…"] }
```

```json
{
  "staff": { "…": "Staff", "status": "Invited" },
  "invitationExpiresAt": "2026-10-06T10:15:00.000Z",
  "devActivationUrl": "http://localhost:5173/activate?token=…"
}
```

- The link is single-use and valid for `ACTIVATION_TOKEN_TTL_HOURS` (168 by default).
  It is redeemed at **`POST /auth/portal/activate`**, which sets the password and
  signs them in — no temporary password is ever generated, stored or sent.
- `devActivationUrl` is present only outside production.
- Signing in before activating is `401 ACCOUNT_NOT_ACTIVATED`.
- Failures: `403 PRIVILEGE_ESCALATION` (the role grants more than you hold),
  `409 STAFF_EMAIL_TAKEN`, `404 NOT_FOUND` (unknown `roleId`),
  `400 VALIDATION_FAILED` (unknown subject).

### `PATCH /staff/:id`

Any of `name`, `email`, `phone`, `roleId`, `title`, `subjectIds`, `status`.
`subjectIds` replaces the whole list.

- The **owner** cannot have their role changed or be deactivated
  (`403 OWNER_PROTECTED`).
- A **non-owner cannot change their own role** (`403 PRIVILEGE_ESCALATION`), and
  nobody may assign a role that grants more than they hold.
- `status: "Active"` on somebody still `Invited` is `400 ACCOUNT_NOT_ACTIVATED` —
  they have no password; resend the invitation instead. Going back to `Invited` from
  an activated account is `400 VALIDATION_FAILED`.
- Deactivating or demoting the last administrator is `409 ROLE_LAST_ADMIN`.

### `POST /staff/:id/resend-invite`

`200`, same body as `POST /staff`. Issues a new link; the previous one stops
working. `409 STAFF_ALREADY_ACTIVE` if they already have a password.

### `DELETE /staff/:id`

`200` → `{ "deleted": true }`. Refused when:

| Code | Why |
|---|---|
| `403 OWNER_PROTECTED` | the account that set the institute up |
| `409 STAFF_SELF_DELETE` | your own account |
| `409 STAFF_TEACHES_ACTIVE_BATCH` | still the faculty of an Active or Upcoming batch — `details.batches` names them |
| `409 STAFF_HAS_HISTORY` | attendance registers, receipts or archived batches name them — set `status: "Inactive"` instead, which ends their access and keeps the history |
| `409 ROLE_LAST_ADMIN` | would leave no active administrator |

---

## 5. Health

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

## 6. Security notes

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
