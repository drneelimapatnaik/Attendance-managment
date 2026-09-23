/**
 * Typed access to build-time environment variables (see .env.example).
 * `apiUrl` empty ⇒ the app runs on the local demo store (no backend needed).
 */
export const env = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '',
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0',
  isProd: import.meta.env.PROD,
} as const;

export const useMockBackend = !env.apiUrl;
