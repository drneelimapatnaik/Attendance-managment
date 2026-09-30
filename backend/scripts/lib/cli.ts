/**
 * Shared plumbing for the operator CLIs in `scripts/`.
 *
 * These scripts are run by a human on an ops box (`npm run client:create -- …`),
 * so they get a tiny argument parser, a table printer and a consistent way to
 * fail: print one readable line and exit non-zero. No dependency is added for
 * this — every ops command must keep working on a machine where only the
 * project's existing devDependencies are installed.
 *
 * Argument style is GNU-ish and deliberately dumb: `--flag`, `--key value`,
 * `--key=value`. Unknown flags are an error rather than a silent no-op, because
 * a typo in `--yes-really` must never read as "yes".
 */

export interface ParsedArgs {
  /** Long flags, in the order they appeared. `true` for a boolean flag. */
  readonly flags: ReadonlyMap<string, string | true>;
  /** Anything that was not a flag (unused today; reserved for subcommands). */
  readonly positionals: readonly string[];
}

/** Raised for anything the operator can fix by re-typing the command. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/**
 * Parses `process.argv.slice(2)`. `known` is the complete set of accepted flag
 * names; passing anything else is an error so that `--yes-realy` cannot quietly
 * mean "no confirmation given".
 */
export function parseArgs(argv: readonly string[], known: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  const allowed = new Set(known);

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf('=');
    const name = eq === -1 ? body : body.slice(0, eq);
    if (!allowed.has(name)) {
      throw new CliError(`Unknown option --${name}.`, `Accepted options: ${[...allowed].map((k) => `--${k}`).join(', ')}`);
    }

    if (eq !== -1) {
      flags.set(name, body.slice(eq + 1));
      continue;
    }

    // `--key value`, unless the next token is another flag (then it is a boolean).
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }

  return { flags, positionals };
}

/** A required string option. */
export function requireOption(args: ParsedArgs, name: string): string {
  const value = args.flags.get(name);
  if (typeof value !== 'string' || value.trim() === '') throw new CliError(`--${name} is required.`);
  return value.trim();
}

/** An optional string option. */
export function option(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** A boolean flag: present (with or without a value) means true. */
export function hasFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (value === true) return true;
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

/** An optional integer option, validated against an inclusive range. */
export function intOption(args: ParsedArgs, name: string, fallback: number, min: number, max: number): number {
  const raw = option(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CliError(`--${name} must be a whole number between ${min} and ${max} (got "${raw}").`);
  }
  return value;
}

/** A required environment variable. */
export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') throw new CliError(`${name} is not set.`, hint ?? `Add ${name} to your environment or .env (see .env.example).`);
  return value.trim();
}

// ------------------------------------------------------------------ output

const RULE = '─'.repeat(78);

export function heading(text: string): void {
  console.log(`\n${text}\n${RULE}`);
}

export function rule(): void {
  console.log(RULE);
}

export function step(text: string): void {
  console.log(`  · ${text}`);
}

export function warn(text: string): void {
  console.warn(`  ! ${text}`);
}

/**
 * Prints a fixed-width table. Column widths come from the content, so a table of
 * twenty clients still lines up in a terminal log or a pasted email.
 */
export function printTable(headers: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)));
  const line = (cells: readonly string[]): string => cells.map((cell, i) => (cell ?? '').padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
}

/** Milliseconds as a short human string: `842 ms`, `3.4 s`, `2 m 11 s`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} m ${Math.round((ms % 60_000) / 1000)} s`;
}

/** `1234567` → `1,234,567`. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Wraps a CLI's main function: prints CliErrors as one line, anything else with a
 * stack, and always exits with a meaningful code.
 */
export function runCli(name: string, main: () => Promise<void>): void {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error: unknown) => {
      if (error instanceof CliError) {
        console.error(`\n${name}: ${error.message}`);
        if (error.hint) console.error(`  ${error.hint}`);
      } else {
        console.error(`\n${name} failed:`);
        console.error(error);
      }
      process.exit(1);
    });
}

/**
 * Hides the password in a connection string so a URL can be logged.
 * `postgresql://user:secret@host:5432/db` → `postgresql://user:***@host:5432/db`
 */
export function redactUrl(url: string): string {
  return url.replace(/:\/\/([^:/@]+):[^@]*@/, '://$1:***@');
}
