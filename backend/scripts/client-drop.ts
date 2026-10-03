/**
 * `npm run client:drop` — offboard a client: back up, then delete their database.
 *
 *   npm run client:drop -- --code APEX --yes-really
 *
 * This is irreversible and it is the only script here that destroys data, so:
 *
 *   * it refuses without `--yes-really`, and prints what it *would* do instead;
 *   * it takes a `pg_dump` backup first and prints the absolute path and size —
 *     no backup, no drop (override only with the explicit `--skip-backup`);
 *   * it drops that client's database and role and nothing else, because nothing
 *     else is theirs: one client = one database (docs/HOSTING.md);
 *   * it removes them from the registry last, so a failure leaves a record of a
 *     database that still exists rather than an orphan.
 *
 * Options
 *   --code           the institute code (required)
 *   --yes-really     the confirmation. Without it nothing is destroyed.
 *   --backup-dir     where the dump goes (default ./ops/backups, or BACKUP_DIR)
 *   --skip-backup    drop without a dump. For scratch and test databases only.
 *   --keep-role      leave the database role in place (rare: shared credentials)
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { CliError, formatCount, hasFlag, heading, option, parseArgs, printTable, requireOption, rule, runCli, step, warn } from './lib/cli';
import { adminClient, clientFor, clientNames, databaseExists, dropDatabase, dumpDatabase } from './lib/postgres';
import { findClient, loadRegistry, registryPath, removeClient, resolveDatabaseUrl, saveRegistry } from './lib/registry';

runCli('client:drop', async () => {
  const args = parseArgs(process.argv.slice(2), ['code', 'yes-really', 'backup-dir', 'skip-backup', 'keep-role']);
  const names = clientNames(requireOption(args, 'code'));
  const registry = loadRegistry();
  const entry = findClient(registry, names.code);

  heading(`Offboarding ${names.code}`);

  // What are we about to destroy? Say it out loud before asking for confirmation.
  const admin = adminClient();
  let inventory = '';
  try {
    if (!(await databaseExists(admin, names.database))) {
      if (!entry) throw new CliError(`Neither database ${names.database} nor a registry entry for ${names.code} exists.`);
      warn(`Database ${names.database} does not exist; only the registry entry is left to remove.`);
    } else if (entry) {
      inventory = await describeContents(resolveDatabaseUrl(entry));
      step(inventory);
    }

    if (!hasFlag(args, 'yes-really')) {
      rule();
      console.log('Nothing has been changed. This command would:\n');
      printTable(
        ['Step', 'Detail'],
        [
          ['1. back up', hasFlag(args, 'skip-backup') ? 'SKIPPED (--skip-backup)' : `pg_dump → ${backupPath(args, names.database)}`],
          ['2. drop database', names.database],
          ['3. drop role', hasFlag(args, 'keep-role') ? 'kept (--keep-role)' : names.role],
          ['4. deregister', entry ? `remove ${names.code} from ${registryPath()}` : 'not in the registry'],
        ],
      );
      console.log(`\nRerun with --yes-really to do it:\n  npm run client:drop -- --code ${names.code} --yes-really\n`);
      // Refusing is the expected outcome, not an error: exit 0 so a careful
      // operator's dry run does not look like a failure in CI logs.
      return;
    }

    // --- 1. backup --------------------------------------------------------
    if (hasFlag(args, 'skip-backup')) {
      warn('No backup taken (--skip-backup). Once the drop finishes, this client\'s data is gone.');
    } else {
      if (!entry) throw new CliError(`${names.code} is not in the registry, so its connection string is unknown.`, 'Add --skip-backup if you are sure there is nothing to keep.');
      const out = backupPath(args, names.database);
      step(`backing up to ${out} …`);
      const dump = await dumpDatabase(resolveDatabaseUrl(entry), out);
      step(`backup written: ${dump.path} (${formatCount(dump.bytes)} bytes)`);
      console.log(`\n  Restore with:\n    createdb ${names.database} && pg_restore --dbname "$DATABASE_URL" --no-owner --no-privileges "${dump.path}"\n`);
    }

    // --- 2 & 3. drop ------------------------------------------------------
    await dropDatabase(admin, names, !hasFlag(args, 'keep-role'));
    step(`dropped database ${names.database}${hasFlag(args, 'keep-role') ? '' : ` and role ${names.role}`}`);
  } finally {
    await admin.$disconnect();
  }

  // --- 4. deregister ------------------------------------------------------
  if (entry) {
    saveRegistry(removeClient(registry, names.code));
    step(`removed ${names.code} from ${registryPath()}`);
  }

  rule();
  console.log(`${names.code} is offboarded. Remaining manual steps (docs/OPERATIONS.md › Offboarding):`);
  console.log('  · stop and delete the client instance, and remove its subdomain and TLS certificate');
  console.log('  · remove the database from the backup schedule and delete its per-instance secrets');
  console.log('  · keep the final dump for as long as the contract requires, then destroy it');
  rule();
});

/** Default: ./ops/backups/<db>-<timestamp>.dump, overridable per run or by env. */
function backupPath(args: ReturnType<typeof parseArgs>, database: string): string {
  const dir = option(args, 'backup-dir') ?? process.env.BACKUP_DIR ?? './ops/backups';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(process.cwd(), dir, `${database}-${stamp}.dump`);
}

/** A one-line "this is what you are deleting", so the confirmation is informed. */
async function describeContents(url: string): Promise<string> {
  const db = clientFor(url);
  try {
    const [tenant, students, sessions, records, invoices, payments] = await Promise.all([
      db.tenant.findFirst({ select: { name: true, instituteCode: true } }),
      db.student.count(),
      db.attendanceSession.count(),
      db.attendanceRecord.count(),
      db.feeInvoice.count(),
      db.payment.count(),
    ]);
    return `contains ${tenant ? `"${tenant.name}" (${tenant.instituteCode})` : 'no tenant row'}: ${formatCount(students)} students, ${formatCount(sessions)} sessions, ${formatCount(records)} attendance records, ${formatCount(invoices)} invoices, ${formatCount(payments)} payments`;
  } catch (error) {
    return `could not read the database: ${(error as Error).message.split('\n')[0]}`;
  } finally {
    await db.$disconnect();
  }
}
