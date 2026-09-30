/**
 * Constants shared by the load-test scripts.
 *
 * These live here, not in `loadtest-seed.ts`, because that script starts its
 * CLI at import time: importing a value from it would run the seeder's
 * argument parser (and reject the importing script's own flags).
 */

/** Where `loadtest:seed` records the scratch database for `loadtest:run` / `loadtest:drop`. */
export const HANDOFF_FILE = '.loadtest.json';
