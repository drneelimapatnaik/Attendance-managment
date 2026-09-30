/**
 * `npm run client:list` — what clients exist, and is each one healthy.
 *
 *   npm run client:list              registry only (no connections opened)
 *   npm run client:list -- --check   also connect to each database
 *
 * With `--check` it opens each client database in turn and reports its migration
 * version, its tenant row and its student count, so an operator can see at a
 * glance which client is behind on a release or unreachable. Connections are made
 * one at a time and closed immediately: this must be safe to run against
 * production.
 *
 * Nothing here queries across clients — it cannot, there is no shared database.
 * The loop is the only thing that sees more than one client, and it lives on the
 * ops box.
 */
import 'dotenv/config';
import { formatCount, hasFlag, heading, parseArgs, printTable, runCli, step } from './lib/cli';
import { readMigrationState } from './lib/migrations';
import { adminClient, clientFor, databaseSize } from './lib/postgres';
import { hasDatabaseUrl, loadRegistry, registryPath, resolveDatabaseUrl, type ClientEntry } from './lib/registry';

runCli('client:list', async () => {
  const args = parseArgs(process.argv.slice(2), ['check', 'sizes']);
  const registry = loadRegistry();

  heading(`Clients in ${registryPath()}`);
  if (registry.clients.length === 0) {
    step('none yet — create one with `npm run client:create -- --code … --name … --owner-email … --owner-name …`');
    return;
  }

  const sizes = new Map<string, string>();
  if (hasFlag(args, 'sizes')) {
    const admin = adminClient();
    try {
      for (const client of registry.clients) {
        const size = await databaseSize(admin, client.database);
        if (size) sizes.set(client.code, size);
      }
    } finally {
      await admin.$disconnect();
    }
  }

  const check = hasFlag(args, 'check');
  const rows: string[][] = [];
  for (const client of registry.clients) {
    const base = [
      client.code,
      client.name,
      client.database,
      client.createdAt.slice(0, 10),
      client.lastMigrationVersion ?? '—',
      client.lastMigrationAt?.slice(0, 10) ?? '—',
      hasDatabaseUrl(client) ? (process.env[client.databaseUrlEnv] ? 'env' : 'file') : 'MISSING',
      sizes.get(client.code) ?? '',
    ];
    rows.push(check ? [...base, await probe(client)] : base);
  }

  const headers = ['CODE', 'NAME', 'DATABASE', 'CREATED', 'MIGRATED TO', 'ON', 'SECRET', 'SIZE'];
  printTable(check ? [...headers, 'LIVE'] : headers, rows);

  if (!check) console.log('\nAdd --check to connect to each database, or --sizes for on-disk sizes.');
});

/**
 * One line per client describing what is actually in its database.
 * Never throws: an unreachable client must not stop the report.
 */
async function probe(client: ClientEntry): Promise<string> {
  if (!hasDatabaseUrl(client)) return 'no connection string';
  let url: string;
  try {
    url = resolveDatabaseUrl(client);
  } catch (error) {
    return (error as Error).message;
  }

  const db = clientFor(url);
  try {
    const state = await readMigrationState(url);
    const tenant = await db.tenant.findUnique({ where: { instituteCode: client.code }, select: { name: true, active: true } });
    const students = await db.student.count();
    const parts = [
      state.version ? `at ${state.version.slice(0, 14)}` : 'not migrated',
      tenant ? (tenant.active ? 'tenant active' : 'tenant SUSPENDED') : 'NO TENANT ROW',
      `${formatCount(students)} students`,
    ];
    if (state.failed.length > 0) parts.push(`FAILED: ${state.failed.join(', ')}`);
    return parts.join(' · ');
  } catch (error) {
    return `unreachable: ${(error as Error).message.split('\n')[0]}`;
  } finally {
    await db.$disconnect();
  }
}
