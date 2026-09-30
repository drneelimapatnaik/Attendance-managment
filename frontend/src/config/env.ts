/**
 * Typed access to build-time environment variables (see .env.example).
 * `apiUrl` empty ⇒ the app runs on the local demo store (no backend needed).
 */

/** `"true"/"1"/"yes"` → true, `"false"/"0"/"no"` → false, anything else → undefined. */
function parseBool(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
}

export const env = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '',
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0',
  /** Unset ⇒ decided by `useMockBackend` (see `useDemoData`). */
  demoData: parseBool(import.meta.env.VITE_DEMO_DATA as string | undefined),
  isProd: import.meta.env.PROD,
} as const;

export const useMockBackend = !env.apiUrl;

/**
 * Whether first run generates the "Apex Academy" demo tenant.
 *
 * A real client's instance must start empty (docs/HOSTING.md: demo data only
 * when demo mode is on), so this switch exists to turn it off. Left unset it
 * follows the mock backend, which keeps today's local workflow unchanged:
 * no `VITE_API_URL` ⇒ demo tenant, a real backend ⇒ no generated data.
 * `VITE_DEMO_DATA=false` starts from an empty institute and the /setup wizard.
 */
export const useDemoData = env.demoData ?? useMockBackend;
