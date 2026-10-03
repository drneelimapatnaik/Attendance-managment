# Operations runbook

How we onboard a client, roll a release out to every client, back things up and
offboard. This is operator work: it runs from a laptop or an ops box, never from
inside a client's instance.

> **The API never reads anything in this document.** The provisioning CLIs in
> `scripts/` are the only thing that sees more than one client, and they live on
> the operator's machine. A client's running instance knows its own
> `DATABASE_URL` and nothing else.

The rule everything here follows is the one in
[`../../docs/HOSTING.md`](../../docs/HOSTING.md):

> **One client = one deployment = one database.**

---

## What the operator machine needs

| | |
|---|---|
| Node 20+ and this repo | `cd backend && npm install` |
| `ADMIN_DATABASE_URL` | A maintenance database (usually `postgres`) with a role holding `CREATEDB` and `CREATEROLE`. **Never give this to a client instance.** |
| `CLIENT_REGISTRY_PATH` | Where the registry JSON lives, e.g. `./ops/clients.json`. Required by every `client:*` command. |
| `pg_dump` | Either on `PATH` (`PG_DUMP_BIN`), or set `PG_TOOLS_DOCKER_CONTAINER=edutrack-db` to dump through the Docker container — a Windows ops laptop usually has no Postgres client tools. |
| `WEB_APP_URL` | Used to build the owner's activation link. Set it to the client's real web address before provisioning. |

`.env.example` documents all of them. `/ops/` and `clients*.json` are
git-ignored: the registry holds connection strings, and the backups directory
holds customer data.

---

## The client registry

A plain JSON file listing every client database. There is deliberately **no
central shared database** of clients — that would be the one piece of shared
state the isolation model exists to avoid.

Each entry names its connection string in one of two ways:

| Mode | Where the URL lives | Use when |
|---|---|---|
| `--secrets file` (default) | In the registry file itself | Small fleet. **The file is then a secret**: `chmod 600`, git-ignored, backed up encrypted. |
| `--secrets env` | Only in `CLIENT_DB_URL_<CODE>` | A secret manager injects the environment. The file holds just the variable's name. |

Resolution always prefers the environment variable, so rotating a password takes
effect without editing the file. Writes are atomic (temp file + rename), because
`clients:migrate` updates the registry after every client and must never leave it
half-written.

### Backing up the registry

The registry is not reconstructible from the databases — it is what tells you
which databases are clients in the first place, and in `--secrets file` mode it
is also the credential store. So:

- Back it up **encrypted**, separately from the client dumps, on every change.
  `age -r <key> ops/clients.json > clients.json.age` or your password manager's
  file attachment are both fine; a plaintext copy in cloud storage is not.
- Keep the previous version. The file is small and a bad hand-edit is the most
  likely way to lose it.
- If it is lost in `--secrets env` mode you can rebuild it: the databases are
  named `<CLIENT_DB_PREFIX><code>`, so `psql -l` lists them and each database's
  `tenants` row gives the institute code and name.
- If it is lost in `--secrets file` mode, the passwords are gone with it. Rotate
  each client's role password and re-register them.

A corrupt file fails loudly rather than being overwritten — `client:list` and
every other command refuse to start.

---

## Onboarding a client

One command does steps 1–4 of `docs/HOSTING.md › Provisioning a new client`:

```bash
npm run client:create -- --code APEX --name "Apex Academy" \
    --owner-email priya@apexacademy.in --owner-name "Priya Sharma"
```

In order, it:

1. **Creates the database and a least-privilege role** that owns it. `PUBLIC` is
   revoked, so no other role in the cluster can even connect. The role is
   `NOSUPERUSER NOCREATEDB NOCREATEROLE`.
2. **Runs `prisma migrate deploy`** against that database only, with
   `DATABASE_URL` set for the child process — never taken from the ambient
   environment.
3. **Bootstraps the institute**: code, name, settings, one campus, and the two
   built-in roles (Administrator and Faculty). **No demo data** unless you pass
   `--demo`.
4. **Creates the owner's staff record** and prints a one-time activation link.
   No password is generated, transmitted or stored by us — the owner sets their
   own.
5. **Registers the client**, recording the migration version it landed on.
6. **Prints a handover block** to paste into an email, and, separately, an
   operator record containing the connection string. **The connection string is
   printed once.**

Useful flags: `--timezone` (default `Asia/Kolkata`), `--campus` (default
`Main Campus`), `--contact-phone`, `--address`, `--notes` (stored in the
registry), `--secrets env`, `--demo`.

### Then, by hand

The script stops at the database boundary; the rest is infrastructure:

- Set that `DATABASE_URL` and **two fresh JWT secrets** on the client's instance.
  Never reuse another client's keys — a shared signing key would let a token from
  one institute be presented to another.
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- Set `CORS_ORIGINS` and `WEB_APP_URL` to the client's own subdomain, and
  `SWAGGER_ENABLED=false`.
- Point the subdomain at the instance, with automatic TLS.
- Add the database to the backup schedule (below).
- Verify: `GET https://<subdomain>/health` returns ok, then sign in as the owner
  and confirm the first-run setup wizard appears — an institute with demo data in
  it has been provisioned wrongly.

### If it fails part-way

Postgres cannot roll back `CREATE DATABASE`, so the script is not transactional
across steps. A failure leaves a named database behind and says so, and a rerun
with the same code **refuses** rather than adopting it. Undo it deliberately:

```bash
npm run client:drop -- --code APEX --yes-really --skip-backup
```

(`--skip-backup` is safe here and only here: nothing has been entered yet.)

---

## Day to day

```bash
npm run client:list                    # registry only — opens no connections
npm run client:list -- --check         # also connect to each database
npm run client:list -- --check --sizes # and report size on disk
```

`--check` connects to each client in turn, one at a time, closing each connection
immediately — it is safe against production. It reports each client's migration
version, tenant row and student count, which is how you spot a client that is
behind on a release or unreachable.

A `MISSING` in the secrets column means the registry has no URL for that client
and the expected environment variable is unset. Fix that before the next release.

---

## Releasing

A release is not one migration but N, and they can disagree — a client whose
instance was down during the last rollout is a version behind.

```bash
npm run clients:migrate -- --dry-run          # what is pending, change nothing
npm run clients:migrate                       # apply to every client
npm run clients:migrate -- --only APEX,BRIGHTK
```

It reads each database's version from `_prisma_migrations` **before and after**
its deploy — the only trustworthy answer to "did it land?" — prints one row per
client, and records the new version in the registry immediately after each
success, so an interrupted run still leaves an accurate record.

One client failing does not stop the others: that failure is that client's
problem, and halting would leave the rest un-migrated for no reason. The command
exits non-zero if any client failed, so CI notices.

Order of operations for a release: migrate the databases first (migrations are
written to be backwards-compatible with the previous application version), then
roll the new image out per instance.

### When a migration fails halfway

The usual cause is a migration that cannot apply to *that* client's data — a
unique index over rows that are not unique there, a `NOT NULL` on a column that
client left empty. Prisma records such a migration as started and never finished,
and **a database in that state blocks every later deploy**, including
`clients:migrate`. You will see it as `Migration(s) … started and never finished`.

Work on that one client's database, with its own `DATABASE_URL`:

```bash
export DATABASE_URL="<that client's URL>"     # PowerShell: $env:DATABASE_URL="…"
npx prisma migrate status
```

Then either:

- **The migration's changes did not land.** Fix the data that blocked it, then
  mark the failed attempt as rolled back so Prisma will try again:
  ```bash
  npx prisma migrate resolve --rolled-back 20260929145518_scale_indexes
  npx prisma migrate deploy
  ```
- **The changes did land** (the failure was in a later statement, and you have
  since completed it by hand). Record it as applied:
  ```bash
  npx prisma migrate resolve --applied 20260929145518_scale_indexes
  ```

Never edit `_prisma_migrations` by hand, and never `prisma migrate dev` or
`migrate reset` against a client — `dev` writes new migration files from a drift
comparison and `reset` drops the database. Afterwards, rerun
`npm run clients:migrate -- --only <CODE>` so the registry records the new
version, and `client:list --check` to confirm the fleet agrees.

If the migration is wrong for every client, the fix is a new migration, not an
edit to the old one: the applied ones are already in other clients' databases.

---

## Backups and restore

Per-client schedule, because a restore must only ever touch one client. The dumps
`client:drop` writes are custom-format (`pg_dump --format=custom`, compressed,
`--no-owner --no-privileges`), and that is the format to standardise on:

```bash
pg_dump --format=custom --no-owner --no-privileges \
        --file edutrack_apex-$(date -u +%Y%m%dT%H%M%SZ).dump \
        --dbname "$CLIENT_DB_URL_APEX"
```

Restore into a fresh database — never over a live one:

```bash
createdb edutrack_apex_restore
pg_restore --dbname "postgresql://…/edutrack_apex_restore" \
           --no-owner --no-privileges edutrack_apex-20260930T101500Z.dump
```

Then point a throwaway instance at it to verify before swapping anything over.
Backups are customer data: encrypt them at rest, keep them out of the repo
(`/ops/` is git-ignored for this reason), and give them the retention the client's
contract requires — no longer.

Test a restore on a schedule. An untested backup is a guess.

---

## Offboarding

Irreversible, and the only script here that destroys data.

```bash
npm run client:drop -- --code APEX              # dry run: prints the plan, changes nothing
npm run client:drop -- --code APEX --yes-really
```

Without `--yes-really` it prints what it *would* do — including a count of the
students, sessions, attendance records, invoices and payments it is about to
delete — and exits 0. Read that line before confirming.

With `--yes-really` it takes a `pg_dump` backup first and prints its path and
size (**no backup, no drop**; `--skip-backup` is for scratch databases only),
drops that client's database and role and nothing else, and removes them from the
registry **last** — so a failure leaves a record of a database that still exists
rather than an orphan.

Remaining manual steps:

- Stop and delete the client instance, and remove its subdomain and TLS
  certificate.
- Remove the database from the backup schedule and delete its per-instance
  secrets (JWT keys, database password).
- Keep the final dump for as long as the contract requires, then destroy it.
- Tell the client where their final export is and when it will be deleted.

---

## Load testing

Proof that the scale target in `docs/HOSTING.md` holds, run against a full-size
synthetic institute in a scratch database — never against a client:

```bash
npm run loadtest:seed -- --students 5000 --years 5
npm run loadtest:run                 # timings + EXPLAIN per query
npm run loadtest:run -- --write-docs # regenerate docs/PERFORMANCE.md
npm run loadtest:drop
```

`loadtest:seed` creates `edutrack_loadtest_<stamp>`, fills it, and writes
`.loadtest.json` for the benchmark to pick up. Both the seed and the drop refuse
any database that is not named `edutrack_loadtest_*` or that appears in the client
registry. Those two checks are the only thing between "prove it scales" and
"load-test production" — do not weaken them.

The committed results are in [`PERFORMANCE.md`](PERFORMANCE.md).

---

## Things never to do

| Never | Because |
|---|---|
| Put `ADMIN_DATABASE_URL` on a client instance | It can create and drop databases, including other clients'. |
| Reuse JWT secrets between clients | A token minted for one institute would verify at another. |
| Provision a paying client with `--demo` | Their institute must start empty; the owner sets it up. |
| `prisma migrate dev` or `migrate reset` against a client | `dev` invents migrations from drift; `reset` drops the database. |
| Commit `ops/`, `clients.json`, `*.dump` or a real `.env` | Connection strings, passwords and customer data. All git-ignored — keep it that way. |
| Query across clients | There is nothing to query across. If you want fleet-wide numbers, loop on the ops box. |
