# How each client's copy works

EduTrack is one product sold to many institutes. Every buyer gets the same
features; what they put in it — subjects, batches, fee rules, staff roles — is
entirely theirs, and **no institute can ever see another's data**.

## The isolation rule

> **One client = one deployment = one database.**

Nothing is shared between clients: not a table, not a row, not a connection.
There is no "which institute is this?" filter that could be got wrong, because
a client's application instance is only ever connected to that client's own
database.

```
                    ┌──────────────────────────────┐
apex.edutrack.app → │ EduTrack API + web (instance) │ → apex_db       (Apex Academy)
                    └──────────────────────────────┘
                    ┌──────────────────────────────┐
brightk.edutrack…  → │ EduTrack API + web (instance)│ → brightk_db   (Bright Kids)
                    └──────────────────────────────┘
```

A git clone is **not** how a client receives the software: that would hand them
source code, not a running system, and they would never get fixes. Clients
receive a running instance and credentials.

### Why not one big shared database with a tenant column?

That is the usual SaaS shortcut and it is cheaper to run, but every query then
depends on getting a filter right, and one mistake shows one client another's
students. The application keeps its internal tenant scoping as a second line of
defence, but the real guarantee is structural: separate databases.

## Who runs it

**We host it** (decided 2026-09-29). Each client gets their own instance and
database on our infrastructure, reachable at their own subdomain. Tuition
centres have no IT staff, no server and no way to expose a service safely to
parents' phones — hosting it for them removes all of that, while keeping the
isolation they would get from running it themselves.

A self-hosted bundle remains possible from the same code for a buyer who
insists data stays on their premises; it is not the default.

## Provisioning a new client

Creating a client is a scripted, repeatable operation:

1. Create an empty database and a database user that can reach only that database.
2. Run the migrations.
3. Bootstrap the institute: its code, name and the **built-in roles only**
   (Administrator and Faculty) — no demo data.
4. Create the owner's account and email them a one-time activation link. They
   set their own password; we never hold it.
5. Point the subdomain at the instance, with automatic TLS.
6. Register the database in the backup schedule.

Everything after that is the institute's own doing: their branding, campuses,
subjects, batches, fee rules, their own extra staff roles, their students, and
the invitations that give parents and students their logins.

## Keeping clients separate in practice

| Concern | How it is handled |
|---|---|
| Data isolation | Separate database per client; separate DB credentials per instance |
| Access | Each person signs in against their own institute only; staff roles are defined by that institute |
| Backups | Per-client schedule; a restore only ever touches one client |
| Updates | Same image rolled out per instance; migrations run per database |
| Deletion / exit | Drop that client's database and instance; nothing of theirs lives anywhere else |
| Secrets | Per-instance keys; no shared signing key across clients |
| Demo data | Only when `DEMO_MODE=true` — never in a client's instance |

## Scale target

Sized for **up to ~5,000 students per institute** (decided 2026-09-29): roughly
3–8 million attendance records over five academic years, plus invoices,
payments and assessment scores.

What that means in practice:

- Every list endpoint is paginated and filtered in the database, never in memory.
- Composite indexes on the hot paths: attendance by batch and date, invoices by
  student and period, payments by date.
- Reports aggregate in SQL over a date range rather than loading rows.
- Bulk admission and bulk attendance imports write in batches.
- Old academic years can be archived; attendance can be partitioned by month if
  a client ever outgrows the target.
- A load test with a full-size synthetic institute is part of the test suite, so
  the common screens are proven to stay fast at that volume.
