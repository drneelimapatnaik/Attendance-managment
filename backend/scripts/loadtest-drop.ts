/**
 * `npm run loadtest:drop` — throw away the scratch database the load test built.
 *
 * Separate from the seed script so the benchmark can be re-run against the same
 * data without paying for the seed again, and so forgetting to clean up is a
 * visible leftover rather than silent disk use.
 *
 * It only ever drops a database named `edutrack_loadtest_*`, and never one that is
 * in the client registry. No backup is taken: there is nothing in it but synthetic
 * rows.
 */
import 'dotenv/config';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliError, heading, option, parseArgs, runCli, step, warn } from './lib/cli';
import { adminClient, quoteIdent, quoteLiteral, roleExists } from './lib/postgres';
import { loadRegistry } from './lib/registry';
import { HANDOFF_FILE } from './lib/loadtest';

const LOADTEST_PREFIX = 'edutrack_loadtest_';

runCli('loadtest:drop', async () => {
  const args = parseArgs(process.argv.slice(2), ['database', 'all']);
  const handoffPath = resolve(process.cwd(), HANDOFF_FILE);

  const admin = adminClient();
  try {
    const names = await resolveTargets(admin, args, handoffPath);
    if (names.length === 0) {
      heading('Nothing to drop');
      step(`no ${LOADTEST_PREFIX}* database found`);
      return;
    }

    heading(`Dropping ${names.length} scratch database(s)`);
    const registered = new Set(safeRegistryDatabases());

    for (const database of names) {
      if (!database.startsWith(LOADTEST_PREFIX)) throw new CliError(`Refusing to drop "${database}": not a ${LOADTEST_PREFIX}* database.`);
      if (registered.has(database)) throw new CliError(`Refusing to drop "${database}": it is a registered client database.`);

      await admin.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(database)} AND pid <> pg_backend_pid()`,
      );
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
      const role = `${database}_app`;
      if (await roleExists(admin, role)) await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(role)}`);
      step(`dropped ${database} and its role`);
    }
  } finally {
    await admin.$disconnect();
  }

  if (existsSync(handoffPath)) {
    unlinkSync(handoffPath);
    step(`removed ${HANDOFF_FILE}`);
  }
});

/** The handoff file, an explicit `--database`, or every scratch database with `--all`. */
async function resolveTargets(admin: ReturnType<typeof adminClient>, args: ReturnType<typeof parseArgs>, handoffPath: string): Promise<string[]> {
  const explicit = option(args, 'database');
  if (explicit) return [explicit];

  if (args.flags.has('all')) {
    const rows = await admin.$queryRaw<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname LIKE 'edutrack_loadtest_%'`;
    return rows.map((row) => row.datname);
  }

  if (!existsSync(handoffPath)) {
    warn(`${HANDOFF_FILE} is missing — pass --database <name>, or --all to drop every scratch database.`);
    return [];
  }
  const handoff = JSON.parse(readFileSync(handoffPath, 'utf8')) as { database: string };
  return [handoff.database];
}

function safeRegistryDatabases(): string[] {
  try {
    return loadRegistry().clients.map((client) => client.database);
  } catch {
    return [];
  }
}
