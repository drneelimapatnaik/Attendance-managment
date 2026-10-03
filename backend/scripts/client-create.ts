/**
 * `npm run client:create` — provision one new client, end to end.
 *
 *   npm run client:create -- --code APEX --name "Apex Academy" \
 *       --owner-email priya@apexacademy.in --owner-name "Priya Sharma"
 *
 * One client = one deployment = one database (docs/HOSTING.md). This script is the
 * whole of step 1–4 of that document, in order, with nothing shared between
 * clients at any point:
 *
 *   1. create the database and a least-privilege role that can reach only it
 *   2. `prisma migrate deploy` against it
 *   3. bootstrap the institute: code, name, default settings, one campus, and the
 *      two built-in roles — no demo data unless `--demo`
 *   4. create the owner's staff record and print a one-time activation link; no
 *      password is generated, transmitted or stored by us
 *   5. record the client in the registry (a JSON file, not a shared database)
 *   6. print a handover summary the operator can paste into an email
 *
 * It is not transactional across steps — Postgres cannot roll back CREATE DATABASE
 * — so a failure part-way leaves a named database behind and says so, and a rerun
 * with the same code refuses rather than adopting it. `client:drop` is the undo.
 *
 * Options
 *   --code             institute code, upper case (required)
 *   --name             display name (required)
 *   --owner-email      the owner's email; the activation link goes here (required)
 *   --owner-name       the owner's name (required)
 *   --demo             also load the demo institute from prisma/seed.ts
 *   --timezone         IANA zone, default Asia/Kolkata
 *   --campus           name of the first campus, default "Main Campus"
 *   --contact-phone    institute phone for the tenant record
 *   --address          institute address
 *   --secrets file|env where the connection string is kept (default file)
 *   --notes            free-text note stored in the registry
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import {
  CliError,
  formatDuration,
  hasFlag,
  heading,
  option,
  parseArgs,
  printTable,
  redactUrl,
  requireOption,
  rule,
  runCli,
  step,
  warn,
} from './lib/cli';
import { activationUrl, bootstrapInstitute } from './lib/bootstrap-institute';
import { deployMigrations, readMigrationState } from './lib/migrations';
import { adminClient, buildClientUrl, clientFor, clientNames, generatePassword, provisionDatabase } from './lib/postgres';
import { addClient, databaseUrlEnvName, loadRegistry, registryPath, saveRegistry } from './lib/registry';

const OPTIONS = [
  'code',
  'name',
  'owner-email',
  'owner-name',
  'demo',
  'timezone',
  'campus',
  'contact-phone',
  'address',
  'secrets',
  'notes',
] as const;

runCli('client:create', async () => {
  const args = parseArgs(process.argv.slice(2), OPTIONS);
  const names = clientNames(requireOption(args, 'code'));
  const displayName = requireOption(args, 'name');
  const ownerEmail = requireOption(args, 'owner-email');
  const ownerName = requireOption(args, 'owner-name');
  const secrets = option(args, 'secrets') ?? 'file';
  if (secrets !== 'file' && secrets !== 'env') throw new CliError('--secrets must be "file" or "env".');

  // Fail before touching Postgres if the registry already knows this code.
  const registry = loadRegistry();
  if (registry.clients.some((client) => client.code === names.code)) {
    throw new CliError(`Client ${names.code} is already in ${registryPath()}.`, 'Use another code, or offboard the old client first.');
  }

  heading(`Provisioning ${names.code} — ${displayName}`);
  const startedAt = Date.now();

  // --- 1. database + least-privilege role ---------------------------------
  const admin = adminClient();
  const password = generatePassword();
  let clientUrl: string;
  try {
    const provisioned = await provisionDatabase(admin, names, password);
    clientUrl = buildClientUrl(provisioned.database, provisioned.role, password);
    step(`database ${provisioned.database} created, owned by ${provisioned.role}`);
    step('PUBLIC revoked: no other role in the cluster can connect to it');
  } finally {
    await admin.$disconnect();
  }

  // --- 2. migrations ------------------------------------------------------
  const deploy = await deployMigrations(clientUrl);
  if (!deploy.ok) {
    console.error(deploy.output.trim());
    throw new CliError(
      `prisma migrate deploy failed for ${names.database} (exit ${deploy.exitCode}).`,
      `The database exists but is not migrated. Fix the cause and rerun the deploy, or remove it with: npm run client:drop -- --code ${names.code} --yes-really --skip-backup`,
    );
  }
  const state = await readMigrationState(clientUrl);
  step(`${state.applied} migrations applied in ${formatDuration(deploy.durationMs)} (at ${state.version})`);

  // --- 3. optional demo data ---------------------------------------------
  const demo = hasFlag(args, 'demo');
  if (demo) {
    await runSeed(clientUrl, names.code);
    step('demo institute loaded (prisma/seed.ts) — do not do this for a paying client');
  }

  // --- 4. institute + owner ----------------------------------------------
  const db = clientFor(clientUrl);
  let result: Awaited<ReturnType<typeof bootstrapInstitute>>;
  try {
    result = await bootstrapInstitute(db, {
      code: names.code,
      name: displayName,
      ownerEmail,
      ownerName,
      timezone: option(args, 'timezone'),
      campusName: option(args, 'campus'),
      contactPhone: option(args, 'contact-phone'),
      address: option(args, 'address'),
    });
  } finally {
    await db.$disconnect();
  }
  step(`institute ${result.instituteCode} bootstrapped: ${result.roles.map((role) => role.name).join(', ')} + campus "${result.campusName}"`);
  step(`owner ${result.owner.email} created as ${result.owner.isOwner ? 'the institute owner' : 'an Administrator'} — invited, no password set`);
  if (result.ownerWasTaken) warn('The demo seed already owns this institute, so the account above is an Administrator rather than the owner.');

  // --- 5. registry --------------------------------------------------------
  const entry = {
    code: names.code,
    name: displayName,
    database: names.database,
    databaseUser: names.role,
    databaseUrlEnv: databaseUrlEnvName(names.code),
    ...(secrets === 'file' ? { databaseUrl: clientUrl } : {}),
    createdAt: new Date().toISOString(),
    lastMigrationVersion: state.version ?? undefined,
    lastMigrationAt: new Date().toISOString(),
    ...(option(args, 'notes') ? { notes: option(args, 'notes') } : {}),
  };
  saveRegistry(addClient(registry, entry));
  step(`registered in ${registryPath()}${secrets === 'env' ? ' (without the connection string)' : ''}`);

  // --- 6. handover summary -----------------------------------------------
  printHandover({
    code: result.instituteCode,
    name: result.name,
    academicYear: result.academicYear,
    ownerName: result.owner.name,
    ownerEmail: result.owner.email,
    activationLink: activationUrl(process.env.WEB_APP_URL ?? 'https://app.edutrack.example', result.activation.token),
    activationExpires: result.activation.expiresAt,
    database: names.database,
    databaseUser: names.role,
    clientUrl,
    secrets,
    envVar: entry.databaseUrlEnv,
    migrations: state.version ?? 'none',
    demo,
    durationMs: Date.now() - startedAt,
  });
});

/** Runs the demo seed against one client database, with its code. */
function runSeed(url: string, code: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // `node -r ts-node/register …` rather than `npx ts-node`: no shell, so the
    // connection string in the environment never reaches a command line.
    const child = spawn(process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'prisma/seed.ts'], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url, SEED_TENANT_CODE: code },
    });
    child.on('error', reject);
    child.on('close', (exit) => (exit === 0 ? resolvePromise() : reject(new CliError(`prisma/seed.ts exited with code ${exit}.`))));
  });
}

interface Handover {
  code: string;
  name: string;
  academicYear: string;
  ownerName: string;
  ownerEmail: string;
  activationLink: string;
  activationExpires: Date;
  database: string;
  databaseUser: string;
  clientUrl: string;
  secrets: string;
  envVar: string;
  migrations: string;
  demo: boolean;
  durationMs: number;
}

/**
 * Two blocks on purpose: what goes to the client (no secrets), and what stays with
 * the operator (the connection string, printed once).
 */
function printHandover(h: Handover): void {
  heading(`Done in ${formatDuration(h.durationMs)} — paste the block below into the handover email`);
  console.log(`
Welcome to EduTrack, ${h.ownerName}.

Your institute is ready:

  Institute code   ${h.code}          (you type this when signing in)
  Institute name   ${h.name}
  Academic year    ${h.academicYear}
  Your sign-in     ${h.ownerEmail}

Set your password with this one-time link — it works once and expires on
${h.activationExpires.toISOString().slice(0, 16).replace('T', ' ')} UTC:

  ${h.activationLink}

You start with two staff roles, Administrator and Faculty. Everything else —
campuses, subjects, batches, fee rules, your own extra roles, your students — is
yours to set up, and nobody outside your institute can see any of it: your data
lives in its own database.
`);

  rule();
  console.log('Operator record — the connection string is printed once. Store it, do not commit it.\n');
  printTable(
    ['Item', 'Value'],
    [
      ['Institute code', h.code],
      ['Database', h.database],
      ['Database user', h.databaseUser],
      ['Migrations', h.migrations],
      ['Demo data', h.demo ? 'YES — sales demo only' : 'no'],
      ['Registry env var', h.envVar],
      ['Secret storage', h.secrets === 'file' ? 'registry file (git-ignored, chmod 600)' : `environment only (set ${h.envVar})`],
      ['DATABASE_URL', redactUrl(h.clientUrl)],
    ],
  );
  console.log(`\nDATABASE_URL (full, once):\n  ${h.clientUrl}\n`);
  console.log('Next, from docs/OPERATIONS.md:');
  console.log('  · set this DATABASE_URL and two fresh JWT secrets on the client instance (never reuse another client\'s keys)');
  console.log('  · point the subdomain at it, with automatic TLS');
  console.log('  · add the database to the backup schedule');
  console.log(`  · verify: GET https://<subdomain>/health, then sign in as ${h.ownerEmail}`);
  rule();
}
