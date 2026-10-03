/**
 * `npm run clients:migrate` — roll a release out to every client database.
 *
 *   npm run clients:migrate                 apply to all registered clients
 *   npm run clients:migrate -- --dry-run    report what is pending, change nothing
 *   npm run clients:migrate -- --only APEX,BRIGHTK
 *
 * Because every client has their own database, a release is not one migration but
 * N, and they can disagree: one client may be a version behind because their
 * instance was down when the last release went out. So this script:
 *
 *   * reads each database's version *before* and *after* its deploy, from
 *     `_prisma_migrations` — the only trustworthy answer to "did it land?";
 *   * keeps going when one client fails. A failure is that client's problem, not
 *     the fleet's, and stopping would leave the rest un-migrated for no reason;
 *   * prints one row per client and exits non-zero if any failed, so CI notices;
 *   * records the new version in the registry per client, immediately after each
 *     success, so an interrupted run still leaves an accurate record.
 *
 * Failures print their full Prisma output under the table. The usual cause is a
 * migration that cannot apply to that client's data (a unique index over rows
 * that are not unique there) — see docs/OPERATIONS.md › When a migration fails
 * halfway.
 */
import 'dotenv/config';
import { formatDuration, hasFlag, heading, option, parseArgs, printTable, runCli, rule, step, warn } from './lib/cli';
import { deployMigrations, migrationsOnDisk, migrationStatus, readMigrationState } from './lib/migrations';
import { clientFor } from './lib/postgres';
import { hasDatabaseUrl, loadRegistry, registryPath, resolveDatabaseUrl, saveRegistry, updateClient, type ClientEntry } from './lib/registry';

interface Outcome {
  code: string;
  before: string | null;
  after: string | null;
  pending: number;
  status: 'ok' | 'up-to-date' | 'pending' | 'failed' | 'skipped';
  durationMs: number;
  detail?: string;
}

runCli('clients:migrate', async () => {
  const args = parseArgs(process.argv.slice(2), ['dry-run', 'only']);
  const dryRun = hasFlag(args, 'dry-run');
  const only = option(args, 'only')
    ?.split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  let registry = loadRegistry();
  const disk = migrationsOnDisk();
  const targets = only ? registry.clients.filter((client) => only.includes(client.code)) : registry.clients;

  heading(`${dryRun ? 'Checking' : 'Migrating'} ${targets.length} client database(s) to ${disk.at(-1) ?? 'nothing'}`);
  step(`registry: ${registryPath()}`);
  step(`${disk.length} migrations on disk, latest ${disk.at(-1) ?? '—'}`);
  if (only) step(`limited to ${only.join(', ')}`);
  if (targets.length === 0) {
    warn('No clients matched. Nothing to do.');
    return;
  }

  const outcomes: Outcome[] = [];
  const failures: { code: string; output: string }[] = [];

  for (const client of targets) {
    const outcome = await migrateOne(client, disk, dryRun);
    outcomes.push(outcome);
    if (outcome.status === 'failed' && outcome.detail) failures.push({ code: client.code, output: outcome.detail });

    // Record success per client, straight away: an interrupted fleet run must not
    // lose the fact that the first five clients are already on the new version.
    if (!dryRun && outcome.status === 'ok' && outcome.after) {
      registry = updateClient(registry, client.code, { lastMigrationVersion: outcome.after, lastMigrationAt: new Date().toISOString() });
      saveRegistry(registry);
    }
  }

  rule();
  printTable(
    ['CODE', 'BEFORE', 'AFTER', 'PENDING', 'RESULT', 'TIME'],
    outcomes.map((outcome) => [
      outcome.code,
      short(outcome.before),
      short(outcome.after),
      String(outcome.pending),
      label(outcome.status),
      formatDuration(outcome.durationMs),
    ]),
  );

  for (const failure of failures) {
    console.error(`\n--- ${failure.code}: prisma output ------------------------------------`);
    console.error(failure.output.trim());
  }

  const failed = outcomes.filter((outcome) => outcome.status === 'failed' || outcome.status === 'skipped');
  const behind = outcomes.filter((outcome) => outcome.status === 'pending');
  console.log('');
  if (dryRun) {
    step(`${behind.length} client(s) have migrations pending, ${outcomes.length - behind.length - failed.length} already up to date`);
  } else {
    step(`${outcomes.filter((o) => o.status === 'ok').length} migrated, ${outcomes.filter((o) => o.status === 'up-to-date').length} already current`);
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} client(s) did not migrate: ${failed.map((outcome) => outcome.code).join(', ')}`);
    console.error('See docs/OPERATIONS.md › When a migration fails halfway.');
    // Non-zero so a release pipeline stops and a human looks.
    process.exitCode = 1;
  }
});

/** One client, start to finish. Never throws: the fleet must keep moving. */
async function migrateOne(client: ClientEntry, disk: readonly string[], dryRun: boolean): Promise<Outcome> {
  const startedAt = Date.now();
  const base = { code: client.code, before: null, after: null, pending: 0, durationMs: 0 };

  if (!hasDatabaseUrl(client)) {
    return { ...base, status: 'skipped', detail: `No connection string. Set ${client.databaseUrlEnv}.`, durationMs: Date.now() - startedAt };
  }

  let url: string;
  try {
    url = resolveDatabaseUrl(client);
  } catch (error) {
    return { ...base, status: 'skipped', detail: (error as Error).message, durationMs: Date.now() - startedAt };
  }

  let before;
  try {
    before = await readMigrationState(url);
  } catch (error) {
    return { ...base, status: 'failed', detail: `Could not read _prisma_migrations: ${(error as Error).message}`, durationMs: Date.now() - startedAt };
  }

  // A database with a half-applied migration cannot be deployed to; Prisma would
  // refuse anyway, and saying so here is clearer than its error.
  if (before.failed.length > 0) {
    return {
      ...base,
      before: before.version,
      after: before.version,
      status: 'failed',
      detail: `Migration(s) ${before.failed.join(', ')} started and never finished. Resolve them before deploying (docs/OPERATIONS.md).`,
      durationMs: Date.now() - startedAt,
    };
  }

  const appliedNames = new Set(await appliedMigrationNames(url));
  const pending = disk.filter((name) => !appliedNames.has(name));

  if (dryRun) {
    const status = await migrationStatus(url);
    return {
      ...base,
      before: before.version,
      after: before.version,
      pending: pending.length,
      status: pending.length === 0 ? 'up-to-date' : 'pending',
      detail: status.output,
      durationMs: Date.now() - startedAt,
    };
  }

  if (pending.length === 0) {
    return { ...base, before: before.version, after: before.version, pending: 0, status: 'up-to-date', durationMs: Date.now() - startedAt };
  }

  const deploy = await deployMigrations(url);
  const after = deploy.ok ? await readMigrationState(url).catch(() => before) : before;
  return {
    code: client.code,
    before: before.version,
    after: after.version,
    pending: pending.length,
    status: deploy.ok ? 'ok' : 'failed',
    detail: deploy.ok ? undefined : deploy.output,
    durationMs: Date.now() - startedAt,
  };
}

/** Migration names Prisma has recorded as finished in one database. */
async function appliedMigrationNames(url: string): Promise<string[]> {
  const db = clientFor(url);
  try {
    const exists = await db.$queryRaw<{ present: boolean }[]>`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!exists[0]?.present) return [];
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    return rows.map((row) => row.migration_name);
  } finally {
    await db.$disconnect();
  }
}

/** Migration folder names are long; the timestamp prefix identifies them. */
function short(version: string | null): string {
  if (!version) return '—';
  return version.length > 24 ? `${version.slice(0, 24)}…` : version;
}

function label(status: Outcome['status']): string {
  switch (status) {
    case 'ok':
      return 'migrated';
    case 'up-to-date':
      return 'up to date';
    case 'pending':
      return 'PENDING';
    case 'failed':
      return 'FAILED';
    case 'skipped':
      return 'SKIPPED';
  }
}
