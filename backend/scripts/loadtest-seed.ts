/**
 * `npm run loadtest:seed` — build a full-size synthetic institute in a scratch
 * database.
 *
 *   npm run loadtest:seed -- --students 5000 --years 5
 *   npm run loadtest:seed -- --students 5000 --years 5 --keep   (leave it for later runs)
 *
 * Why a scratch database and not the dev one: the dev database holds the demo
 * tenant that `npm run db:seed` builds and that the e2e suite expects, and four
 * million rows of synthetic attendance in it would make every other command slow
 * and every later dump enormous. So this creates `edutrack_loadtest_<stamp>`,
 * fills it, prints its URL, and — unless `--keep` — drops it again when the
 * benchmark that follows has finished with it.
 *
 * It refuses to run against anything registered as a client, and it refuses to
 * reuse a database it did not create. Those two checks are the only thing between
 * "prove it scales" and "load-test production".
 *
 * Options
 *   --students N    default 5000
 *   --years N       default 5
 *   --keep          do not drop the database at the end; print how to drop it
 *   --database NAME reuse/scratch name (must start with the loadtest prefix)
 *   --code CODE     institute code for the synthetic tenant (default LOADTEST)
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootstrapInstitute } from './lib/bootstrap-institute';
import { CliError, formatCount, formatDuration, hasFlag, heading, intOption, option, parseArgs, printTable, redactUrl, rule, runCli, step } from './lib/cli';
import { deployMigrations, readMigrationState } from './lib/migrations';
import { adminClient, buildClientUrl, clientFor, databaseExists, generatePassword, quoteIdent, quoteLiteral, roleExists } from './lib/postgres';
import { loadRegistry } from './lib/registry';
import { HANDOFF_FILE } from './lib/loadtest';
import { generateSynthetic, planFor } from './lib/synthetic';

/** Scratch databases are always named with this prefix, and only these are droppable. */
const LOADTEST_PREFIX = 'edutrack_loadtest_';

/** Where the benchmark looks for the database this script made. */
// Defined in lib/loadtest.ts so importing it never triggers this script's CLI.
export { HANDOFF_FILE };

runCli('loadtest:seed', async () => {
  const args = parseArgs(process.argv.slice(2), ['students', 'years', 'keep', 'database', 'code']);
  const students = intOption(args, 'students', 5000, 1, 200_000);
  const years = intOption(args, 'years', 5, 1, 20);
  const code = (option(args, 'code') ?? 'LOADTEST').toUpperCase();

  const database = option(args, 'database') ?? `${LOADTEST_PREFIX}${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  if (!database.startsWith(LOADTEST_PREFIX)) {
    throw new CliError(`A load-test database must be named ${LOADTEST_PREFIX}*, not "${database}".`, 'That prefix is what makes it safe to drop.');
  }

  // Never, under any circumstances, against a client.
  const registry = loadRegistryQuietly();
  if (registry.some((client) => client.database === database)) {
    throw new CliError(`${database} is a registered client database.`, 'The load test only ever runs against a scratch database it created.');
  }

  const plan = planFor(students, years);
  heading(`Load-test seed: ${formatCount(students)} students · ${years} years · ${formatCount(plan.batches)} batches`);
  step(`period ${plan.from} → ${plan.to}, ${plan.campuses} campuses, ${plan.faculty} faculty`);

  const admin = adminClient();
  const role = `${database}_app`;
  const password = generatePassword();
  let url: string;
  const startedAt = Date.now();

  try {
    if (await databaseExists(admin, database)) {
      throw new CliError(`${database} already exists.`, 'Drop it first, or leave --database unset so a fresh name is generated.');
    }
    if (!(await roleExists(admin, role))) {
      await admin.$executeRawUnsafe(`CREATE ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    } else {
      await admin.$executeRawUnsafe(`ALTER ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`);
    }
    await admin.$executeRawUnsafe(`CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(role)} ENCODING 'UTF8'`);
    url = buildClientUrl(database, role, password);
    step(`created scratch database ${database}`);
  } finally {
    await admin.$disconnect();
  }

  const deploy = await deployMigrations(url);
  if (!deploy.ok) {
    console.error(deploy.output.trim());
    throw new CliError('Migrations failed against the scratch database.');
  }
  const state = await readMigrationState(url);
  step(`${state.applied} migrations applied (${state.version})`);

  const db = clientFor(url);
  let counts;
  try {
    // No extension is needed: the generator uses `gen_random_uuid()` and
    // `hashtext()`, both core functions in PostgreSQL 13+.
    const institute = await bootstrapInstitute(db, {
      code,
      name: `Load Test Institute (${formatCount(students)} students)`,
      ownerEmail: 'owner@loadtest.invalid',
      ownerName: 'Load Test Owner',
      campusName: 'Campus 1',
    });
    step(`institute ${institute.instituteCode} bootstrapped`);

    counts = await generateSynthetic(db, institute.tenantId, plan, (phase, rows, ms) =>
      step(`${phase.padEnd(20)} ${formatCount(rows).padStart(12)} rows  ${formatDuration(ms)}`),
    );

    // On-disk size, because "3.9M rows" and "1.8 GB" are different facts an
    // operator needs when sizing a client's instance.
    const sizeRows = await db.$queryRawUnsafe<{ total: string; table: string; size: string }[]>(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS total,
             relname AS table,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS size
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);

    rule();
    printTable(
      ['TABLE', 'ROWS', 'SIZE (incl. indexes)'],
      [
        ['students', formatCount(counts.students), sizeOf(sizeRows, 'students')],
        ['student_batches', formatCount(counts.enrolments), sizeOf(sizeRows, 'student_batches')],
        ['attendance_sessions', formatCount(counts.sessions), sizeOf(sizeRows, 'attendance_sessions')],
        ['attendance_records', formatCount(counts.attendanceRecords), sizeOf(sizeRows, 'attendance_records')],
        ['fee_invoices', formatCount(counts.invoices), sizeOf(sizeRows, 'fee_invoices')],
        ['payments', formatCount(counts.payments), sizeOf(sizeRows, 'payments')],
        ['assessments', formatCount(counts.assessments), sizeOf(sizeRows, 'assessments')],
        ['assessment_scores', formatCount(counts.scores), sizeOf(sizeRows, 'assessment_scores')],
      ],
    );
    step(`database total: ${sizeRows[0]?.total ?? 'unknown'}`);
  } finally {
    await db.$disconnect();
  }

  // Hand the database over to `loadtest:run`, which never creates anything itself.
  const handoff = {
    database,
    url,
    code,
    students,
    years,
    plan,
    counts,
    seededAt: new Date().toISOString(),
    keep: hasFlag(args, 'keep'),
  };
  const handoffPath = resolve(process.cwd(), HANDOFF_FILE);
  writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  rule();
  step(`seeded in ${formatDuration(Date.now() - startedAt)}`);
  step(`scratch database: ${redactUrl(url)}`);
  step(`handoff written to ${HANDOFF_FILE} (git-ignored) — now run: npm run loadtest:run`);
  console.log(`\nWhen you are finished, drop it:\n  npm run loadtest:drop\n`);
});

function sizeOf(rows: readonly { table: string; size: string }[], table: string): string {
  return rows.find((row) => row.table === table)?.size ?? '—';
}

/** The registry may not exist on a machine that only runs the load test. */
function loadRegistryQuietly(): { database: string }[] {
  try {
    return loadRegistry().clients;
  } catch {
    return [];
  }
}
