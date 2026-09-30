/**
 * Cluster-level Postgres operations for provisioning and offboarding a client.
 *
 * These run as an administrator (`ADMIN_DATABASE_URL` — a role with CREATEDB and
 * CREATEROLE), which is why they live in an operator CLI and never in the API
 * process: the running application only ever holds its own client's
 * least-privilege credentials.
 *
 * The privilege model each client gets:
 *
 *   CREATE ROLE  <db>_app  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
 *   CREATE DATABASE <db> OWNER <db>_app
 *   REVOKE ALL ON DATABASE <db> FROM PUBLIC          -- nobody else may connect
 *   REVOKE ALL ON SCHEMA public FROM PUBLIC          -- belt and braces on PG < 15
 *
 * The role owns its own database and nothing else, so it can run migrations there
 * and cannot see, connect to, or create any other database in the cluster. That is
 * the structural half of the isolation guarantee; the app's tenant scoping is the
 * second line of defence and stays in place.
 *
 * DDL goes through Prisma's raw interface rather than a new `pg` dependency.
 * `CREATE DATABASE` cannot run inside a transaction, and Prisma sends a bare
 * `$executeRawUnsafe` as its own statement, so this works — but it also means
 * every identifier must be validated and quoted here, by hand.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { CliError } from './cli';

/** Identifiers we are willing to create. Deliberately narrower than Postgres allows. */
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{2,62}$/;

/** Institute codes: upper-case, what the client types at sign-in. */
export const CLIENT_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,15}$/;

export function assertClientCode(code: string): string {
  const value = code.trim().toUpperCase();
  if (!CLIENT_CODE_PATTERN.test(value)) {
    throw new CliError(
      `"${code}" is not a usable institute code.`,
      'Use 2–16 characters: an upper-case letter followed by letters or digits, e.g. APEX or BRIGHTK2.',
    );
  }
  return value;
}

/** Quotes an identifier we generated ourselves, after re-checking its shape. */
export function quoteIdent(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) throw new CliError(`Refusing to use "${name}" as a Postgres identifier.`);
  return `"${name}"`;
}

/** Quotes a string literal for DDL (passwords, names). Doubles single quotes. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface ClientNames {
  code: string;
  database: string;
  role: string;
}

/**
 * Database and role names derived from the institute code.
 * `CLIENT_DB_PREFIX` (default `edutrack_`) keeps a shared cluster tidy.
 */
export function clientNames(code: string): ClientNames {
  const upper = assertClientCode(code);
  const prefix = (process.env.CLIENT_DB_PREFIX ?? 'edutrack_').toLowerCase();
  const database = `${prefix}${upper.toLowerCase()}`;
  const role = `${database}_app`;
  if (!SAFE_IDENTIFIER.test(database) || !SAFE_IDENTIFIER.test(role)) {
    throw new CliError(`CLIENT_DB_PREFIX "${prefix}" produces an unusable database name "${database}".`, 'Use lower-case letters, digits and underscores.');
  }
  return { code: upper, database, role };
}

/** A Prisma client bound to an explicit URL (no dependency on process env). */
export function clientFor(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
}

/** The administrator connection used for CREATE/DROP DATABASE and ROLE. */
export function adminClient(): PrismaClient {
  const url = process.env.ADMIN_DATABASE_URL?.trim();
  if (!url) {
    throw new CliError(
      'ADMIN_DATABASE_URL is not set.',
      'It must point at a maintenance database (usually `postgres`) with a role that has CREATEDB and CREATEROLE — see .env.example.',
    );
  }
  return clientFor(url);
}

/**
 * Builds the connection string a client instance will use.
 *
 * Host and port come from `ADMIN_DATABASE_URL` so the two always agree, unless
 * `CLIENT_DB_HOST` / `CLIENT_DB_PORT` override them — which they must when the
 * admin CLI runs on the host (`localhost:5432`) but the application runs inside a
 * container network where the same server is `db:5432`.
 */
export function buildClientUrl(database: string, role: string, password: string): string {
  const adminUrl = process.env.ADMIN_DATABASE_URL?.trim();
  if (!adminUrl) throw new CliError('ADMIN_DATABASE_URL is not set.');
  const parsed = new URL(adminUrl);
  const host = process.env.CLIENT_DB_HOST?.trim() || parsed.hostname;
  const port = process.env.CLIENT_DB_PORT?.trim() || parsed.port || '5432';
  const sslmode = new URLSearchParams(parsed.search).get('sslmode');
  const query = new URLSearchParams({ schema: 'public' });
  if (sslmode) query.set('sslmode', sslmode);
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@${host}:${port}/${database}?${query.toString()}`;
}

export async function databaseExists(admin: PrismaClient, database: string): Promise<boolean> {
  const rows = await admin.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM pg_database WHERE datname = ${database}`;
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function roleExists(admin: PrismaClient, role: string): Promise<boolean> {
  const rows = await admin.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM pg_roles WHERE rolname = ${role}`;
  return Number(rows[0]?.count ?? 0) > 0;
}

export interface ProvisionResult {
  database: string;
  role: string;
  password: string;
  /** False when the role already existed and its password was rotated instead. */
  roleCreated: boolean;
}

/**
 * Creates the client's role and database. Fails rather than reusing an existing
 * database: adopting one would risk pointing a new client at another's data.
 */
export async function provisionDatabase(admin: PrismaClient, names: ClientNames, password: string): Promise<ProvisionResult> {
  if (await databaseExists(admin, names.database)) {
    throw new CliError(
      `Database ${names.database} already exists.`,
      'Refusing to reuse it. Drop it deliberately (`npm run client:drop`) or choose another institute code.',
    );
  }

  const existingRole = await roleExists(admin, names.role);
  if (existingRole) {
    // A left-over role from a failed run: rotate its password rather than fail,
    // so a retry of `client:create` is not blocked by half-made state.
    await admin.$executeRawUnsafe(`ALTER ROLE ${quoteIdent(names.role)} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  } else {
    await admin.$executeRawUnsafe(
      `CREATE ROLE ${quoteIdent(names.role)} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
  }

  // The role owns the database, so `prisma migrate deploy` can run as the client's
  // own user and no shared owner exists across clients.
  await admin.$executeRawUnsafe(`CREATE DATABASE ${quoteIdent(names.database)} OWNER ${quoteIdent(names.role)} ENCODING 'UTF8'`);
  // Nobody but this role (and the administrator) may connect.
  await admin.$executeRawUnsafe(`REVOKE ALL ON DATABASE ${quoteIdent(names.database)} FROM PUBLIC`);
  await admin.$executeRawUnsafe(`GRANT CONNECT, TEMPORARY ON DATABASE ${quoteIdent(names.database)} TO ${quoteIdent(names.role)}`);

  // Inside the new database: PG 15+ already removes CREATE on `public` from
  // PUBLIC, but say it anyway so an older server behaves the same.
  const inside = clientFor(adminUrlForDatabase(names.database));
  try {
    await inside.$executeRawUnsafe(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
    await inside.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO ${quoteIdent(names.role)}`);
  } finally {
    await inside.$disconnect();
  }

  return { database: names.database, role: names.role, password, roleCreated: !existingRole };
}

/** The administrator URL, repointed at another database in the same cluster. */
export function adminUrlForDatabase(database: string): string {
  const adminUrl = process.env.ADMIN_DATABASE_URL?.trim();
  if (!adminUrl) throw new CliError('ADMIN_DATABASE_URL is not set.');
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Drops a client's database and role. Open sessions are terminated first — a
 * forgotten instance still holding a connection would otherwise block the drop.
 */
export async function dropDatabase(admin: PrismaClient, names: ClientNames, dropRole: boolean): Promise<void> {
  await admin.$executeRawUnsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(names.database)} AND pid <> pg_backend_pid()`,
  );
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${quoteIdent(names.database)}`);
  if (dropRole && (await roleExists(admin, names.role))) {
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(names.role)}`);
  }
}

/** Size on disk, for `client:list`. Null when the database is unreachable. */
export async function databaseSize(admin: PrismaClient, database: string): Promise<string | null> {
  try {
    const rows = await admin.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(${database})) AS size`;
    return rows[0]?.size ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- pg_dump

export interface DumpResult {
  path: string;
  bytes: number;
  command: string;
}

/**
 * Takes a `pg_dump` custom-format backup of one database.
 *
 * Two ways to reach the tool, because a Windows ops laptop usually has no
 * Postgres client installed while the server runs in Docker:
 *
 *   PG_TOOLS_DOCKER_CONTAINER=edutrack-db   → `docker exec … pg_dump`, stdout piped
 *                                             to the local file
 *   otherwise                               → `PG_DUMP_BIN` (default `pg_dump`)
 *
 * The dump is written with `--format=custom`, which `pg_restore` reads and which
 * compresses; see docs/OPERATIONS.md for the restore command.
 */
/**
 * Prisma connection strings carry `?schema=public` (and sometimes pool tuning),
 * but libpq tools — pg_dump, pg_restore, psql — reject those as invalid URI
 * parameters. Strip the Prisma-only ones before handing a URL to them.
 */
export function libpqUrl(url: string): string {
  const parsed = new URL(url);
  for (const key of ["schema", "connection_limit", "pool_timeout", "socket_timeout", "pgbouncer"]) {
    parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

export async function dumpDatabase(url: string, outPath: string): Promise<DumpResult> {
  const container = process.env.PG_TOOLS_DOCKER_CONTAINER?.trim();
  const bin = process.env.PG_DUMP_BIN?.trim() || 'pg_dump';

  // The URL is passed on stdin-free argv; the password inside it is visible to
  // `ps` on the ops box for the life of the dump, which is why these commands run
  // on an operator machine and not on a shared host.
  const [command, args] = container
    ? ['docker', ['exec', '-i', container, bin, '--format=custom', '--no-owner', '--no-privileges', '--dbname', dockerReachableUrl(libpqUrl(url))]]
    : [bin, ['--format=custom', '--no-owner', '--no-privileges', '--file', outPath, '--dbname', libpqUrl(url)]];

  mkdirSync(dirname(outPath), { recursive: true });

  const chunks: Buffer[] = [];
  const stderr: string[] = [];

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    // In the docker path the dump comes back on stdout; in the local path pg_dump
    // writes the file itself and stdout stays empty.
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
    child.on('error', (error) =>
      reject(
        new CliError(
          `Could not run ${command}: ${error.message}`,
          container
            ? `Is the container "${container}" running?`
            : 'Install the Postgres client tools, set PG_DUMP_BIN, or set PG_TOOLS_DOCKER_CONTAINER to dump through Docker.',
        ),
      ),
    );
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new CliError(`${command} exited with code ${code}.`, stderr.join('').trim() || undefined));
    });
  });

  if (container) writeFileSync(outPath, Buffer.concat(chunks));
  const bytes = statSync(outPath).size;
  if (bytes === 0) throw new CliError(`The dump at ${outPath} is empty — refusing to treat it as a backup.`);
  return { path: outPath, bytes, command: `${command} ${args.join(' ')}` };
}

/**
 * Inside the database container the server is always `localhost`, whatever the
 * ops box calls it. Rewriting the host keeps one connection string working in
 * both places.
 */
function dockerReachableUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = 'localhost';
  parsed.port = '5432';
  return parsed.toString();
}

/** A password suitable for a connection string: URL-safe, 192 bits of entropy. */
export function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}
