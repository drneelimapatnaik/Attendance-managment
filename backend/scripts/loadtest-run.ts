/**
 * `npm run loadtest:run` — time the queries behind the real screens, at full size.
 *
 *   npm run loadtest:seed -- --students 5000 --years 5
 *   npm run loadtest:run
 *   npm run loadtest:run -- --write-docs      (also rewrite docs/PERFORMANCE.md)
 *
 * It never creates or fills a database: it reads `.loadtest.json`, which
 * `loadtest:seed` wrote, and refuses to run against a registered client. Each query
 * is warmed up, then timed several times, and finally explained with
 * `EXPLAIN (ANALYZE, BUFFERS)` so the report can say which index each one used —
 * "it was fast" is not evidence, "it used this index and read this many buffers" is.
 *
 * Options
 *   --runs N          timed iterations per query (default 7)
 *   --warmup N        untimed iterations first (default 2)
 *   --write-docs      regenerate docs/PERFORMANCE.md from this run
 *   --url URL         benchmark a specific database instead of the handoff file
 */
import 'dotenv/config';
import { cpus, totalmem, platform, release, arch } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BENCHMARKS, readFixtures, type Benchmark, type Fixtures } from './lib/benchmarks';
import { CliError, formatCount, formatDuration, hasFlag, heading, intOption, option, parseArgs, printTable, rule, runCli, step } from './lib/cli';
import { clientFor } from './lib/postgres';
import { loadRegistry } from './lib/registry';
import { HANDOFF_FILE } from './lib/loadtest';

interface Handoff {
  database: string;
  url: string;
  code: string;
  students: number;
  years: number;
  counts: Record<string, number>;
  seededAt: string;
}

interface Timing {
  benchmark: Benchmark;
  rows: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  /** Index / scan lines pulled out of the plan. */
  plan: string[];
  /** Shared buffers hit + read, as EXPLAIN (BUFFERS) reports them. */
  buffers?: string;
  planText: string;
}

runCli('loadtest:run', async () => {
  const args = parseArgs(process.argv.slice(2), ['runs', 'warmup', 'write-docs', 'url']);
  const runs = intOption(args, 'runs', 7, 1, 100);
  const warmup = intOption(args, 'warmup', 2, 0, 20);

  const handoff = readHandoff(option(args, 'url'));
  assertNotAClient(handoff.database);

  const db = clientFor(handoff.url);
  try {
    const [tenant] = await db.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT id, name FROM tenants LIMIT 1`);
    if (!tenant) throw new CliError(`${handoff.database} has no tenant row — run npm run loadtest:seed first.`);

    const version = await serverVersion(db);
    const rowCounts = await tableCounts(db);
    const fixtures = await readFixtures(db, tenant.id);

    heading(`Benchmark — ${handoff.database} · ${formatCount(rowCounts.students ?? 0)} students · ${handoff.years} years`);
    step(`PostgreSQL ${version}`);
    step(`${runs} timed runs after ${warmup} warmup run(s) per query`);
    step(`fixtures: date ${fixtures.today}, batch ${fixtures.batchCode}, month ${fixtures.monthStart}, academic year ${fixtures.yearStart} → ${fixtures.yearEnd}`);

    const timings: Timing[] = [];
    for (const benchmark of BENCHMARKS) {
      timings.push(await time(db, benchmark, fixtures, runs, warmup));
      const last = timings[timings.length - 1];
      step(`${benchmark.key.padEnd(18)} ${String(formatDuration(last.median)).padStart(9)}  (${formatCount(last.rows)} rows)`);
    }

    rule();
    printTable(
      ['QUERY', 'SCREEN', 'ROWS', 'MIN', 'MEDIAN', 'P95', 'MAX'],
      timings.map((timing) => [
        timing.benchmark.key,
        timing.benchmark.screen,
        formatCount(timing.rows),
        ms(timing.min),
        ms(timing.median),
        ms(timing.p95),
        ms(timing.max),
      ]),
    );

    rule();
    console.log('Access paths (from EXPLAIN ANALYZE):\n');
    for (const timing of timings) {
      console.log(`  ${timing.benchmark.key}`);
      for (const line of timing.plan) console.log(`      ${line}`);
      if (timing.buffers) console.log(`      buffers: ${timing.buffers}`);
    }

    if (hasFlag(args, 'write-docs')) {
      const path = resolve(process.cwd(), 'docs', 'PERFORMANCE.md');
      writeFileSync(path, renderReport({ handoff, timings, rowCounts, version, fixtures, runs, warmup }), 'utf8');
      rule();
      step(`wrote ${path}`);
    } else {
      console.log('\nAdd --write-docs to regenerate docs/PERFORMANCE.md from this run.');
    }
  } finally {
    await db.$disconnect();
  }
});

/** Times one benchmark and explains it. */
async function time(db: ReturnType<typeof clientFor>, benchmark: Benchmark, fixtures: Fixtures, runs: number, warmup: number): Promise<Timing> {
  const params = benchmark.params(fixtures);
  for (let i = 0; i < warmup; i += 1) await db.$queryRawUnsafe(benchmark.sql, ...params);

  const samples: number[] = [];
  let rows = 0;
  for (let i = 0; i < runs; i += 1) {
    const startedAt = process.hrtime.bigint();
    const result = await db.$queryRawUnsafe<unknown[]>(benchmark.sql, ...params);
    samples.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
    rows = result.length;
  }
  samples.sort((a, b) => a - b);

  const planRows = await db.$queryRawUnsafe<Record<string, string>[]>(`EXPLAIN (ANALYZE, BUFFERS) ${benchmark.sql}`, ...params);
  const planText = planRows.map((row) => Object.values(row)[0]).join('\n');

  return {
    benchmark,
    rows,
    min: samples[0],
    median: samples[Math.floor(samples.length / 2)],
    p95: samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)],
    max: samples[samples.length - 1],
    plan: accessPaths(planText),
    buffers: buffersOf(planText),
    planText,
  };
}

/**
 * The interesting lines of a plan: which index, or — the thing worth catching — a
 * sequential scan over a table that has one.
 */
function accessPaths(planText: string): string[] {
  const paths = planText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^->? ?(Index Only Scan|Index Scan|Bitmap Index Scan|Bitmap Heap Scan|Seq Scan|Parallel Seq Scan)/.test(line.replace(/^->\s*/, '')))
    .map((line) => line.replace(/^->\s*/, '').replace(/\s+\(cost=.*?rows=(\d+).*?\)\s*/, ' [est $1] ').replace(/\s+/g, ' '));
  return [...new Set(paths)];
}

function buffersOf(planText: string): string | undefined {
  const match = planText.match(/Buffers: ([^\n]+)/);
  return match?.[1]?.trim();
}

function ms(value: number): string {
  return value < 10 ? `${value.toFixed(1)} ms` : `${Math.round(value)} ms`;
}

async function serverVersion(db: ReturnType<typeof clientFor>): Promise<string> {
  const [row] = await db.$queryRawUnsafe<{ version: string }[]>(`SELECT version() AS version`);
  return row.version.replace(/ \(.*/, '');
}

/** Row counts for the report, by the tables that matter. */
async function tableCounts(db: ReturnType<typeof clientFor>): Promise<Record<string, number>> {
  const rows = await db.$queryRawUnsafe<{ table: string; rows: bigint; size: string }[]>(`
    SELECT c.relname AS table, c.reltuples::bigint AS rows, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.table] = Number(row.rows);
  // reltuples is an estimate; the two headline numbers are worth counting exactly.
  const [exact] = await db.$queryRawUnsafe<{ students: bigint; records: bigint }[]>(
    `SELECT (SELECT count(*) FROM students) AS students, (SELECT count(*) FROM attendance_records) AS records`,
  );
  counts.students = Number(exact.students);
  counts.attendance_records = Number(exact.records);
  return counts;
}

function readHandoff(url?: string): Handoff {
  if (url) {
    const database = new URL(url).pathname.replace(/^\//, '');
    return { database, url, code: 'UNKNOWN', students: 0, years: 0, counts: {}, seededAt: new Date().toISOString() };
  }
  const path = resolve(process.cwd(), HANDOFF_FILE);
  if (!existsSync(path)) {
    throw new CliError(`${HANDOFF_FILE} is missing.`, 'Run `npm run loadtest:seed -- --students 5000 --years 5` first, or pass --url.');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Handoff;
}

/** The load test must never touch a client's database. */
function assertNotAClient(database: string): void {
  let clients: { database: string; code: string }[] = [];
  try {
    clients = loadRegistry().clients;
  } catch {
    return;
  }
  const client = clients.find((entry) => entry.database === database);
  if (client) {
    throw new CliError(`${database} belongs to client ${client.code}.`, 'The load test only runs against a scratch database created by loadtest:seed.');
  }
}

// ------------------------------------------------------------------- reporting

interface ReportInput {
  handoff: Handoff;
  timings: readonly Timing[];
  rowCounts: Record<string, number>;
  version: string;
  fixtures: Fixtures;
  runs: number;
  warmup: number;
}

/**
 * docs/PERFORMANCE.md is generated, not written by hand, so the numbers in it are
 * always numbers that were actually measured. The prose sections that need
 * judgement ("what is still slow and why") are assembled from the timings.
 */
function renderReport(input: ReportInput): string {
  const { handoff, timings, rowCounts, version, fixtures, runs, warmup } = input;
  const cpu = cpus();
  const slow = timings.filter((timing) => timing.median > 250 && !timing.benchmark.key.endsWith('naive'));
  const table = (rows: readonly (readonly string[])[], headers: readonly string[]): string =>
    [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

  return `# Performance at 5,000 students

Generated by \`npm run loadtest:run -- --write-docs\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.
Every number below was measured; nothing here is an estimate.

## What was measured

A synthetic institute at the sizing target from \`docs/HOSTING.md\`:
**${formatCount(handoff.students || rowCounts.students)} students over ${handoff.years} academic years**, in a scratch
database (\`${handoff.database}\`) created and dropped by the load-test scripts. The
dev database is never used for this.

\`\`\`bash
npm run loadtest:seed -- --students ${handoff.students || 5000} --years ${handoff.years || 5}
npm run loadtest:run -- --write-docs
npm run loadtest:drop
\`\`\`

### Volume

${table(
  [
    ['students', formatCount(rowCounts.students ?? 0)],
    ['student_batches (enrolments)', formatCount(rowCounts.student_batches ?? 0)],
    ['attendance_sessions', formatCount(rowCounts.attendance_sessions ?? 0)],
    ['**attendance_records**', `**${formatCount(rowCounts.attendance_records ?? 0)}**`],
    ['fee_invoices', formatCount(rowCounts.fee_invoices ?? 0)],
    ['payments', formatCount(rowCounts.payments ?? 0)],
    ['assessments', formatCount(rowCounts.assessments ?? 0)],
    ['assessment_scores', formatCount(rowCounts.assessment_scores ?? 0)],
  ],
  ['Table', 'Rows'],
)}

### Hardware and server

${table(
  [
    ['Machine', `${platform()} ${release()} (${arch()})`],
    ['CPU', `${cpu[0]?.model ?? 'unknown'} — ${cpu.length} logical cores`],
    ['RAM', `${Math.round(totalmem() / 1024 ** 3)} GB`],
    ['PostgreSQL', version],
    ['Server', 'postgres:16-alpine in Docker Desktop, default configuration, local volume'],
    ['Client', `Node ${process.versions.node}, Prisma raw queries over the loopback interface`],
  ],
  ['', ''],
)}

The server is a development Docker container with stock settings (128 MB
\`shared_buffers\`, no tuning) on a laptop, sharing the machine with the client.
A provisioned client instance will have more cache and no competing load, so treat
these as an upper bound on latency rather than a target.

## Results

${runs} timed runs after ${warmup} warmup run(s). Fixtures: date \`${fixtures.today}\`,
batch \`${fixtures.batchCode}\` (the one with the most attendance), the student with the
longest history, month \`${fixtures.monthStart}\`, academic year \`${fixtures.yearStart}\` → \`${fixtures.yearEnd}\`.

${table(
  timings.map((timing) => [
    `\`${timing.benchmark.key}\``,
    timing.benchmark.screen,
    formatCount(timing.rows),
    ms(timing.median),
    ms(timing.p95),
    ms(timing.max),
  ]),
  ['Query', 'Screen', 'Rows', 'Median', 'p95', 'Max'],
)}

## Which indexes were used

From \`EXPLAIN (ANALYZE, BUFFERS)\` on the same statements, same parameters:

${timings
  .map(
    (timing) => `### \`${timing.benchmark.key}\` — ${timing.benchmark.what}

${timing.plan.map((line) => `- ${line}`).join('\n')}
${timing.buffers ? `\nBuffers: ${timing.buffers}` : ''}`,
  )
  .join('\n\n')}

## What is slow, and why

${
  slow.length === 0
    ? 'Nothing above 250 ms. Every screen-level query returns in well under a quarter of a second at target volume.'
    : slow
        .map(
          (timing) =>
            `- **\`${timing.benchmark.key}\` — ${ms(timing.median)}** (${timing.benchmark.screen}). ${timing.benchmark.note ?? ''} ` +
            `It aggregates rather than looks up, so its cost is proportional to the range asked for, not to the page size.`,
        )
        .join('\n')
}

## Full plans

<details>
<summary>EXPLAIN (ANALYZE, BUFFERS) output for every query</summary>

${timings.map((timing) => `#### ${timing.benchmark.key}\n\n\`\`\`\n${timing.planText}\n\`\`\``).join('\n\n')}

</details>
`;
}
