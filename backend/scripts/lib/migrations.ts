/**
 * Running Prisma migrations against one client database at a time.
 *
 * `prisma migrate deploy` is a CLI, not a library, so it is spawned as a child
 * process with `DATABASE_URL` set for that client only — never taken from the
 * ambient environment, which is how a migration ends up in the wrong database.
 *
 * The "version" of a database is the name of the last migration Prisma recorded
 * as finished in `_prisma_migrations`. Reading it before and after a deploy is
 * what lets `clients:migrate` print a per-client before/after table, and it is
 * also the honest answer to "did this client actually get the release?".
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { clientFor } from './postgres';

export interface MigrationState {
  /** Last migration recorded as finished, or null for an empty database. */
  version: string | null;
  /** How many migrations have been applied. */
  applied: number;
  /** Migrations that started and failed — a database in this state blocks deploys. */
  failed: string[];
}

/**
 * Reads `_prisma_migrations` directly. A brand-new database has no such table, so
 * that case is reported as "no migrations" rather than as an error.
 */
export async function readMigrationState(url: string): Promise<MigrationState> {
  const db = clientFor(url);
  try {
    const exists = await db.$queryRaw<{ present: boolean }[]>`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!exists[0]?.present) return { version: null, applied: 0, failed: [] };

    const rows = await db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM public._prisma_migrations
      ORDER BY started_at ASC
    `;
    const finished = rows.filter((row) => row.finished_at !== null && row.rolled_back_at === null);
    const failed = rows.filter((row) => row.finished_at === null && row.rolled_back_at === null).map((row) => row.migration_name);
    return { version: finished.at(-1)?.migration_name ?? null, applied: finished.length, failed };
  } finally {
    await db.$disconnect();
  }
}

/** Migration folders in `prisma/migrations`, in lexical (= chronological) order. */
export function migrationsOnDisk(): string[] {
  const dir = resolve(process.cwd(), 'prisma', 'migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export interface DeployResult {
  ok: boolean;
  exitCode: number | null;
  /** Combined stdout/stderr, kept for the failure report. */
  output: string;
  durationMs: number;
}

/**
 * Runs `prisma migrate deploy` against one URL.
 *
 * The child inherits nothing but a copy of the environment with `DATABASE_URL`
 * replaced, so a stray `.env` cannot redirect the deploy. Output is captured
 * instead of inherited: one client's failure should print as a block under its own
 * name, not interleaved with the other clients'.
 */
export async function deployMigrations(url: string): Promise<DeployResult> {
  return runPrisma(['migrate', 'deploy'], url);
}

/**
 * `prisma migrate status` — used by `--dry-run`. Exit code 1 means "pending
 * migrations", which is information rather than failure, so the caller reads the
 * output instead of the code.
 */
export async function migrationStatus(url: string): Promise<DeployResult> {
  return runPrisma(['migrate', 'status'], url);
}

function runPrisma(args: readonly string[], url: string): Promise<DeployResult> {
  const startedAt = Date.now();
  return new Promise<DeployResult>((resolvePromise) => {
    // The CLI is invoked as `node node_modules/prisma/build/index.js …` rather than
    // through `npx`: no shell, so nothing in a database URL can be interpreted by
    // one, and no PATH lookup that differs between Windows and Linux.
    const child = spawn(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
      cwd: process.cwd(),
      windowsHide: true,
      env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    });

    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', (error) => {
      output += `\n${error.message}`;
      resolvePromise({ ok: false, exitCode: null, output, durationMs: Date.now() - startedAt });
    });
    child.on('close', (code) => resolvePromise({ ok: code === 0, exitCode: code, output, durationMs: Date.now() - startedAt }));
  });
}
