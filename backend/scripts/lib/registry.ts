/**
 * The client registry: which client databases exist.
 *
 * One client = one deployment = one database (docs/HOSTING.md), so there is
 * deliberately **no central shared database** listing clients — that would be the
 * one piece of shared state the isolation model exists to avoid. Instead the
 * registry is a plain JSON file on the ops box, its path given by
 * `CLIENT_REGISTRY_PATH`. It is operator state, not application state: the API
 * never reads it, and a client's instance never sees it.
 *
 * Connection strings are secrets, so each entry names them in one of two ways:
 *
 *   databaseUrlEnv  the name of an environment variable holding the URL
 *                   (`CLIENT_DB_URL_APEX`) — use this when a secret manager
 *                   injects the environment. Always set.
 *   databaseUrl     the URL itself, stored in the file. Convenient for a small
 *                   fleet; the file is then a secret (chmod 600, git-ignored,
 *                   backed up encrypted). Written unless `--secrets env`.
 *
 * Resolution prefers the environment variable, so a rotated password takes effect
 * without editing the file.
 *
 * Writes are atomic (temp file + rename) because `clients:migrate` updates the
 * file after every client and must never leave it half-written.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { CliError } from './cli';

/** Bumped only if the on-disk shape changes incompatibly. */
export const REGISTRY_VERSION = 1;

export interface ClientEntry {
  /** Institute code, upper case — the tenant's `instituteCode` and the `X-Tenant` header. */
  code: string;
  /** Display name, for the handover email and `client:list`. */
  name: string;
  /** The Postgres database name (not the URL). */
  database: string;
  /** The least-privilege role the instance connects as. */
  databaseUser: string;
  /** Name of the environment variable that may hold this client's DATABASE_URL. */
  databaseUrlEnv: string;
  /** The URL itself, when the registry file is the secret store. */
  databaseUrl?: string;
  createdAt: string;
  /** Last `prisma migrate deploy` that finished cleanly against this database. */
  lastMigrationVersion?: string;
  lastMigrationAt?: string;
  /** Free-text operator note (ticket id, region, contact). */
  notes?: string;
}

export interface RegistryFile {
  version: number;
  clients: ClientEntry[];
}

/** Where the registry lives. Relative paths resolve against the backend directory. */
export function registryPath(): string {
  const configured = process.env.CLIENT_REGISTRY_PATH?.trim();
  if (!configured) {
    throw new CliError(
      'CLIENT_REGISTRY_PATH is not set.',
      'Point it at the JSON file that lists your client databases, e.g. CLIENT_REGISTRY_PATH=./ops/clients.json (see docs/OPERATIONS.md).',
    );
  }
  // `process.cwd()` is the backend directory: npm scripts run from package.json.
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

/** The conventional environment-variable name for a client's connection string. */
export function databaseUrlEnvName(code: string): string {
  return `CLIENT_DB_URL_${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/** Reads the registry, returning an empty one when the file does not exist yet. */
export function loadRegistry(): RegistryFile {
  const path = registryPath();
  if (!existsSync(path)) return { version: REGISTRY_VERSION, clients: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new CliError(`${path} is not valid JSON: ${(error as Error).message}`, 'Restore it from your backup (see docs/OPERATIONS.md › Backing up the registry).');
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as RegistryFile).clients)) {
    throw new CliError(`${path} does not look like a client registry.`, 'Expected { "version": 1, "clients": [ … ] }.');
  }

  const file = parsed as RegistryFile;
  if (file.version !== REGISTRY_VERSION) {
    throw new CliError(`${path} has version ${file.version}; this build understands version ${REGISTRY_VERSION}.`);
  }
  return file;
}

/**
 * Writes the registry atomically and tightens its permissions, because when
 * `--secrets file` is in use every connection string is in here.
 */
export function saveRegistry(file: RegistryFile): void {
  const path = registryPath();
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows has no POSIX mode bits; the rename above still succeeded.
  }
}

export function findClient(file: RegistryFile, code: string): ClientEntry | undefined {
  const wanted = code.trim().toUpperCase();
  return file.clients.find((client) => client.code === wanted);
}

/** Adds a client, refusing a duplicate code — two clients must never share a row. */
export function addClient(file: RegistryFile, entry: ClientEntry): RegistryFile {
  if (findClient(file, entry.code)) {
    throw new CliError(`Client ${entry.code} is already in the registry.`, 'Pick another code, or remove the old entry with `npm run client:drop`.');
  }
  return { ...file, clients: [...file.clients, entry].sort((a, b) => a.code.localeCompare(b.code)) };
}

export function removeClient(file: RegistryFile, code: string): RegistryFile {
  const wanted = code.trim().toUpperCase();
  return { ...file, clients: file.clients.filter((client) => client.code !== wanted) };
}

/** Replaces one entry in place (used to record a successful migration). */
export function updateClient(file: RegistryFile, code: string, patch: Partial<ClientEntry>): RegistryFile {
  const wanted = code.trim().toUpperCase();
  return { ...file, clients: file.clients.map((client) => (client.code === wanted ? { ...client, ...patch } : client)) };
}

/**
 * The connection string for a client: environment variable first, then the file.
 * Throws rather than returning undefined, because every caller needs it.
 */
export function resolveDatabaseUrl(entry: ClientEntry): string {
  const fromEnv = process.env[entry.databaseUrlEnv]?.trim();
  if (fromEnv) return fromEnv;
  if (entry.databaseUrl?.trim()) return entry.databaseUrl.trim();
  throw new CliError(
    `No connection string for client ${entry.code}.`,
    `Set ${entry.databaseUrlEnv}, or add "databaseUrl" to its entry in ${registryPath()}.`,
  );
}

/** True when the URL is available — used by `client:list`, which must not throw. */
export function hasDatabaseUrl(entry: ClientEntry): boolean {
  return Boolean(process.env[entry.databaseUrlEnv]?.trim() ?? entry.databaseUrl?.trim());
}
